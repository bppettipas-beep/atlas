# Atlas

**The operating system for your business.**

Atlas holds the people, knowledge, tasks and processes that make a small company
run — and draws the lines between them. An owner opens it and can see who works
here, what each person owns, what is late, what is blocked, and what changed
this week. A worker opens it and sees exactly what to do today.

It is one deployable TypeScript app: an Express + Socket.IO API that also serves
the React front end, with PostgreSQL as the only source of truth.

---

## Contents

- [What is in the box](#what-is-in-the-box)
- [Tech](#tech)
- [Running it locally](#running-it-locally)
- [Demo accounts](#demo-accounts)
- [Everyday commands](#everyday-commands)
- [Project layout](#project-layout)
- [Database and migrations](#database-and-migrations)
- [Testing](#testing)
- [Deploying to Railway](#deploying-to-railway)
- [Environment variables](#environment-variables)
- [Google sign-in](#google-sign-in)
- [Notification email](#notification-email)
- [Design notes](#design-notes)
- [Not built yet](#not-built-yet)

---

## What is in the box

**Organization Map** — the default screen for an owner. A React Flow canvas
drawn like an engineering schematic. Every person and team is a node; the lines
between them are computed from your real data:

| Line                 | Where it comes from                                   |
| -------------------- | ----------------------------------------------------- |
| Reports to           | `Membership.managerId`                                |
| Team                 | Team membership                                       |
| Shared skill         | Two people holding the same skill                     |
| Owns area            | A person who owns a knowledge document tied to a team |
| Works with / Mentors | Drawn by hand by an owner or manager                  |

Reporting, team, skill and ownership lines are **derived on every read**, so
they can never drift out of sync with the data. Only hand-drawn relationships
are stored. Node positions _are_ stored — an owner drags the map into a shape
that makes sense and everybody sees that layout.

**People** — profiles with what each person owns, skills with levels,
certifications, workload, active and completed work, an activity timeline,
onboarding steps, and manager-only private notes that the subject cannot see.

**Work** — tasks with priority, due dates, assignee, team, location, a linked
process document, subtask checklists with automatic progress, comments with
@mentions, file and photo attachments, and five statuses. A task can require a
**completion photo** or **manager approval** before it counts as done, and a
worker who marks something **Blocked** must say why — which immediately notifies
their manager and the owner. Overdue work escalates on its own.

**Knowledge Base** — the "how we do things" documents: procedures, checklists,
customer rules, safety steps, company values. Markdown, tags, an owner, a
linked team, full version history with restore, and read acknowledgments. Edit a
required document and the acknowledgments clear, so people re-read it.

**Activity** — the company's memory. A filterable timeline of everything that
changed. Manager-only events (escalations, deactivations, invitation use) never
reach a worker, and that is enforced in the database query, not in the UI.

**Invitations** — generate a code, set an expiry and a use limit, copy it in one
click, watch the use count, deactivate or regenerate it, or create a single-use
invitation tied to one email address.

**Real time** — Socket.IO rooms keyed by company. The map, task lists, comments,
activity feed and notifications update without a refresh. Owner-only broadcasts
go to a separate leadership room so worker clients never receive them.

**My Day** — the worker's home. Today's work grouped by urgency, one-tap
complete, report-a-blocker, their manager and team, a read-only company map,
announcements, and the reading assigned to them.

---

## Tech

|           |                                                                                 |
| --------- | ------------------------------------------------------------------------------- |
| Front end | React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, `@xyflow/react`        |
| Icons     | Phosphor Light, inlined in `src/client/components/icons.tsx` — no icon runtime  |
| Back end  | Node, Express 4, Socket.IO, Zod                                                 |
| Database  | PostgreSQL via Prisma                                                           |
| Auth      | bcrypt + JWT access token and rotating refresh token, both in HTTP-only cookies |
| Tests     | Vitest + Supertest against a real PostgreSQL                                    |

---

## Running it locally

You need **Node 20+**. You do _not_ need to install PostgreSQL or Docker.

```bash
git clone <your-repo-url>
cd Atlas
npm install

cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and set `JWT_SECRET` and `SESSION_SECRET` to any long random
strings. Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then start everything with one command:

```bash
npm run dev:all -- --fresh
```

That boots an **embedded PostgreSQL**, applies the schema, seeds the demo
company, and starts the API on <http://localhost:4000>.

In a second terminal, start the React dev server (hot reload):

```bash
npm run dev:client
```

Open <http://localhost:5173>.

> **What is the embedded PostgreSQL?** `npm run dev:all` runs PGlite — a real
> PostgreSQL build compiled to WebAssembly — and exposes it on port 5555 over
> the normal Postgres wire protocol, so Prisma talks to it exactly as it would
> to a server you installed. It is there so you can try Atlas in one command.
> It serves one connection at a time, which is fine for development and wrong
> for anything else. **Use a real PostgreSQL in production.**

Prefer your own PostgreSQL? Point `DATABASE_URL` at it and use the normal split
commands instead:

```bash
npm run db:migrate      # create the schema
npm run db:seed         # optional demo data
npm run dev             # API + React together
```

### If the embedded database will not start

It was almost certainly shut down uncleanly (a hard kill rather than Ctrl-C).
Delete its folder and start again:

```bash
rm -rf .pgdata          # PowerShell: Remove-Item -Recurse -Force .pgdata
npm run dev:all -- --fresh
```

---

## Demo accounts

`npm run db:seed` creates **Northstar Facilities** — a facilities and cleaning
company with 9 people, 3 teams, 12 tasks across every status, 7 knowledge
documents, recurring routines, announcements and a populated activity feed.

These are throwaway credentials for local development. **They are not real
accounts and must never be created on a deployed database.**

| Role                  | Email                          | Password        |
| --------------------- | ------------------------------ | --------------- |
| Owner                 | `owner@northstar.example.com`  | `AtlasDemo123!` |
| Manager (Operations)  | `marcus@northstar.example.com` | `AtlasDemo123!` |
| Manager (Maintenance) | `priya@northstar.example.com`  | `AtlasDemo123!` |
| Worker (lead cleaner) | `jonah@northstar.example.com`  | `AtlasDemo123!` |
| Worker (blocked task) | `sofia@northstar.example.com`  | `AtlasDemo123!` |
| Worker (night crew)   | `theo@northstar.example.com`   | `AtlasDemo123!` |

Active invitation code: **`NORTHSTAR`** — try it at <http://localhost:5173/join>
to watch a new worker appear on the map in real time.

Sign in as `owner@` and as `sofia@` in two browsers side by side. Block a task
as Sofia and watch the owner's notification bell.

---

## Everyday commands

| Command                           | What it does                                        |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev:all`                 | Embedded database + API in one process              |
| `npm run dev:all -- --fresh`      | Same, but wipes and re-seeds first                  |
| `npm run dev`                     | API + Vite together (needs your own `DATABASE_URL`) |
| `npm run dev:client`              | Vite dev server only, on :5173                      |
| `npm run dev:server`              | API only, with reload                               |
| `npm run build`                   | Build the React app and compile the server          |
| `npm start`                       | Run migrations, then start the production server    |
| `npm test`                        | Run the test suite                                  |
| `npm run typecheck`               | Typecheck client and server                         |
| `npm run lint` / `npm run format` | ESLint / Prettier                                   |
| `npm run check`                   | Typecheck + lint + test                             |
| `npm run db:migrate`              | Create and apply a migration in development         |
| `npm run db:deploy`               | Apply existing migrations (what production runs)    |
| `npm run db:seed`                 | Seed the demo company                               |
| `npm run db:studio`               | Browse the database in Prisma Studio                |

---

## Project layout

```
prisma/
  schema.prisma            all models, enums, indexes
  migrations/              SQL migrations (this is what production applies)
  seed.ts                  the Northstar Facilities demo company
scripts/
  embedded-postgres.ts     PGlite over the Postgres wire protocol
  dev-stack.ts             database + schema + seed + API in one process
src/
  shared/types.ts          DTOs shared by the API and the React app
  server/
    index.ts               entry point
    app.ts                 Express assembly, CORS, security, static files
    env.ts                 environment parsing and validation
    auth/                  password hashing, tokens, cookies
    middleware/            authentication and role guards
    routes/                one file per API domain
    services/              activity, notifications, permissions, org graph,
                           task automation, scheduler, serializers
    realtime/io.ts         Socket.IO rooms and broadcast helpers
  client/
    components/ui/         the whole design system, one file
    components/icons.tsx   the icon set, one file
    components/            layout, org map, people, tasks, knowledge
    pages/                 one file per screen
    providers/             auth and realtime context
    lib/                   fetch wrapper, data hook, formatting
tests/                     API tests against a real PostgreSQL
```

### API

Everything is under `/api`, grouped by domain: `auth`, `companies`, `invites`,
`people`, `organization`, `tasks`, `knowledge`, `notifications`, `activity`,
`uploads`, plus `GET /api/health`.

Every request body and query string is validated with Zod. Every error comes
back in the same shape, so the client can always render something useful:

```json
{
  "error": {
    "code": "EXPIRED_INVITE",
    "message": "That invitation code has expired. Ask your manager for a new one.",
    "details": [{ "path": "password", "message": "Use at least 8 characters" }]
  }
}
```

### How authorisation works

Roles are `OWNER`, `MANAGER` and `WORKER`.

Every authenticated request resolves to a **membership** — one person inside one
company — and every query is scoped by that membership's `companyId`. Asking for
a record belonging to another company returns 404, not 403, because you should
not be able to learn that it exists.

The rules live in `src/server/services/permissions.ts` and run on the server.
The React app hides buttons a person cannot use, but that is a courtesy: the API
is the boundary, and the test suite proves it by driving a worker session
against every privileged endpoint.

---

## Database and migrations

The schema is `prisma/schema.prisma`. To change it:

```bash
# edit the schema, then
npm run db:migrate -- --name describe_your_change
```

That writes a new folder under `prisma/migrations/` — commit it. Production runs
`prisma migrate deploy`, which only applies migrations that already exist and
never resets or drops anything.

Tenancy is enforced by structure: `Company` owns everything, and a `Membership`
is the identity that tasks, comments, documents and teams point at — so one
login can belong to several companies without duplicating the account.

Soft deletes are used only where history matters: memberships, tasks, teams,
documents and comments. Everything else is deleted for real.

---

## Testing

```bash
npm test
```

The suite boots its own throwaway PostgreSQL on port 5556 in a separate data
directory, applies the schema, and runs the API through Supertest with real
cookies. It never touches your development database.

34 tests cover the flows that would hurt most if they broke:

- **Owner sign-up** — user, company, owner membership, Leadership team and map
  node all created; passwords stored as bcrypt hashes and never in plain text;
  duplicate emails and weak passwords rejected with the right field named.
- **Worker join by invitation code** — a valid code joins and lands on the map
  with a manager; team codes set the team and the reporting line; unknown,
  deactivated, expired and fully-used codes each produce their own error.
- **Task assignment** — assigning notifies the assignee and records activity;
  checklist progress; blocking requires a reason and escalates to the manager;
  approval-required work goes to review rather than done; a required completion
  photo is enforced; mentions notify the person mentioned.
- **Role-based access protection** — workers cannot read invitation codes,
  assign work to others, move the map, change roles or reporting lines, edit a
  colleague's profile, or see manager-only notes and activity; one company can
  never read another's records; the last owner cannot demote themselves;
  signing out invalidates the cookies.

To run against your own database instead:

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/atlas_test" npm test
```

---

## Deploying to Railway

Atlas deploys as **one service plus one database**.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Atlas"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules`, `dist`, `uploads` and the
embedded database folders. **Do not commit `.env`.**

### 2. Create the project

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo**.
2. Pick the repository. Railway detects the `Dockerfile` and builds it.

### 3. Add PostgreSQL

In the same project: **+ New** → **Database** → **Add PostgreSQL**.

### 4. Set the variables

On the **app** service → **Variables**:

| Variable         | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`   | `${{Postgres.DATABASE_URL}}` — type this reference exactly; Railway links the two services |
| `JWT_SECRET`     | a long random string **you** generate                                                      |
| `SESSION_SECRET` | a **different** long random string you generate                                            |
| `NODE_ENV`       | `production`                                                                               |
| `APP_ORIGIN`     | your public URL, e.g. `https://atlas-production.up.railway.app`                            |

Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> Use secrets you generated yourself. Never reuse the placeholders from
> `.env.example`, and never reuse the same string for both.

Do **not** set `PORT` — Railway injects it and the server reads it.

### 5. Generate the domain

App service → **Settings** → **Networking** → **Generate Domain**. Copy the URL
into `APP_ORIGIN` and redeploy.

Because the API and the React app are served from that one origin, CORS is a
no-op in production and the cookies are plain `SameSite=Lax` first-party
cookies — no third-party cookie problems, no CORS debugging.

### 6. First deploy

The start command is:

```
prisma migrate deploy && node dist/server/index.js
```

Migrations run automatically on every deploy. `migrate deploy` only applies
migrations that exist in `prisma/migrations/` — it never resets your data.

Check <https://your-app.up.railway.app/api/health>:

```json
{ "status": "ok", "service": "atlas", "database": "connected" }
```

Then open the site and create your owner account. **Do not seed the demo data on
a production database** — those are public credentials.

### Attachments

Uploads are written to `UPLOAD_DIR` (`/app/uploads` in the image). A Railway
container's filesystem is wiped on redeploy, so if you want attachments to
survive: app service → **Settings** → **Volumes** → mount one at `/app/uploads`.

### Cost note

The app service and the PostgreSQL service are billed separately.

---

## Environment variables

Every variable is documented in `.env.example`. The ones that matter:

| Variable                     | Required    | Notes                                                               |
| ---------------------------- | ----------- | ------------------------------------------------------------------- |
| `DATABASE_URL`               | **yes**     | PostgreSQL connection string                                        |
| `JWT_SECRET`                 | **yes**     | Signs access tokens. 16+ characters, generated by you               |
| `SESSION_SECRET`             | **yes**     | Hashes refresh tokens before storage. Must differ from `JWT_SECRET` |
| `NODE_ENV`                   | production  | Set to `production` on Railway                                      |
| `APP_ORIGIN`                 | recommended | Public URL. Used for CORS and invitation links                      |
| `PORT`                       | no          | Injected by Railway; defaults to 4000 locally                       |
| `UPLOAD_DIR`                 | no          | Where attachments are written                                       |
| `MAX_UPLOAD_MB`              | no          | Upload size limit, default 10                                       |
| `ACCESS_TOKEN_TTL`           | no          | Access-token lifetime, default `15m`                                |
| `REFRESH_TOKEN_TTL_DAYS`     | no          | Refresh-token lifetime, default 30                                  |
| `COOKIE_SECURE`              | no          | Forced on when `NODE_ENV=production`                                |
| `SCHEDULER_INTERVAL_SECONDS` | no          | Overdue escalation and recurring tasks. `0` disables                |
| `CORS_ORIGINS`               | no          | Extra allowed origins, comma separated                              |
| `AUTH_RATE_LIMIT`            | no          | Credential attempts per IP per 15 min, default 40                   |
| `GOOGLE_CLIENT_ID`           | no          | Enables Google sign-in. See below                                   |
| `GOOGLE_CLIENT_SECRET`       | no          | Enables Google sign-in. See below                                   |
| `RESEND_API_KEY`             | no          | Enables email copies of in-app notifications. See below             |
| `EMAIL_FROM`                 | no          | Verified Resend sender, e.g. `Atlas <notifications@example.com>`    |
| `ASSISTANT_API_KEY`          | no          | Enables Atlasy, the in-app assistant. See below                     |
| `ASSISTANT_BASE_URL`         | no          | OpenAI-compatible endpoint. Defaults to Anthropic                   |
| `ASSISTANT_MODEL`            | no          | Model name, default `claude-haiku-4-5-20251001`                     |

The server validates all of this at startup and exits with a readable message
listing exactly what is missing, rather than failing on the first query.

---

## Google sign-in

Optional. With no credentials set, the "Continue with Google" button is not
rendered at all — the app never offers a route it cannot complete.

### Setting it up

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. Create a project if you do not have one.
3. **Configure the consent screen** (once): External, fill in the app name and
   your support email. While it stays in _Testing_ only accounts you list as
   test users can sign in, so publish it when you are ready for your staff.
4. **Create credentials → OAuth client ID → Web application.**
5. Under **Authorised redirect URIs**, add the callback for every origin you
   use. It must match exactly, including the scheme and any port:

   ```
   http://localhost:5173/api/auth/google/callback
   https://your-app.up.railway.app/api/auth/google/callback
   ```

6. Copy the client ID and client secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` — in `.env` locally, and as Railway variables in
   production. **Never commit the secret.**
7. Make sure `APP_ORIGIN` matches the origin you registered. The callback URL
   is derived from it, so a mismatch produces Google's `redirect_uri_mismatch`
   error.

### What it does

- **Signing in.** Matches on Google's stable subject id first, then on email.
  An existing password account is linked to Google the first time it is used,
  so both routes then work for the same person.
- **Signing up.** Google confirms who someone is, but not which company they
  belong to. A new person is handed a short-lived signed grant and sent to the
  normal sign-up screen with their name, email and photo already filled in;
  they only have to name their company, or enter an invitation code.
- **Passwords.** Google never provides one. Such an account has no password
  until the person sets one under **Account → Set a password**, which adds a
  second way in rather than replacing Google. Trying to sign in with a password
  on a Google-only account says so plainly instead of "wrong password".
- **Photos.** Google's picture is used only when the person has not already set
  an avatar in Atlas. What they chose here outranks what Google has.

### What is checked

- `state` is HMAC-signed, so the intent and any invitation code cannot be
  altered during the round trip, and is bound to a nonce cookie set on the way
  out (CSRF).
- The ID token's audience, issuer and expiry are verified. Its signature is not
  re-checked because it is received directly from Google's token endpoint over
  TLS in exchange for the client secret — the case Google documents as not
  needing it.
- An **unverified** Google email address is rejected outright. Accepting one
  would let somebody register an address they do not own and be handed the
  matching Atlas account.
- The grant cookie is signed and expires in 15 minutes. Identity fields are
  always read from it, never from the request body, so the browser cannot claim
  an address that Google did not confirm.

### Security

- Passwords are bcrypt hashed at 12 rounds. Plain text is never stored or logged.
- Access tokens are short-lived JWTs; refresh tokens are opaque random strings
  stored only as an HMAC, so a database leak cannot be replayed. Refresh tokens
  rotate on use, and changing a password revokes every other session.
- Both cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production, so
  JavaScript — and therefore XSS — cannot read them.
- Helmet sets a content security policy in production. Credential endpoints are
  rate limited. Uploads are restricted by MIME type and size and served with
  `X-Content-Type-Options: nosniff`.
- Knowledge documents are Markdown rendered by a small parser that HTML-escapes
  the whole document _before_ producing any tags, so a document cannot inject
  markup or script.

---

## Notification email

Optional, and off until both variables are set. Everything that reaches the
notification bell is also emailed: assignments, mentions, comments, blockers,
deadline changes, announcements, and — for owners and managers — the company
activity feed. Each email links straight to the task, document or person it is
about, not just to the app.

### Setting it up

1. Create an account at <https://resend.com> and add the domain you want to
   send from under **Domains**. Resend gives you DKIM and SPF records to add at
   your DNS provider; sending will not work until the domain shows as verified.
2. Create an API key at <https://resend.com/api-keys>. **Sending access** is
   enough — it never needs to read anything.
3. Set both variables. In `.env` locally, and as Railway variables in
   production:

   ```
   RESEND_API_KEY="re_..."
   EMAIL_FROM="Atlas <notifications@yourdomain.com>"
   ```

   `EMAIL_FROM` must be on the domain you verified in step 1. **Never commit
   the key.**

4. Make sure `APP_ORIGIN` is your real public URL. Every link in the email is
   built from it, so a wrong value sends your staff to localhost.

Without a domain of your own, Resend's `onboarding@resend.dev` sender works for
testing but only delivers to the address that owns the Resend account.

### What it does

- **One email per notification**, sent after the notification is committed. The
  send is never awaited by the request that triggered it, so a slow or failing
  mail provider cannot make Atlas feel slow, and cannot lose the in-app copy.
- **Respects the per-person switches.** The Notifications section of
  **Account settings** controls what is notified at all; a separate _Email me
  these too_ switch controls whether it also leaves the building. On by default.
  Every email carries a link back to that screen.
- **Never writes to a placeholder.** People added without an email address hold
  a `@placeholder.atlas.invalid` address, which is skipped rather than bounced.
- **Fails quietly.** A provider outage is logged, never surfaced as a request
  error, and never blocks the notification itself.

---

## Design notes

The full rationale is in [DESIGN.md](DESIGN.md); the product context is in
[PRODUCT.md](PRODUCT.md). The short version:

Atlas is **drafted, not decorated**. The interface is a working engineering
drawing of a company — paper ground, ink hairlines, condensed uppercase edge
lettering for anything that describes rather than says, and one annotation blue
used only where a draughtsman would actually make a mark.

Three rules govern every screen, and they are the ones to keep if you change
anything:

1. Separation comes from a hairline rule or a value step — **not a shadow**.
   Nothing floats except modals, drawers and menus.
2. Anything that _describes_ goes in the edge register (`.edge`), never body text.
3. Any number a person compares or reads aloud is set in the monospace.

Radii never exceed 3px. The Tailwind palette is **replaced**, not extended, so
there is no way to reach for a stock colour by accident. Everything visual lives
in three files: `tailwind.config.js` (tokens), `src/client/index.css` (base and
component classes) and `src/client/components/ui/index.tsx` (every primitive).

---

## Not built yet

Honest list of what a real deployment would want next:

- **Password reset.** Notification email is delivered through Resend, but a
  password-reset flow has not been added yet.
- **Object storage for uploads.** Files go to local disk. S3 or Cloudflare R2
  would remove the volume requirement.
- **Mobile app / offline mode.** The web app is responsive and works well on a
  phone, but a worker on a site with no signal cannot queue a completion.
- **Scheduled shifts and time tracking.** Atlas tracks tasks, not hours.
- **Reporting and exports.** No CSV export or trend charts yet.
- **Audit log export.** The activity feed is complete but cannot be exported.
- **Multi-factor authentication.**
