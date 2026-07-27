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
import { runTool, toolSchemas } from './tools';

/** How many times the model may call tools before we make it answer. */
const MAX_ROUNDS = 5;
/** Do not leave a browser request open forever when a model provider stalls. */
const COMPLETION_TIMEOUT_MS = 30_000;

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
    '- If the request is unambiguous, just do it. If something is genuinely missing, ask one short question — not a list.',
    '- Names are not ids. Call search_people to turn "Theo" into a membership id before using it.',
    '- After you act, say in one sentence what you did.',
    '',
    'Rules you must not break:',
    '- Only people who work here are in search_people. Customers, clients, sites and buildings are not. If a name is not found, it is almost certainly a client, not a colleague — say so and ask who should do the work. Never treat a client as an assignee.',
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
      actions.push({
        name: call.function.name,
        ok: result.ok,
        summary: describe(call.function.name, result.ok, result.data),
      });

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
