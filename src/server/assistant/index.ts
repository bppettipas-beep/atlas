/**
 * Atlasy — the in-app assistant.
 *
 * Speaks to any OpenAI-compatible chat completions endpoint, which is why
 * there is no vendor SDK here: Google AI Studio, Groq, OpenRouter and Cerebras
 * all serve the same shape, so switching provider is one environment variable
 * rather than a rewrite.
 *
 * It has no privileges. Every action it takes is an ordinary API call carrying
 * the signed-in person's cookies — see `tools.ts`.
 */
import { env } from '../env';
import { ApiError } from '../http/errors';
import { TOOLS, runTool, toolSchemas } from './tools';

/** How many times the model may call tools before we make it answer. */
const MAX_ROUNDS = 5;
/** Do not leave a browser request open forever when a model provider stalls. */
const COMPLETION_TIMEOUT_MS = 30_000;
/** Ceiling on one reply. See the note where it is sent. */
const MAX_OUTPUT_TOKENS = 1_500;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
}

/** A tool the assistant actually ran, surfaced so the panel can show its work. */
export interface ToolTrace {
  name: string;
  ok: boolean;
  summary: string;
}

function systemPrompt(context: {
  fullName: string;
  role: string;
  companyName: string;
  membershipId: string;
  today: string;
}) {
  return [
    'You are Atlasy, the assistant inside Atlas — an operating system for small businesses.',
    '',
    `You are talking to ${context.fullName}, whose access level is ${context.role}, at ${context.companyName}. Today is ${context.today}.`,
    `Their own membership id is ${context.membershipId}. When they say "me", "my" or "mine", that is the id to use — do not look it up.`,
    '',
    'How to behave:',
    '- Be brief. These are busy people on a shop floor, not readers of documentation.',
    '- Do not use a tool unless the message actually needs one. "Hi", "thanks", "what can you do" and anything else conversational gets a one-line reply and no tool call at all. Reaching for a tool to answer a greeting is always wrong.',
    '',
    'Answering questions — this matters more than anything else here:',
    '- When somebody asks for information, GIVE THEM THE INFORMATION. Write out the names, the titles, the dates, the numbers you got back.',
    '- Never describe what you did instead of answering. "I listed the people in your company" is a failure — it tells them nothing they did not already know. Write the list.',
    '- More than two things? One per line, name first, detail after a dash. No preamble, no "here is a list of", no closing summary.',
    '- Nothing came back? Say what is not there: "Nobody is overdue." Not "I checked the tasks."',
    '',
    'When you change something — and only then — say in one short sentence what changed.',
    '',
    'How to talk:',
    '- Talk like a colleague, not a system. "hyd" means how are you doing; "rq" means real quick; "bro where" means they cannot see what they asked for. Read them the way a person would and answer.',
    '- Never announce that you did nothing, and never tell somebody their message "does not make sense". If you genuinely cannot tell what they want, ask — one short question.',
    '- Never mention your tools, functions, ids, lookups or anything else about how you work. The person does not know those exist and does not need to. Say "I could not find anyone called Jenna", never "she was not found in search_people".',
    '- Never lecture, moralise, or comment on whether a request is appropriate. This is their business, not yours; they know what their company does. Do what is asked, or say plainly that you cannot and why.',
    '- Do not add caveats, disclaimers or observations nobody asked for. If it does not change what happens next, leave it out.',
    '',
    'Before creating a task:',
    '- You need three things: what the work is, who is doing it, and when it is due. If any are missing, ask for all of them in one short message — not one question at a time, and not after you have already created it.',
    '- If they tell you the deadline does not matter, create it with no due date. Do not keep asking.',
    '- Useful to ask about only when it fits: where the work happens, and whether a manager needs to sign it off.',
    '- Names are not ids. Look the person up to turn "Theo" into the id you need, before creating anything.',
    '',
    'Rules you must not break:',
    '- Only colleagues can be searched. Customers, clients, sites and buildings are not in there, and a job named after a client — "clean Jenna\'s house" — is perfectly normal work. If a name is not a colleague, it is the customer, not the person doing the job: use it in the title and ask who should do the work.',
    '- Never invent an id, a person, a task, a date or a number. If a tool did not return it, you do not know it.',
    '- Do not repeat an action you have already completed in this conversation. Before creating anything, check whether you already created it a moment ago; if so, say it already exists instead of making a second one.',
    '- You have exactly this person\'s permissions and no more. If a tool comes back forbidden, say they do not have access and that an owner or manager does — do not try another route.',
    '- You cannot see or change anything outside this company.',
    '',
    'When you cannot do something:',
    '- Atlas has no concept of "claiming" a task. Work left for anyone to pick up is simply a task with no assignee. Say that, rather than pretending.',
    '- If there is no tool for what they asked, say plainly that you cannot do it and what they can do in the interface instead. Do not substitute a different action you *can* do.',
  ].join('\n');
}

