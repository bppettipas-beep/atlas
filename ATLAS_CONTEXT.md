# Atlas Product Context

## What Atlas is

Atlas is a web-based operating system for small businesses. It brings people, work, schedules, processes, communication, and operational visibility into one place. The product is designed for owners and managers who need a quick, reliable view of the business, while workers get a focused view of the work they need to complete.

Atlas is not a generic social network or a complicated enterprise suite. The goal is a clear, attractive, mobile-friendly workspace that helps a small company run day to day.

## Users and permissions

Atlas has four company permission levels:

| Role | Meaning |
| --- | --- |
| Owner | Full company control. Displayed in blue. |
| Co-owner | Same operating permissions as Owner. Displayed in yellow. |
| Manager | Can manage people, create/assign/manage tasks, schedule work, and see management information. Displayed in red. |
| Worker | Can view and complete work assigned to them, communicate, and update their own work. They cannot create, delete, assign, or broadly manage tasks. |

Leadership means Owner, Co-owner, or Manager.

Management-only areas include Activity, Knowledge Base, company metrics, and Atlasy's daily briefing. This restriction must exist in both the UI and server APIs.

## Major product areas

### Home

The Home dashboard shows the health of the business: people, due-today work, overdue and blocked work, completed work, announcements, and leadership actions. Leadership also sees Atlasy's daily briefing and company metrics, including work completion, scheduling load, company-chat activity, and workload by person.

### Work and tasks

Tasks can have a title, description, priority, assignee, team, due date, scheduled time, location, linked process document, subtasks, comments, attachments, and completion requirements.

Task statuses are Not Started, In Progress, Blocked, Awaiting Review, and Done. Some tasks require approval or proof photos before completion. Blocked tasks require a reason. Work assigned to a person is reflected in the Schedule.

Task deletion is destructive and needs confirmation. Atlasy must find the real task, show the exact title, wait for confirmation, and only report success when Atlas confirms the deletion.

### Schedule

The Schedule is a full-screen operational planner. It offers Day, Week, and Month views, plus a separate Company/Mine switch. Day and Week show the full 24-hour timeline fitted to the available screen rather than requiring an internal time scroll. Month shows a calendar overview of scheduled tasks.

Leadership can view the company schedule, filter or focus on crew members, create scheduled work, and drag tasks to move or resize bookings. Workers use Mine to see their own schedule.

### People and organization

Atlas has people profiles, company roles, reporting lines, skills, certifications, availability, workloads, and private manager notes. The Organization Map visualizes people and teams along with reporting and collaboration relationships.

Owners can appoint co-owners. Co-owners operate like owners but retain the visible Co-owner rank.

### Knowledge Base

The Knowledge Base stores internal procedures, checklists, policies, and company knowledge. Documents support Markdown, tags, ownership, teams, version history, acknowledgments, and links to related tasks. It is management-only.

### Activity and notifications

Activity records important company changes. Notifications update in real time and may later be emailed when outbound email is configured. Activity is management-only.

### Chat

Atlas includes company-wide chat, direct messages, and group conversations. Messages update live without reloading. Company chat displays timestamps. Atlasy can read and summarize company chat only; it cannot access private or group conversations. It can post to company chat only as the signed-in person and only after the user provides exact wording and asks it to send.

### Atlasy

Atlasy is Atlas's in-app AI assistant, represented by its compass-style symbol. It can help search people and tasks, create/manage/schedule work within the user's permissions, prepare confirmed deletions, summarize company chat, post approved company-chat messages, and provide leadership daily briefings and metrics.

Atlasy must never pretend an action succeeded. It should use normal language, tolerate small punctuation differences in task titles, and require explicit confirmation for destructive actions.

## Technical context

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion.
- Backend: Node.js, Express, Socket.IO, Zod.
- Database: PostgreSQL with Prisma.
- Authentication: bcrypt plus JWT access/refresh cookies.
- Realtime: Socket.IO company and leadership rooms.
- Hosting: Railway is the intended production deployment.

Important repository locations:

- `src/client/` — React application.
- `src/server/` — Express API, permissions, realtime, Atlasy tools.
- `src/shared/types.ts` — shared types and permission enums.
- `prisma/schema.prisma` — database schema.
- `tests/` — API tests.

Useful commands:

```bash
npm run dev:all -- --fresh
npm run typecheck
npm test
npm run build
```

## Product direction

Prioritize features that make operations easier: recurring work, forms/checklists, client-facing records, scheduling, approvals, inventory, automations, reporting, and useful AI summaries. Keep the UI visually refined but simple. Avoid crowding screens, especially on phones.

