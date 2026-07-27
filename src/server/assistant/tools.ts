/**
 * What Atlasy is allowed to do.
 *
 * Every tool is an ordinary call to Atlas's own HTTP API, made with the
 * signed-in person's cookies. That is the whole security design: the assistant
 * has no privileges of its own and no direct database access, so a worker who
 * asks it to create a role is refused by exactly the same route that refuses
 * the button in the interface. There is no second set of permission checks to
 * drift out of step with the first.
 *
 * The allowlist matters too. The model chooses a tool *name*, never a URL, so
 * it cannot reach an endpoint that is not listed here however it is prompted.
 */
import { env } from '../env';

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments, as the OpenAI tool-calling format expects. */
  parameters: Record<string, unknown>;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** `:param` segments are filled from the arguments; the rest become body or query. */
  path: string;
}

const str = (description: string) => ({ type: 'string', description });

export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_people',
    description:
      'Find people who work at this company, by name, job title or skill. Use this to turn a name into the membership id other tools need. It only searches staff — customers and clients are not in here, so an empty result usually means the name is not a colleague.',
    method: 'GET',
    path: '/api/people',
    parameters: {
      type: 'object',
      properties: { search: str('Part of a name, job title or skill. Omit to list everyone.') },
    },
  },
  {
    name: 'list_teams',
    description: 'List the teams in the company.',
    method: 'GET',
    path: '/api/organization/teams',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_roles',
    description: 'List the company’s named roles, with their colours and hierarchy.',
    method: 'GET',
    path: '/api/roles',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_tasks',
    description:
      'List tasks. Use the scope argument to narrow to what is overdue, unassigned, or assigned to a particular person.',
    method: 'GET',
    path: '/api/tasks',
    parameters: {
      type: 'object',
      properties: {
        search: str('Words to match in the task title.'),
        status: {
          type: 'string',
          enum: ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_REVIEW', 'DONE'],
        },
        assigneeId: str('Membership id from search_people.'),
        includeDone: { type: 'boolean' },
      },
    },
  },
  {
    name: 'create_task',
    description:
      'Create a task. assigneeId must be a real membership id from search_people, or the membership id of the person you are talking to when they say "me" or "mine". If you cannot find the person they named, STOP and ask who they mean — never guess, and never assign it to somebody else. Omit assigneeId entirely to leave the task unassigned, which is how work is left for anyone to pick up.',
    method: 'POST',
    path: '/api/tasks',
    parameters: {
      type: 'object',
      required: ['title'],
      properties: {
        title: str('Short imperative title, e.g. "Restock the supply cupboard".'),
        description: str('Optional detail.'),
        assigneeId: str('Membership id from search_people. Omit to leave unassigned.'),
        teamId: str('Team id from list_teams.'),
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        dueAt: str('ISO 8601 date-time, e.g. 2026-08-01T17:00:00Z.'),
        location: str('Where the work happens.'),
        requiresApproval: {
          type: 'boolean',
          description: 'True if a manager must sign it off rather than it going straight to done.',
        },
      },
    },
  },
  {
    name: 'create_role',
    description:
      'Create a named company role with a colour. Owners and managers only. Roles describe position and grant no access.',
    method: 'POST',
    path: '/api/roles',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: str('The role name, e.g. "Dispatcher".'),
        color: str('Hex colour like #1f6feb.'),
        description: str('What the role is responsible for.'),
        parentId: str('Role id this one reports into, from list_roles.'),
        isDefault: { type: 'boolean', description: 'Give this role to new joiners.' },
      },
    },
  },
  {
    name: 'assign_role',
    description: 'Give somebody one of the company’s roles. Owners and managers only.',
    method: 'PATCH',
    path: '/api/people/:id/assigned-role',
    parameters: {
      type: 'object',
      required: ['id', 'roleId'],
      properties: {
        id: str('Membership id of the person, from search_people.'),
        roleId: str('Role id from list_roles, or null to clear their role.'),
      },
    },
  },
  {
    name: 'company_overview',
    description:
      'Counts of people, teams, active tasks, overdue tasks and unassigned tasks. Good for "how are we doing" questions.',
    method: 'GET',
    path: '/api/organization/graph',
    parameters: { type: 'object', properties: {} },
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export interface ToolResult {
  ok: boolean;
  status: number;
  data: unknown;
}

/**
 * Runs one tool as the signed-in person.
 *
 * The request goes to this same server over loopback carrying their cookie, so
 * authentication, authorisation, validation and rate limiting all happen in the
 * places that already own them.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  cookie: string,
): Promise<ToolResult> {
  const tool = BY_NAME.get(name);
  if (!tool) {
    return { ok: false, status: 400, data: { error: `No such tool: ${name}` } };
  }

  // Fill `:param` segments, and keep whatever is left for the body or query.
  const rest: Record<string, unknown> = { ...args };
  const path = tool.path.replace(/:([a-zA-Z]+)/g, (_match, key: string) => {
    const value = rest[key];
    delete rest[key];
    return encodeURIComponent(String(value ?? ''));
  });

  let url = `http://127.0.0.1:${env.PORT}${path}`;
  let body: string | undefined;

  if (tool.method === 'GET') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const qs = query.toString();
    if (qs) url += `?${qs}`;
  } else {
    body = JSON.stringify(rest);
  }

  try {
    const response = await fetch(url, {
      method: tool.method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      data: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** The tool list in the shape the chat completions API expects. */
export function toolSchemas() {
  return TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}