interface Completion {
  choices: { message: ChatMessage; finish_reason?: string }[];
  error?: { message?: string };
}

async function complete(messages: ChatMessage[]): Promise<ChatMessage> {
  let response: Response;
  try {
    response = await fetch(`${env.ASSISTANT_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ASSISTANT_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.ASSISTANT_MODEL,
        messages,
        tools: toolSchemas(),
        tool_choice: 'auto',
        temperature: 0.2,
        // Anthropic's API requires an output cap, unlike most OpenAI-compatible
        // providers, so it is sent to all of them. Generous enough for a long
        // list of people, tight enough that a looping model cannot run up a
        // bill on output tokens, which cost several times what input does.
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });
  } catch {
    throw ApiError.badRequest(
      'Atlasy could not reach its model provider. Try again in a moment.',
      'ASSISTANT_UNAVAILABLE',
    );
  }

  if (!response.ok) {
    const detail = await response.text();
    console.error('[atlas] assistant provider error:', response.status, detail.slice(0, 500));
    // The provider's message can name the model or the key, so it is logged
    // rather than forwarded.
    throw ApiError.badRequest(
      response.status === 429
        ? 'Atlasy is rate limited right now. Try again in a moment.'
        : 'Atlasy could not reach its model provider. Check the API key and model name.',
      'ASSISTANT_UNAVAILABLE',
    );
  }

  const payload = (await response.json()) as Completion;
  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw ApiError.badRequest('Atlasy got an empty reply from its provider.', 'ASSISTANT_EMPTY');
  }
  return message;
}

/** One short sentence describing what a tool call did, for the panel. */
function describe(name: string, ok: boolean, data: unknown): string {
  if (!ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? ((data as { error?: { message?: string } }).error?.message ?? 'failed')
        : 'failed';
    return message;
  }
  if (name === 'create_task' && typeof data === 'object' && data && 'title' in data) {
    return `Created “${(data as { title: string }).title}”`;
  }
  if (name === 'create_role' && typeof data === 'object' && data && 'name' in data) {
    return `Created the role “${(data as { name: string }).name}”`;
  }
  if (name === 'assign_role') return 'Role assigned';
  if (name === 'remove_person') return 'Removed from the company';
  return 'Looked it up';
}

export async function runAssistant(options: {
  history: ChatMessage[];
  cookie: string;
  context: { fullName: string; role: string; companyName: string; membershipId: string };
}): Promise<{ reply: string; actions: ToolTrace[] }> {
  if (!env.assistantEnabled) {
    throw ApiError.badRequest('Atlasy is not configured on this instance.', 'ASSISTANT_DISABLED');
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt({
        ...options.context,
        today: new Date().toISOString().slice(0, 10),
      }),
    },
    ...options.history,
  ];

  const actions: ToolTrace[] = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const message = await complete(messages);
    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      return { reply: message.content?.trim() || 'Done.', actions };
    }

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // A malformed argument blob is the model's mistake to recover from, so
        // hand the parse failure back rather than aborting the conversation.
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: 'Arguments were not valid JSON.' }),
        });
        continue;
      }

      const result = await runTool(call.function.name, args, options.cookie);

      // Report what changed, plus anything that failed — a refused lookup is
      // worth seeing. A successful read is not: it is how it thinks.
      const mutates = TOOLS.find((tool) => tool.name === call.function.name)?.mutates ?? false;
      if (mutates || !result.ok) {
        actions.push({
          name: call.function.name,
          ok: result.ok,
          summary: describe(call.function.name, result.ok, result.data),
        });
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({ ok: result.ok, status: result.status, data: result.data }).slice(
          0,
          12_000,
        ),
      });
    }
  }

  return {
    reply:
      'That turned into more steps than I can take in one go. Tell me the next single thing you want done.',
    actions,
  };
}
