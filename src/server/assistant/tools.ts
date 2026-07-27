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
  /**
   * Whether this changes anything. Only mutations are reported back to the
   * panel: a lookup is how the assistant thinks, not something it did, and
   * showing "Looked it up" for every read is noise the user cannot act on.
   */
  mutates?: boolean;
  /** Available to Atlasy's server flow but never offered to the language model. */
  internal?: boolean;
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
    mutates: true,
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
        startAt: str('Optional scheduled start as an ISO 8601 date-time.'),
        endAt: str(
          'Optional scheduled end as an ISO 8601 date-time. Required when startAt is set.',
        ),
        location: str('Where the work happens.'),
        requiresApproval: {
          type: 'boolean',
          description: 'True if a manager must sign it off rather than it going straight to done.',
        },
      },
    },
  },
  {
    name: 'delete_task',
    mutates: true,
    internal: true,
    description:
      'Permanently delete one task from Atlas. This is destructive. Only call after the user has explicitly confirmed the exact task in the immediately preceding message.',
    method: 'DELETE',
    path: '/api/tasks/:id/permanent',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: { id: str('Task id from list_tasks. Never invent this.') },
    },
  },
  {
    name: 'prepare_task_deletion',
    description:
      'Prepare deletion of one task after you have found its exact id. Call this instead of delete_task; Atlas will ask the user for confirmation and only then delete that exact task.',
    method: 'GET',
    path: '/api/tasks/:id',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: { id: str('Exact task id from list_tasks. Never invent this.') },
    },
  },
  {
    name: 'clear_all_tasks',
    mutates: true,
    description:
      'Permanently delete every active task in the company. Owners and managers only. This is a high-impact destructive action; only call after you have stated the number of tasks and the user explicitly confirmed clearing every task in their immediately preceding message.',
    method: 'DELETE',
    path: '/api/tasks',
    parameters: {
      type: 'object',
      required: ['confirmation'],
      properties: {
        confirmation: {
          type: 'string',
          enum: ['DELETE_ALL_TASKS'],
          description: 'Only use after explicit user confirmation.',
        },
      },
    },
  },
  {
    name: 'get_schedule',
    description:
      'Read scheduled work, availability and workload for a time window. Use this for questions such as what is on someone’s schedule, who is free, or when a team is available. `resources` is an optional comma-separated list of person membership ids or team ids.',
    method: 'GET',
    path: '/api/schedule',
    parameters: {
      type: 'object',
      required: ['from', 'to'],
      properties: {
        from: str('ISO 8601 start of the time window.'),
        to: str('ISO 8601 end of the time window.'),
        resources: str('Optional comma-separated person membership ids or team ids.'),
        status: str('Optional comma-separated task statuses.'),
        priority: str('Optional comma-separated task priorities.'),
        location: str('Optional location to filter by.'),
      },
    },
  },
  {
    name: 'check_schedule_conflicts',
    description:
      'Check whether a person is already booked or unavailable in a proposed time range. Use this before scheduling or moving work for a person.',
    method: 'GET',
    path: '/api/schedule/conflicts',
    parameters: {
      type: 'object',
      required: ['membershipId', 'startAt', 'endAt'],
      properties: {
        membershipId: str('Person membership id from search_people.'),
        startAt: str('Proposed ISO 8601 start date-time.'),
        endAt: str('Proposed ISO 8601 end date-time.'),
        ignoreTaskId: str('Task id to exclude when moving an existing task.'),
      },
    },
  },
  {
    name: 'schedule_task',
    mutates: true,
    description:
      'Schedule, reschedule, reassign, or remove a task from the schedule. The signed-in user’s normal schedule permissions are enforced by Atlas.',
    method: 'PATCH',
    path: '/api/schedule/tasks/:id',
    parameters: {
      type: 'object',
      required: ['id', 'startAt'],
      properties: {
        id: str('Task id from list_tasks or schedule results.'),
        startAt: {
          type: ['string', 'null'],
          description: 'ISO 8601 start, or null to remove the task from the schedule.',
        },
        endAt: {
          type: ['string', 'null'],
          description: 'ISO 8601 end. Required when startAt is a date-time.',
        },
        assigneeId: {
          type: ['string', 'null'],
          description: 'Optional person membership id to assign.',
        },
        teamId: { type: ['string', 'null'], description: 'Optional team id to assign.' },
        location: { type: ['string', 'null'], description: 'Optional location.' },
      },
    },
  },
  {
    name: 'report_time_off',
    mutates: true,
    description:
      'Report an unavailable period or time off for yourself. Managers may also do this for people they manage; Atlas enforces that permission.',
    method: 'POST',
    path: '/api/schedule/availability/:membershipId/time-off',
    parameters: {
      type: 'object',
      required: ['membershipId', 'startAt', 'endAt'],
      properties: {
        membershipId: str(
          'Your membership id for yourself, or a person id from search_people when permitted.',
        ),
        startAt: str('ISO 8601 start date-time.'),
        endAt: str('ISO 8601 end date-time.'),
        note: str('Optional short reason or note.'),
      },
    },
  },
  {
    name: 'create_role',
    mutates: true,
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
    mutates: true,
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
    name: 'remove_person',
    mutates: true,
    description:
      'Remove somebody from the company. Owners only. This is destructive and cannot be undone from here — always state the person’s full name and ask the user to confirm before calling it, and never call it in the same reply as the confirmation question.',
    method: 'DELETE',
    path: '/api/people/:id',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: { id: str('Membership id of the person, from search_people.') },
    },
  },
  {
    name: 'post_announcement',
    mutates: true,
    description:
      'Post a company-wide announcement. Owners and managers only. Use this only after the user has supplied the exact announcement title and message and asked you to publish it.',
    method: 'POST',
    path: '/api/companies/current/announcements',
    parameters: {
      type: 'object',
      required: ['title', 'body'],
      properties: {
        title: str('Short announcement headline.'),
        body: str('The complete announcement message to send to the company.'),
        pinned: {
          type: 'boolean',
          description: 'Keep this announcement at the top of the company feed.',
        },
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
  return TOOLS.filter((tool) => !tool.internal).map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}
