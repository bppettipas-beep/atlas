import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  STRONG_PASSWORD,
  createInviteCode,
  joinWithCode,
  signUpOwner,
  uniqueEmail,
  type Client,
} from './helpers';

let app: Express;
let prisma: typeof import('../src/server/prisma').prisma;

beforeAll(async () => {
  // Imported lazily so `tests/setup.ts` has already configured the environment
  // that `src/server/env.ts` validates on load.
  ({ prisma } = await import('../src/server/prisma'));
  const { createApp } = await import('../src/server/app');
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/* ========================================================================== */
/*  Owner sign-up and company creation                                        */
/* ========================================================================== */

describe('owner sign-up', () => {
  it('creates the user, the company, an owner membership and a Leadership team', async () => {
    const email = uniqueEmail('founder');
    const { session } = await signUpOwner(app, { email, companyName: 'Northwind Facilities' });

    expect(session.user.email).toBe(email);
    expect(session.company.name).toBe('Northwind Facilities');
    expect(session.company.slug).toBe('northwind-facilities');
    expect(session.membership.role).toBe('OWNER');

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: session.membership.id },
      include: { teamMemberships: { include: { team: true } }, profile: true, orgNode: true },
    });

    expect(membership.role).toBe('OWNER');
    expect(membership.profile).not.toBeNull();
    expect(membership.teamMemberships.map((tm) => tm.team.name)).toContain('Leadership');
    // The organization map must have a node for them from the very first login.
    expect(membership.orgNode).not.toBeNull();
  });

  it('never stores the password in plain text', async () => {
    const email = uniqueEmail('hash');
    await signUpOwner(app, { email, password: STRONG_PASSWORD });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toContain(STRONG_PASSWORD);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it('rejects a duplicate email address with a helpful message', async () => {
    const email = uniqueEmail('dupe');
    await signUpOwner(app, { email });

    const response = await request(app).post('/api/auth/owner-signup').send({
      fullName: 'Someone Else',
      email,
      password: STRONG_PASSWORD,
      companyName: 'Another Co',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(response.body.error.message).toMatch(/already uses that email/i);
  });

  it('rejects a weak password and names the field', async () => {
    const response = await request(app).post('/api/auth/owner-signup').send({
      fullName: 'Short Password',
      email: uniqueEmail('weak'),
      password: 'short',
      companyName: 'Weak Co',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.details.map((d: { path: string }) => d.path)).toContain('password');
  });

  it('signs in with the new credentials and rejects a wrong password', async () => {
    const email = uniqueEmail('signin');
    await signUpOwner(app, { email });

    const good = await request(app).post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    expect(good.status).toBe(200);
    expect(good.body.company).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email, password: 'not-it-at-all' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

/* ========================================================================== */
/*  Worker join by invitation code                                            */
/* ========================================================================== */

describe('worker join by invitation code', () => {
  let owner: Client;

  beforeAll(async () => {
    owner = await signUpOwner(app, { companyName: 'Invite Test Co' });
  });

  it('lets a worker join with a valid code and puts them on the map', async () => {
    const code = await createInviteCode(owner);
    const { response } = await joinWithCode(app, code, { fullName: 'Theo Banda' });

    expect(response.status).toBe(201);
    expect(response.body.company.id).toBe(owner.session.company.id);
    expect(response.body.membership.role).toBe('WORKER');

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: response.body.membership.id },
      include: { orgNode: true, notificationPreference: true },
    });
    expect(membership.orgNode).not.toBeNull();
    expect(membership.notificationPreference).not.toBeNull();
    // Nobody should be orphaned: they report to the owner by default.
    expect(membership.managerId).toBe(owner.session.membership.id);

    const invite = await prisma.inviteCode.findUniqueOrThrow({ where: { code } });
    expect(invite.useCount).toBe(1);
  });

  it('adds them to the team the code names, and reports to that team lead', async () => {
    const teamResponse = await owner.agent
      .post('/api/organization/teams')
      .send({ name: 'Night Crew', leadId: owner.session.membership.id });
    expect(teamResponse.status).toBe(201);

    const code = await createInviteCode(owner, { teamId: teamResponse.body.id });
    const { response } = await joinWithCode(app, code);
    expect(response.status).toBe(201);

    const memberships = await prisma.teamMembership.findMany({
      where: { teamId: teamResponse.body.id },
    });
    expect(memberships.map((m) => m.membershipId)).toContain(response.body.membership.id);
  });

  it('rejects an unknown code', async () => {
    const { response } = await joinWithCode(app, 'NOTACODE');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INVITE');
  });

  it('rejects a deactivated code', async () => {
    const code = await createInviteCode(owner);
    const invite = await prisma.inviteCode.findUniqueOrThrow({ where: { code } });
    await owner.agent.delete(`/api/invites/${invite.id}`).expect(200);

    const { response } = await joinWithCode(app, code);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INVITE');
  });

  it('rejects an expired code', async () => {
    const code = await createInviteCode(owner);
    await prisma.inviteCode.update({
      where: { code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const { response } = await joinWithCode(app, code);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('EXPIRED_INVITE');
    expect(response.body.error.message).toMatch(/expired/i);
  });

  it('rejects a code that has hit its use limit', async () => {
    const code = await createInviteCode(owner, { maxUses: 1 });
    await joinWithCode(app, code);

    const { response } = await joinWithCode(app, code);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('EXHAUSTED_INVITE');
  });

  it('tells somebody who already has an account to sign in instead', async () => {
    const email = uniqueEmail('existing');
    await signUpOwner(app, { email });

    const code = await createInviteCode(owner);
    const { response } = await joinWithCode(app, code, { email });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('previews the company name before asking for a password', async () => {
    const code = await createInviteCode(owner);
    const response = await request(app).get('/api/auth/invite-preview').query({ code });

    expect(response.status).toBe(200);
    expect(response.body.companyName).toBe('Invite Test Co');
    // The preview must not leak anything beyond what the holder already knows.
    expect(response.body).not.toHaveProperty('companyId');
  });
});

/* ========================================================================== */
/*  Task assignment                                                           */
/* ========================================================================== */

describe('task assignment', () => {
  let owner: Client;
  let workerAgent: ReturnType<typeof request.agent>;
  let workerMembershipId: string;

  beforeAll(async () => {
    owner = await signUpOwner(app, { companyName: 'Task Test Co' });
    const code = await createInviteCode(owner);
    const joined = await joinWithCode(app, code, { fullName: 'Lena Worker' });
    workerAgent = joined.agent;
    workerMembershipId = joined.response.body.membership.id;
  });

  it('assigns work, notifies the assignee and records the activity', async () => {
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const created = await owner.agent.post('/api/tasks').send({
      title: 'Deep clean the clinic reception',
      description: 'Quarterly deep clean.',
      priority: 'HIGH',
      dueAt,
      assigneeId: workerMembershipId,
      subtasks: ['Vents', 'Skirting boards', 'Floor buff'],
    });

    expect(created.status).toBe(201);
    expect(created.body.assignee.id).toBe(workerMembershipId);
    expect(created.body.subtasks).toHaveLength(3);
    expect(created.body.status).toBe('NOT_STARTED');

    const notifications = await prisma.notification.findMany({
      where: { recipientId: workerMembershipId, type: 'TASK_ASSIGNED' },
    });
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].title).toMatch(/Deep clean/);

    const events = await prisma.activityEvent.findMany({
      where: { taskId: created.body.id, type: 'TASK_CREATED' },
    });
    expect(events).toHaveLength(1);

    // The assignee can see it on My Day.
    const myDay = await workerAgent.get('/api/people/me/my-day');
    expect(myDay.status).toBe(200);
    const allMine = [...myDay.body.tasks.dueToday, ...myDay.body.tasks.upcoming];
    expect(allMine.map((t: { id: string }) => t.id)).toContain(created.body.id);
  });

  it('tracks progress as the assignee ticks the checklist off', async () => {
    const created = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Filter round', assigneeId: workerMembershipId, subtasks: ['A', 'B'] });

    const [first] = created.body.subtasks;
    await workerAgent
      .patch(`/api/tasks/${created.body.id}/subtasks/${first.id}`)
      .send({ done: true })
      .expect(200);

    const updated = await workerAgent.get(`/api/tasks/${created.body.id}`).expect(200);
    expect(updated.body.completionPercent).toBe(50);
  });

  it('requires an explanation before a task can be blocked, then escalates it', async () => {
    const created = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Replace the HVAC filters', assigneeId: workerMembershipId });

    const withoutReason = await workerAgent
      .patch(`/api/tasks/${created.body.id}/status`)
      .send({ status: 'BLOCKED' });
    expect(withoutReason.status).toBe(422);
    expect(withoutReason.body.error.details[0].path).toBe('blockedReason');

    const blocked = await workerAgent
      .patch(`/api/tasks/${created.body.id}/status`)
      .send({ status: 'BLOCKED', blockedReason: 'The filters are the wrong size.' });

    expect(blocked.status).toBe(200);
    expect(blocked.body.status).toBe('BLOCKED');
    expect(blocked.body.blockedReason).toBe('The filters are the wrong size.');
    // Escalation must be reflected in the response, not just in the database.
    expect(blocked.body.escalatedAt).not.toBeNull();

    const ownerAlerts = await prisma.notification.findMany({
      where: { recipientId: owner.session.membership.id, type: 'TASK_BLOCKED' },
    });
    expect(ownerAlerts.length).toBeGreaterThan(0);
  });

  it('sends work that needs sign-off to review instead of straight to done', async () => {
    const created = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Solo shift sign-off', assigneeId: workerMembershipId, requiresApproval: true });

    const finished = await workerAgent
      .patch(`/api/tasks/${created.body.id}/status`)
      .send({ status: 'DONE' });

    expect(finished.status).toBe(200);
    expect(finished.body.status).toBe('AWAITING_REVIEW');

    const approved = await owner.agent.post(`/api/tasks/${created.body.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('DONE');
    expect(approved.body.approvedBy.id).toBe(owner.session.membership.id);
  });

  it('refuses to mark a task done when a completion photo is required', async () => {
    const created = await owner.agent.post('/api/tasks').send({
      title: 'Photograph the finished floor',
      assigneeId: workerMembershipId,
      requiresProofPhoto: true,
    });

    const response = await workerAgent
      .patch(`/api/tasks/${created.body.id}/status`)
      .send({ status: 'DONE' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PROOF_REQUIRED');
  });

  it('notifies the people mentioned in a comment', async () => {
    const created = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Talk to me', assigneeId: workerMembershipId });

    const comment = await workerAgent.post(`/api/tasks/${created.body.id}/comments`).send({
      body: 'Can you order the part?',
      mentionIds: [owner.session.membership.id],
    });

    expect(comment.status).toBe(201);
    expect(comment.body.mentions).toHaveLength(1);

    const mentions = await prisma.notification.findMany({
      where: { recipientId: owner.session.membership.id, type: 'TASK_MENTIONED' },
    });
    expect(mentions.length).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/*  Role-based access protection                                              */
/* ========================================================================== */

describe('role-based access protection', () => {
  let owner: Client;
  let otherOwner: Client;
  let workerAgent: ReturnType<typeof request.agent>;
  let workerMembershipId: string;
  let secondWorkerMembershipId: string;

  beforeAll(async () => {
    owner = await signUpOwner(app, { companyName: 'RBAC Test Co' });
    otherOwner = await signUpOwner(app, { companyName: 'Unrelated Co' });

    const code = await createInviteCode(owner, { maxUses: 5 });
    const joined = await joinWithCode(app, code, { fullName: 'Jonah Worker' });
    workerAgent = joined.agent;
    workerMembershipId = joined.response.body.membership.id;

    const second = await joinWithCode(app, code, { fullName: 'Rosa Worker' });
    secondWorkerMembershipId = second.response.body.membership.id;
  });

  it('requires a session for protected routes', async () => {
    for (const path of ['/api/people', '/api/tasks', '/api/organization/graph', '/api/invites']) {
      const response = await request(app).get(path);
      expect(response.status, `${path} should require auth`).toBe(401);
    }
  });

  it('hides invitation codes from workers', async () => {
    await workerAgent.get('/api/invites').expect(403);
    await workerAgent.post('/api/invites').send({ role: 'WORKER' }).expect(403);
    await workerAgent.get('/api/invites/direct/list').expect(403);
  });

  it('stops a worker assigning work to somebody else', async () => {
    const response = await workerAgent
      .post('/api/tasks')
      .send({ title: 'Not mine to give', assigneeId: secondWorkerMembershipId });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/owners and managers/i);
  });

  it('lets a worker create work for themselves', async () => {
    const response = await workerAgent
      .post('/api/tasks')
      .send({ title: 'My own reminder', assigneeId: workerMembershipId });
    expect(response.status).toBe(201);
  });

  it('stops a worker rearranging the organization map', async () => {
    const graph = await workerAgent.get('/api/organization/graph').expect(200);
    const node = graph.body.nodes[0];

    const response = await workerAgent
      .patch('/api/organization/nodes/positions')
      .send({ positions: [{ id: node.id, x: 10, y: 10 }] });

    expect(response.status).toBe(403);
  });

  it('stops a worker changing roles, reporting lines or company settings', async () => {
    await workerAgent
      .patch(`/api/people/${workerMembershipId}/role`)
      .send({ role: 'OWNER' })
      .expect(403);

    await workerAgent
      .patch(`/api/people/${secondWorkerMembershipId}/manager`)
      .send({ managerId: null })
      .expect(403);

    await workerAgent.patch('/api/companies/current').send({ name: 'Hijacked' }).expect(403);
    await workerAgent.delete(`/api/people/${secondWorkerMembershipId}`).expect(403);
  });

  it('stops a worker editing a colleague’s profile but allows their own', async () => {
    await workerAgent
      .patch(`/api/people/${secondWorkerMembershipId}`)
      .send({ headline: 'I edited someone else' })
      .expect(403);

    await workerAgent
      .patch(`/api/people/${workerMembershipId}`)
      .send({ headline: 'Owns the downtown route', availability: 'BUSY' })
      .expect(200);
  });

  it('stops a worker setting fields only leadership may set, even on themselves', async () => {
    const response = await workerAgent
      .patch(`/api/people/${workerMembershipId}`)
      .send({ jobTitle: 'Chief Executive Officer' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FIELD_NOT_EDITABLE');
  });

  it('keeps manager-only notes out of a worker’s view of a profile', async () => {
    await owner.agent
      .post(`/api/people/${workerMembershipId}/notes`)
      .send({ body: 'Private management note.' })
      .expect(201);

    const asOwner = await owner.agent.get(`/api/people/${workerMembershipId}`).expect(200);
    expect(asOwner.body.notes).toHaveLength(1);

    const asWorker = await workerAgent.get(`/api/people/${workerMembershipId}`).expect(200);
    expect(asWorker.body.notes).toBeUndefined();
  });

  it('keeps manager-only activity out of the worker feed', async () => {
    const asOwner = await owner.agent.get('/api/activity').query({ limit: 100 }).expect(200);
    const asWorker = await workerAgent.get('/api/activity').query({ limit: 100 }).expect(200);

    const ownerTypes = asOwner.body.items.map((e: { type: string }) => e.type);
    const workerTypes = asWorker.body.items.map((e: { type: string }) => e.type);

    expect(ownerTypes).toContain('INVITE_CREATED');
    expect(workerTypes).not.toContain('INVITE_CREATED');
  });

  it('never lets one company read another company’s records', async () => {
    const theirTask = await otherOwner.agent
      .post('/api/tasks')
      .send({ title: 'Belongs to the other company' })
      .expect(201);

    await owner.agent.get(`/api/tasks/${theirTask.body.id}`).expect(404);
    await owner.agent.get(`/api/people/${otherOwner.session.membership.id}`).expect(404);

    const people = await owner.agent.get('/api/people').expect(200);
    const ids = people.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(otherOwner.session.membership.id);
  });

  it('will not let the only owner give away their own ownership', async () => {
    const response = await owner.agent
      .patch(`/api/people/${owner.session.membership.id}/role`)
      .send({ role: 'WORKER' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('LAST_OWNER');
  });

  it('signs the user out and stops accepting the old cookies', async () => {
    const code = await createInviteCode(owner);
    const { agent } = await joinWithCode(app, code, { fullName: 'Temporary Person' });

    await agent.get('/api/people').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/people').expect(401);
  });
});

/* ========================================================================== */
/*  Health                                                                    */
/* ========================================================================== */

describe('health', () => {
  it('reports the database connection', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'connected', service: 'atlas' });
  });

  it('returns a predictable error shape for an unknown endpoint', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  // Regression: an unrecognised Origin used to throw inside the CORS handler,
  // which the error handler turned into a 500. The browser sends an Origin on
  // `crossorigin` module scripts, so that broke every asset the app loads.
  it('does not fail a request just because the Origin is unrecognised', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://somewhere-else.example');

    expect(response.status).toBe(200);
    // It simply gets no CORS headers — the browser is the one that blocks it.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the server’s own origin so the app can load its own assets', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'http://localhost:4000');
    expect(response.status).toBe(200);
  });
});

describe('deleting an account', () => {
  it('refuses without the correct password', async () => {
    const owner = await signUpOwner(app);
    const response = await owner.agent
      .post('/api/auth/account/delete')
      .send({ password: 'not-the-password' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    // Still there, still able to use the app.
    expect((await owner.agent.get('/api/auth/session')).status).toBe(200);
  });

  it('refuses to strand a company that still has staff in it', async () => {
    const owner = await signUpOwner(app);
    const code = await createInviteCode(owner);
    await joinWithCode(app, code);

    const response = await owner.agent
      .post('/api/auth/account/delete')
      .send({ password: STRONG_PASSWORD });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'LAST_OWNER' });
    expect(response.body.error.message).toContain('only owner');

    const stillThere = await prisma.user.findUnique({ where: { id: owner.session.user.id } });
    expect(stillThere).not.toBeNull();
  });

  it('deletes a lone owner and takes the empty company with them', async () => {
    const owner = await signUpOwner(app);
    const { id: userId } = owner.session.user;
    const companyId = owner.session.company.id;

    const response = await owner.agent
      .post('/api/auth/account/delete')
      .send({ password: STRONG_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, companiesDeleted: 1 });

    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.company.findUnique({ where: { id: companyId } })).toBeNull();
    // The cookies are gone, so the session is too.
    expect((await owner.agent.get('/api/auth/session')).status).toBe(401);
  });

  it('lets a worker leave without destroying the work they did', async () => {
    const owner = await signUpOwner(app);
    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code);
    const workerSession = worker.response.body as typeof owner.session;

    const task = await owner.agent.post('/api/tasks').send({
      title: 'Restock the supply cupboard',
      assigneeId: workerSession.membership.id,
    });
    expect(task.status).toBe(201);
    const taskId = task.body.id as string;

    const response = await worker.agent
      .post('/api/auth/account/delete')
      .send({ password: STRONG_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.companiesDeleted).toBe(0);

    expect(await prisma.user.findUnique({ where: { id: workerSession.user.id } })).toBeNull();

    // The company keeps the task; it simply stops naming a person.
    const survivor = await prisma.task.findUnique({ where: { id: taskId } });
    expect(survivor).not.toBeNull();
    expect(survivor?.assigneeId).toBeNull();
    expect(survivor?.title).toBe('Restock the supply cupboard');

    // And the owner's own company is untouched.
    expect((await owner.agent.get('/api/auth/session')).status).toBe(200);
  });

  it('requires the typed email address when there is no password', async () => {
    const owner = await signUpOwner(app);
    // Simulate a Google-only account: no password to re-enter.
    await prisma.user.update({
      where: { id: owner.session.user.id },
      data: { passwordHash: null, googleId: `google-${owner.session.user.id}` },
    });

    const wrong = await owner.agent
      .post('/api/auth/account/delete')
      .send({ confirmEmail: 'someone.else@example.com' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatchObject({ code: 'CONFIRMATION_REQUIRED' });

    const right = await owner.agent
      .post('/api/auth/account/delete')
      .send({ confirmEmail: owner.session.user.email.toUpperCase() });
    expect(right.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: owner.session.user.id } })).toBeNull();
  });

  it('cannot be called without being signed in', async () => {
    const response = await request(app)
      .post('/api/auth/account/delete')
      .send({ password: STRONG_PASSWORD });
    expect(response.status).toBe(401);
  });
});

describe('Google sign-in', () => {
  // The tests run without GOOGLE_CLIENT_ID/SECRET, which is the same state a
  // fresh deployment is in. Everything here checks that the feature stays shut
  // and safe until it is deliberately configured.

  it('tells the client Google is unavailable so no dead button is drawn', async () => {
    const response = await request(app).get('/api/auth/config');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ google: false });
  });

  it('refuses to start the flow when Google is not configured', async () => {
    const response = await request(app).get('/api/auth/google/start?intent=signin');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'GOOGLE_NOT_CONFIGURED' });
  });

  it('sends the callback back to sign-in rather than erroring when unconfigured', async () => {
    const response = await request(app).get('/api/auth/google/callback?code=x&state=y');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^\/signin\?error=/);
  });

  it('rejects a sign-up that claims Google without a grant cookie', async () => {
    const response = await request(app)
      .post('/api/auth/owner-signup')
      .send({ useGoogle: true, companyName: 'Grantless Co' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toMatch(/GOOGLE_GRANT/);
  });

  it('rejects a forged grant cookie', async () => {
    // A well-formed payload with a signature the server did not produce.
    const body = Buffer.from(
      JSON.stringify({
        googleId: 'attacker',
        email: 'victim@example.com',
        fullName: 'Victim',
        avatarUrl: null,
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');

    const response = await request(app)
      .post('/api/auth/owner-signup')
      .set('Cookie', [`atlas_google_grant=${body}.not-a-real-signature`])
      .send({ useGoogle: true, companyName: 'Forged Co' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('GOOGLE_GRANT_INVALID');
  });

  it('reports whether an account has a password, without leaking the hash', async () => {
    const owner = await signUpOwner(app);
    expect(owner.session.user.hasPassword).toBe(true);
    expect(owner.session.user.hasGoogle).toBe(false);
    expect(JSON.stringify(owner.session)).not.toContain('$2b$');
  });
});
