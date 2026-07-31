import type { Express } from 'express';
import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  STRONG_PASSWORD,
  createInviteCode,
  joinWithCode,
  signUpOwner,
  uniqueEmail,
  type Client,
} from './helpers';
import type { SessionUserDto } from '../src/shared/types';

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
  it('creates an account without a business and requires payment before panel setup', async () => {
    const agent = request.agent(app);
    const account = await agent
      .post('/api/auth/account-signup')
      .send({
        fullName: 'Account Only',
        email: uniqueEmail('account-only'),
        password: STRONG_PASSWORD,
      })
      .expect(201);

    expect(account.body).toMatchObject({ hasPanel: false, subscriptionActive: false });
    await agent.get('/api/auth/account-session').expect(200);
    await agent.get('/api/auth/session').expect(401);
    await agent.post('/api/auth/owner-signup').send({ companyName: 'Too Early' }).expect(402);

    await prisma.user.update({
      where: { id: account.body.user.id },
      data: { accountPlan: 'GROWTH', accountSubscriptionStatus: 'ACTIVE' },
    });
    const panel = await agent
      .post('/api/auth/owner-signup')
      .send({ companyName: 'Paid Company' })
      .expect(201);
    expect(panel.body.company).toMatchObject({
      name: 'Paid Company',
      subscriptionPlan: 'GROWTH',
    });
  });

  it('lets a free account manage personal details without creating a company', async () => {
    const agent = request.agent(app);
    const originalEmail = uniqueEmail('personal-settings');
    const nextEmail = uniqueEmail('personal-settings-updated');
    await agent
      .post('/api/auth/account-signup')
      .send({ fullName: 'Original Name', email: originalEmail, password: STRONG_PASSWORD })
      .expect(201);

    const avatar = await agent
      .post('/api/auth/account/avatar')
      .attach('file', Buffer.from('mock image bytes'), {
        filename: 'account-photo.png',
        contentType: 'image/png',
      })
      .expect(201);

    const updated = await agent
      .patch('/api/auth/account')
      .send({
        fullName: 'Updated Name',
        email: nextEmail,
        phone: '+1 506 555 0101',
        location: 'Moncton, NB',
        timezone: 'America/Moncton',
        bio: 'Building a better operation.',
        avatarUrl: avatar.body.url,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      user: {
        fullName: 'Updated Name',
        email: nextEmail,
        phone: '+1 506 555 0101',
        location: 'Moncton, NB',
        timezone: 'America/Moncton',
        bio: 'Building a better operation.',
        avatarUrl: avatar.body.url,
      },
      plan: null,
      hasPanel: false,
    });
    await agent.get('/api/auth/session').expect(401);
  });

  it('lets a free account change its password and keeps its account session', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('free-password');
    const newPassword = 'Another-strong-password-456';
    await agent
      .post('/api/auth/account-signup')
      .send({ fullName: 'Password Person', email, password: STRONG_PASSWORD })
      .expect(201);

    await agent
      .patch('/api/auth/password')
      .send({ currentPassword: STRONG_PASSWORD, newPassword })
      .expect(200);
    await agent.get('/api/auth/account-session').expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email, password: STRONG_PASSWORD })
      .expect(401);
    await request(app).post('/api/auth/login').send({ email, password: newPassword }).expect(200);
  });

  it('verifies email and consumes verification links only once', async () => {
    const email = uniqueEmail('verify-email');
    const signup = await request(app)
      .post('/api/auth/account-signup')
      .send({ fullName: 'Verify Person', email, password: STRONG_PASSWORD })
      .expect(201);
    expect(signup.body.user.emailVerified).toBe(false);

    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.emailToken.create({
      data: {
        userId: signup.body.user.id,
        type: 'VERIFY_EMAIL',
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
    await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: signup.body.user.id } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it('resets a password with a one-use token and revokes existing sessions', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('reset-password');
    const signup = await agent
      .post('/api/auth/account-signup')
      .send({ fullName: 'Reset Person', email, password: STRONG_PASSWORD })
      .expect(201);
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.emailToken.create({
      data: {
        userId: signup.body.user.id,
        type: 'RESET_PASSWORD',
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const newPassword = 'Brand-new-password-456';
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(200);
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(400);
    await agent.get('/api/auth/account-session').expect(401);
    await request(app).post('/api/auth/login').send({ email, password: newPassword }).expect(200);
  });

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

    const response = await request(app).post('/api/auth/account-signup').send({
      fullName: 'Someone Else',
      email,
      password: STRONG_PASSWORD,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(response.body.error.message).toMatch(/already uses that email/i);
  });

  it('rejects a weak password and names the field', async () => {
    const response = await request(app)
      .post('/api/auth/account-signup')
      .send({
        fullName: 'Short Password',
        email: uniqueEmail('weak'),
        password: 'short',
      });

    expect(response.status).toBe(422);
    expect(response.body.error.details.map((d: { path: string }) => d.path)).toContain('password');
  });

  it('signs in with the new credentials and rejects a wrong password', async () => {
    const email = uniqueEmail('signin');
    await signUpOwner(app, { email });

    const good = await request(app)
      .post('/api/auth/login')
      .send({ email, password: STRONG_PASSWORD });
    expect(good.status).toBe(200);
    expect(good.body.company).toBeTruthy();

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'not-it-at-all' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('ranks and permissions', () => {
  it('bootstraps system ranks and grants with every new company', async () => {
    const owner = await signUpOwner(app);
    const response = await owner.agent.get('/api/ranks');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(9);
    expect(response.body.items[0]).toMatchObject({
      key: 'owner',
      position: 1,
      isProtected: true,
    });
    expect(response.body.items[0].permissions.length).toBe(response.body.catalog.length);
    expect(owner.session.membership.rank.key).toBe('owner');
    expect(owner.session.membership.permissions).toContain('ranks.manage');
  });

  it('edits stored grants while keeping owner authority locked', async () => {
    const owner = await signUpOwner(app);
    const ranks = await owner.agent.get('/api/ranks');
    const manager = ranks.body.items.find((rank: { key: string }) => rank.key === 'manager');
    const ownerRank = ranks.body.items.find((rank: { key: string }) => rank.key === 'owner');

    const changed = await owner.agent.put(`/api/ranks/${manager.id}/permissions`).send({
      permissions: [{ key: 'schedule.view', scope: 'TEAM', selectedTeamIds: [] }],
    });
    expect(changed.status).toBe(200);
    expect(
      changed.body.items.find((rank: { key: string }) => rank.key === 'manager').permissions,
    ).toEqual([expect.objectContaining({ permissionKey: 'schedule.view', scope: 'TEAM' })]);

    await owner.agent
      .put(`/api/ranks/${ownerRank.id}/permissions`)
      .send({ permissions: [] })
      .expect(403);
  });

  it('does not expose rank administration to workers', async () => {
    const owner = await signUpOwner(app);
    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code);
    await worker.agent.get('/api/ranks').expect(403);
  });

  it('repairs companies created before default rank grants shipped', async () => {
    const owner = await signUpOwner(app);
    const ranks = await prisma.rank.findMany({
      where: { companyId: owner.session.company.id },
      select: { id: true },
    });
    await prisma.rankPermission.deleteMany({
      where: { rankId: { in: ranks.map((rank) => rank.id) } },
    });

    const session = await owner.agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.membership.permissions).toContain('ranks.manage');
    await owner.agent.get('/api/ranks').expect(200);
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
    const created = await owner.agent.post('/api/tasks').send({
      title: 'Solo shift sign-off',
      assigneeId: workerMembershipId,
      requiresApproval: true,
    });

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

  it('keeps activity and the knowledge base management-only', async () => {
    await workerAgent.get('/api/activity').expect(403);
    await workerAgent.get('/api/knowledge').expect(403);
  });

  it('stops a worker assigning work to somebody else', async () => {
    const response = await workerAgent
      .post('/api/tasks')
      .send({ title: 'Not mine to give', assigneeId: secondWorkerMembershipId });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/owners and managers/i);
  });

  it('stops a worker creating work for themselves', async () => {
    const response = await workerAgent
      .post('/api/tasks')
      .send({ title: 'My own reminder', assigneeId: workerMembershipId });
    expect(response.status).toBe(403);
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

  it('keeps the whole activity feed away from workers', async () => {
    const asOwner = await owner.agent.get('/api/activity').query({ limit: 100 }).expect(200);
    expect(asOwner.body.items.map((e: { type: string }) => e.type)).toContain('INVITE_CREATED');

    // The feed carries manager-only events such as escalations and
    // deactivations, so the route is closed to workers outright rather than
    // filtered for them. The sidebar never offers it to a worker either.
    await workerAgent.get('/api/activity').query({ limit: 100 }).expect(403);
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

  it('lets an owner appoint a co-owner with full owner authority', async () => {
    const code = await createInviteCode(owner);
    const coOwner = await joinWithCode(app, code, { fullName: 'Casey Co-owner' });
    const coOwnerId = (coOwner.response.body as { membership: { id: string } }).membership.id;

    await owner.agent.patch(`/api/people/${coOwnerId}/role`).send({ role: 'CO_OWNER' }).expect(200);

    const person = await owner.agent.get(`/api/people/${coOwnerId}`).expect(200);
    expect(person.body.role).toBe('CO_OWNER');

    // Company settings are owner-only, so this proves co-owners inherit that
    // authority rather than merely looking like an elevated manager.
    await coOwner.agent
      .patch('/api/companies/current')
      .send({ location: 'Halifax, Nova Scotia' })
      .expect(200);
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

describe('company roles', () => {
  const createRole = (client: Client, body: Record<string, unknown>) =>
    client.agent.post('/api/roles').send(body);

  it('creates a role and reports it with a member count', async () => {
    const owner = await signUpOwner(app);
    const response = await createRole(owner, { name: 'Dispatcher', color: '#1f6feb' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Dispatcher',
      color: '#1f6feb',
      parentId: null,
      isDefault: false,
      memberCount: 0,
    });
  });

  it('rejects a duplicate name and a colour that is not hex', async () => {
    const owner = await signUpOwner(app);
    await createRole(owner, { name: 'Dispatcher' });

    const duplicate = await createRole(owner, { name: 'Dispatcher' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({ code: 'ROLE_NAME_TAKEN' });

    // Schema failures are 422 here; 400 is reserved for rules the schema
    // cannot express, like the cycle check.
    const badColor = await createRole(owner, { name: 'Driver', color: 'royal blue' });
    expect(badColor.status).toBe(422);
    const issues = badColor.body.error.details as { path: string; message: string }[];
    expect(issues.find((issue) => issue.path === 'color')?.message).toContain('hex');
  });

  it('nests roles and refuses to create a loop', async () => {
    const owner = await signUpOwner(app);
    const parent = await createRole(owner, { name: 'Operations Manager' });
    const child = await createRole(owner, {
      name: 'Technician',
      parentId: parent.body.id as string,
    });
    expect(child.body.parentId).toBe(parent.body.id);

    // Itself.
    const self = await owner.agent
      .patch(`/api/roles/${parent.body.id}`)
      .send({ parentId: parent.body.id });
    expect(self.status).toBe(400);
    expect(self.body.error).toMatchObject({ code: 'ROLE_CYCLE' });

    // Underneath its own descendant.
    const loop = await owner.agent
      .patch(`/api/roles/${parent.body.id}`)
      .send({ parentId: child.body.id });
    expect(loop.status).toBe(400);
    expect(loop.body.error).toMatchObject({ code: 'ROLE_CYCLE' });
  });

  it('keeps at most one default role', async () => {
    const owner = await signUpOwner(app);
    const first = await createRole(owner, { name: 'Cleaner', isDefault: true });
    const second = await createRole(owner, { name: 'Driver', isDefault: true });

    const list = await owner.agent.get('/api/roles');
    const defaults = (list.body.items as { id: string; isDefault: boolean }[]).filter(
      (role) => role.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.id);
    expect(defaults[0].id).not.toBe(first.body.id);
  });

  it('gives the default role to somebody joining with a code', async () => {
    const owner = await signUpOwner(app);
    const role = await createRole(owner, { name: 'Cleaning Technician', isDefault: true });
    const code = await createInviteCode(owner);

    const worker = await joinWithCode(app, code);
    expect(worker.response.status).toBe(201);

    const joined = worker.response.body as { membership: { id: string } };
    const membership = await prisma.membership.findUnique({
      where: { id: joined.membership.id },
      select: { roleId: true },
    });
    expect(membership?.roleId).toBe(role.body.id);
  });

  it('assigns a role to a person and shows it on their profile', async () => {
    const owner = await signUpOwner(app);
    const role = await createRole(owner, { name: 'Lead Technician', color: '#a4560f' });
    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code);
    const workerId = (worker.response.body as { membership: { id: string } }).membership.id;

    const assigned = await owner.agent
      .patch(`/api/people/${workerId}/assigned-role`)
      .send({ roleId: role.body.id });

    expect(assigned.status).toBe(200);
    expect(assigned.body.assignedRole).toMatchObject({
      id: role.body.id,
      name: 'Lead Technician',
      color: '#a4560f',
    });

    const cleared = await owner.agent
      .patch(`/api/people/${workerId}/assigned-role`)
      .send({ roleId: null });
    expect(cleared.body.assignedRole).toBeNull();
  });

  it('lets workers read roles but never write them', async () => {
    const owner = await signUpOwner(app);
    await createRole(owner, { name: 'Dispatcher' });
    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code);

    // Reading is fine — a worker should know what people are called.
    const read = await worker.agent.get('/api/roles');
    expect(read.status).toBe(200);
    expect(read.body.items).toHaveLength(1);

    expect((await worker.agent.post('/api/roles').send({ name: 'Boss' })).status).toBe(403);
  });

  it('never exposes another company’s roles', async () => {
    const first = await signUpOwner(app);
    const second = await signUpOwner(app);
    const role = await createRole(first, { name: 'Private Role' });

    const list = await second.agent.get('/api/roles');
    expect(list.body.items).toHaveLength(0);

    const edit = await second.agent.patch(`/api/roles/${role.body.id}`).send({ name: 'Stolen' });
    expect(edit.status).toBe(404);

    const remove = await second.agent.delete(`/api/roles/${role.body.id}`);
    expect(remove.status).toBe(404);
  });

  it('deletes a role without taking its people or its children with it', async () => {
    const owner = await signUpOwner(app);
    const parent = await createRole(owner, { name: 'Operations Manager' });
    const middle = await createRole(owner, {
      name: 'Lead Technician',
      parentId: parent.body.id as string,
    });
    const child = await createRole(owner, {
      name: 'Technician',
      parentId: middle.body.id as string,
    });

    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code);
    const workerId = (worker.response.body as { membership: { id: string } }).membership.id;
    await owner.agent
      .patch(`/api/people/${workerId}/assigned-role`)
      .send({ roleId: middle.body.id });

    expect((await owner.agent.delete(`/api/roles/${middle.body.id}`)).status).toBe(200);

    // The grandchild moves up rather than being orphaned.
    const list = await owner.agent.get('/api/roles');
    const remaining = list.body.items as { id: string; parentId: string | null }[];
    expect(remaining.map((role) => role.id)).not.toContain(middle.body.id);
    expect(remaining.find((role) => role.id === child.body.id)?.parentId).toBe(parent.body.id);

    // The person is still here, just without a role.
    const person = await owner.agent.get(`/api/people/${workerId}`);
    expect(person.status).toBe(200);
    expect(person.body.assignedRole).toBeNull();
  });
});

describe('Atlasy', () => {
  // The suite runs with no ASSISTANT_API_KEY, which is the state a fresh
  // deployment is in. Everything here checks it stays shut and safe.

  it('tells the client the assistant is unavailable so no dead button is drawn', async () => {
    const response = await request(app).get('/api/assistant/config');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false });
  });

  it('cannot be talked to without signing in', async () => {
    const response = await request(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'hello' }] });
    expect(response.status).toBe(401);
  });

  it('says so plainly when no provider is configured, and does nothing', async () => {
    const owner = await signUpOwner(app);
    const response = await owner.agent
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'create a task called Test' }] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Atlasy is down right now, sorry.', actions: [] });

    // Crucially it did not half-act before giving up.
    const tasks = await owner.agent.get('/api/tasks');
    expect(tasks.body.items).toHaveLength(0);
  });

  it('only offers tools that map to real, permission-checked endpoints', async () => {
    const { TOOLS, toolSchemas } = await import('../src/server/assistant/tools');

    // The model picks a tool name, never a URL. If that list ever grew a path
    // outside /api, the assistant would have a door the routes do not guard.
    for (const tool of TOOLS) {
      expect(tool.path.startsWith('/api/')).toBe(true);
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(tool.method);
      expect(tool.description.length).toBeGreaterThan(10);
    }
    expect(TOOLS.map((tool) => tool.name)).toContain('create_task');
    const withoutRankAccess = toolSchemas([]).map((schema) => schema.function.name);
    const withRankAccess = toolSchemas(['ranks.manage']).map((schema) => schema.function.name);
    expect(withoutRankAccess).not.toContain('set_rank_permissions');
    expect(withRankAccess).toContain('set_rank_permissions');
  });
});

describe('company chat', () => {
  it('provides a shared room and keeps direct messages between their members', async () => {
    const owner = await signUpOwner(app, { companyName: 'Chat Test Co' });
    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code, { fullName: 'Chat Worker' });
    const workerId = (worker.response.body as { membership: { id: string } }).membership.id;

    const companyRooms = await owner.agent.get('/api/chat/conversations');
    expect(companyRooms.status).toBe(200);
    const companyRoom = companyRooms.body.items.find(
      (item: { kind: string }) => item.kind === 'COMPANY',
    );
    expect(companyRoom).toBeTruthy();

    const companyMessage = await owner.agent
      .post(`/api/chat/conversations/${companyRoom.id}/messages`)
      .send({ body: 'Morning team' });
    expect(companyMessage.status).toBe(201);
    expect(
      (await worker.agent.get(`/api/chat/conversations/${companyRoom.id}/messages`)).body.items[0]
        .body,
    ).toBe('Morning team');

    const recentCompanyChat = await worker.agent
      .get('/api/chat/company/messages')
      .query({ sinceHours: 24 });
    expect(recentCompanyChat.status).toBe(200);
    expect(recentCompanyChat.body.items[0]).toMatchObject({
      body: 'Morning team',
      sender: { fullName: 'Ada Owner' },
    });
    expect(recentCompanyChat.body.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const direct = await owner.agent
      .post('/api/chat/conversations')
      .send({ kind: 'DIRECT', memberId: workerId });
    expect(direct.status).toBe(201);
    const directId = direct.body.conversation.id as string;
    expect((await worker.agent.get(`/api/chat/conversations/${directId}/messages`)).status).toBe(
      200,
    );

    const outsider = await signUpOwner(app, { companyName: 'Other Chat Co' });
    expect((await outsider.agent.get(`/api/chat/conversations/${directId}/messages`)).status).toBe(
      404,
    );
  });
});

describe('people added by hand', () => {
  const addPerson = (client: Client, body: Record<string, unknown>) =>
    client.agent.post('/api/people').send(body);

  it('creates somebody who behaves like anyone else', async () => {
    const owner = await signUpOwner(app);
    const role = await owner.agent.post('/api/roles').send({ name: 'Technician' });

    const created = await addPerson(owner, {
      fullName: 'Theo Placeholder',
      jobTitle: 'Cleaning Technician',
      roleId: role.body.id,
      managerId: owner.session.membership.id,
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      fullName: 'Theo Placeholder',
      jobTitle: 'Cleaning Technician',
      isPlaceholder: true,
      managerId: owner.session.membership.id,
    });
    expect(created.body.assignedRole).toMatchObject({ name: 'Technician' });

    // They show up in the list and on the map like anybody else.
    const list = await owner.agent.get('/api/people');
    expect((list.body.items as { id: string }[]).map((p) => p.id)).toContain(created.body.id);

    const graph = await owner.agent.get('/api/organization/graph');
    const nodes = graph.body.nodes as { person?: { id: string } }[];
    expect(nodes.some((node) => node.person?.id === created.body.id)).toBe(true);
  });

  it('takes assigned work and profile edits exactly like a real person', async () => {
    const owner = await signUpOwner(app);
    const person = await addPerson(owner, { fullName: 'Stand In' });

    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Sweep the yard', assigneeId: person.body.id });
    expect(task.status).toBe(201);
    expect(task.body.assignee.id).toBe(person.body.id);

    const edited = await owner.agent
      .patch(`/api/people/${person.body.id}`)
      .send({ jobTitle: 'Groundskeeper', headline: 'Owns the yard' });
    expect(edited.status).toBe(200);
    expect(edited.body.jobTitle).toBe('Groundskeeper');
    expect(edited.body.headline).toBe('Owns the yard');
  });

  it('cannot be signed into, and says so without hinting at Google', async () => {
    const owner = await signUpOwner(app);
    const email = uniqueEmail('standin');
    await addPerson(owner, { fullName: 'No Login', email });

    const attempt = await request(app)
      .post('/api/auth/login')
      .send({ email, password: STRONG_PASSWORD });

    expect(attempt.status).toBe(401);
    expect(attempt.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(attempt.body.error.message).not.toMatch(/google/i);
  });

  it('refuses an email that a real account already uses', async () => {
    const owner = await signUpOwner(app);
    const clash = await addPerson(owner, {
      fullName: 'Clash',
      email: owner.session.user.email,
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('is workers-may-not territory', async () => {
    const owner = await signUpOwner(app);
    const code = await createInviteCode(owner);
    const worker = await joinWithCode(app, code);

    const attempt = await worker.agent.post('/api/people').send({ fullName: 'Sneaky' });
    expect(attempt.status).toBe(403);
  });

  it('deletes cleanly, and refuses to delete a real account this way', async () => {
    const owner = await signUpOwner(app);
    const person = await addPerson(owner, { fullName: 'Temporary' });

    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Job that outlives them', assigneeId: person.body.id });

    // A real account must not be removable through this door.
    const realAttempt = await owner.agent.delete(
      `/api/people/${owner.session.membership.id}/placeholder`,
    );
    expect(realAttempt.status).toBe(400);
    expect(realAttempt.body.error).toMatchObject({ code: 'NOT_A_PLACEHOLDER' });

    const removed = await owner.agent.delete(`/api/people/${person.body.id}/placeholder`);
    expect(removed.status).toBe(200);

    expect((await owner.agent.get(`/api/people/${person.body.id}`)).status).toBe(404);

    // The work they were given survives, simply unassigned.
    const survivor = await prisma.task.findUnique({ where: { id: task.body.id as string } });
    expect(survivor).not.toBeNull();
    expect(survivor?.assigneeId).toBeNull();
  });
});

describe('platform user administration', () => {
  it('broadcasts sanitized formatted email only through platform-admin access', async () => {
    const admin = await signUpOwner(app, { fullName: 'Broadcast Operator' });
    await prisma.user.update({
      where: { id: admin.session.user.id },
      data: { isPlatformAdmin: true },
    });
    const ordinary = await signUpOwner(app);
    await ordinary.agent.get('/api/admin/broadcast/recipients').expect(403);
    await ordinary.agent
      .post('/api/admin/broadcast')
      .send({ title: 'No', body: 'Not allowed', broadcastId: crypto.randomUUID() })
      .expect(403);

    const audience = await admin.agent.get('/api/admin/broadcast/recipients').expect(200);
    expect(audience.body.count).toBeGreaterThanOrEqual(2);

    const { env } = await import('../src/server/env');
    const previous = {
      emailEnabled: env.emailEnabled,
      RESEND_API_KEY: env.RESEND_API_KEY,
      EMAIL_FROM: env.EMAIL_FROM,
    };
    env.emailEnabled = true;
    env.RESEND_API_KEY = 're_test_only';
    env.EMAIL_FROM = 'Atlas <notifications@mail.atlas.test>';
    const send = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'email-id' }] }), { status: 200 }),
      );

    try {
      const response = await admin.agent
        .post('/api/admin/broadcast')
        .send({
          title: 'Platform update',
          body: '## What changed\n\nThis is **important**.\n\n<script>alert(1)</script>',
          broadcastId: crypto.randomUUID(),
        })
        .expect(200);
      expect(response.body).toMatchObject({
        sent: audience.body.count,
        failed: 0,
        total: audience.body.count,
      });
      expect(send).toHaveBeenCalled();
      const payload = JSON.parse(String(send.mock.calls[0][1]?.body)) as { html: string }[];
      expect(payload[0].html).toContain('<strong>important</strong>');
      expect(payload[0].html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(payload[0].html).not.toContain('<script>alert(1)</script>');
      expect(send.mock.calls[0][1]?.headers).toMatchObject({
        'Idempotency-Key': expect.stringContaining('platform-broadcast/'),
      });
    } finally {
      send.mockRestore();
      env.emailEnabled = previous.emailEnabled;
      env.RESEND_API_KEY = previous.RESEND_API_KEY;
      env.EMAIL_FROM = previous.EMAIL_FROM;
    }
  });

  it('lets only the platform admin search accounts and change a plan everywhere it applies', async () => {
    const admin = await signUpOwner(app, { fullName: 'Platform Operator' });
    await prisma.user.update({
      where: { id: admin.session.user.id },
      data: { isPlatformAdmin: true },
    });

    const target = await signUpOwner(app, {
      fullName: 'Plan Change Target',
      subscriptionPlan: 'STARTER',
    });
    await target.agent.get('/api/admin/users').expect(403);

    const search = await admin.agent
      .get('/api/admin/users')
      .query({ search: target.session.user.email })
      .expect(200);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0]).toMatchObject({
      id: target.session.user.id,
      fullName: 'Plan Change Target',
      subscriptionPlan: 'STARTER',
      subscriptionStatus: 'ACTIVE',
    });
    expect(search.body.items[0].activeSessionCount).toBeGreaterThanOrEqual(1);

    const changed = await admin.agent
      .patch(`/api/admin/users/${target.session.user.id}/subscription`)
      .send({
        subscriptionPlan: 'BUSINESS',
        subscriptionStatus: 'SUSPENDED',
        subscriptionExpiresAt: null,
      })
      .expect(200);
    expect(changed.body).toMatchObject({
      subscriptionPlan: 'BUSINESS',
      subscriptionStatus: 'SUSPENDED',
    });

    const [user, company] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: target.session.user.id } }),
      prisma.company.findUniqueOrThrow({ where: { id: target.session.company.id } }),
    ]);
    expect(user.accountPlan).toBe('BUSINESS');
    expect(user.accountSubscriptionStatus).toBe('SUSPENDED');
    expect(company.subscriptionPlan).toBe('BUSINESS');
    expect(company.subscriptionStatus).toBe('SUSPENDED');

    const removed = await admin.agent
      .patch(`/api/admin/users/${target.session.user.id}/subscription`)
      .send({
        subscriptionPlan: null,
        subscriptionStatus: null,
        subscriptionExpiresAt: null,
      })
      .expect(200);
    expect(removed.body).toMatchObject({
      subscriptionPlan: null,
      subscriptionStatus: null,
    });
    expect(
      await prisma.company.findUniqueOrThrow({
        where: { id: target.session.company.id },
        select: { subscriptionPlan: true, subscriptionStatus: true },
      }),
    ).toMatchObject({ subscriptionPlan: 'STARTER', subscriptionStatus: 'SUSPENDED' });
  });

  it('can revoke another account sessions but protects the platform admin sessions', async () => {
    const admin = await signUpOwner(app);
    await prisma.user.update({
      where: { id: admin.session.user.id },
      data: { isPlatformAdmin: true },
    });
    const target = await signUpOwner(app);

    const revoked = await admin.agent
      .post(`/api/admin/users/${target.session.user.id}/revoke-sessions`)
      .expect(200);
    expect(revoked.body.revokedSessions).toBeGreaterThan(0);
    await target.agent.get('/api/auth/account-session').expect(401);

    await admin.agent.post(`/api/admin/users/${admin.session.user.id}/revoke-sessions`).expect(403);
  });
});

describe('deleting an account', () => {
  it('allows an account without a plan or panel to access settings and delete itself', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('free-delete');
    const created = await agent
      .post('/api/auth/account-signup')
      .send({ fullName: 'Free Account', email, password: STRONG_PASSWORD })
      .expect(201);

    expect(created.body).toMatchObject({
      user: { email, hasPassword: true, hasGoogle: false },
      plan: null,
      hasPanel: false,
    });
    await agent.get('/api/auth/account-session').expect(200);
    await agent
      .post('/api/auth/account/delete')
      .send({ password: STRONG_PASSWORD })
      .expect(200, { ok: true, companiesDeleted: 0 });

    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    await agent.get('/api/auth/account-session').expect(401);
  });

  it('releases a deleted email for a new account but rejects it while still in use', async () => {
    const first = request.agent(app);
    const email = uniqueEmail('reusable');
    await first
      .post('/api/auth/account-signup')
      .send({ fullName: 'First Person', email, password: STRONG_PASSWORD })
      .expect(201);

    await request(app)
      .post('/api/auth/account-signup')
      .send({ fullName: 'Too Soon', email, password: STRONG_PASSWORD })
      .expect(409);

    await first.post('/api/auth/account/delete').send({ password: STRONG_PASSWORD }).expect(200);

    const reused = await request(app)
      .post('/api/auth/account-signup')
      .send({ fullName: 'Second Person', email, password: STRONG_PASSWORD })
      .expect(201);
    expect(reused.body.user.email).toBe(email);
  });

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
    const response = await request(app).post('/api/auth/account-signup').send({ useGoogle: true });

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
      .post('/api/auth/account-signup')
      .set('Cookie', [`atlas_google_grant=${body}.not-a-real-signature`])
      .send({ useGoogle: true });

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

/* ========================================================================== */
/*  Notifications                                                             */
/* ========================================================================== */

describe('notifications', () => {
  interface Inbox {
    items: {
      id: string;
      type: string;
      title: string;
      taskId: string | null;
      readAt: string | null;
    }[];
    unread: number;
  }

  const inbox = async (client: Client): Promise<Inbox> => {
    const response = await client.agent.get('/api/notifications').expect(200);
    return response.body as Inbox;
  };

  const types = (box: Inbox) => box.items.map((item) => item.type);

  /**
   * An owner and a worker in the same company — the minimum for anything to be
   * notified at all. The owner's inbox is emptied afterwards so each test
   * counts only what it caused, not the join that set it up.
   */
  async function companyOfTwo() {
    const owner = await signUpOwner(app);
    const code = await createInviteCode(owner);
    const joined = await joinWithCode(app, code);
    const worker: Client = {
      agent: joined.agent,
      session: joined.response.body as Client['session'],
    };
    await owner.agent.post('/api/notifications/read').send({});
    await owner.agent.delete('/api/notifications');
    return { owner, worker };
  }

  it('notifies nobody in a company of one, because you are always the actor', async () => {
    const owner = await signUpOwner(app);
    await owner.agent
      .post('/api/tasks')
      .send({ title: 'Order more blue roll', assigneeId: owner.session.membership.id })
      .expect(201);

    // This is the whole reason the bell looks broken to a sole trader. It is
    // the self-action rule doing its job, not an absence of wiring.
    const box = await inbox(owner);
    expect(box.items).toHaveLength(0);
    expect(box.unread).toBe(0);
  });

  it('tells the owner when somebody joins the company', async () => {
    const owner = await signUpOwner(app);
    const code = await createInviteCode(owner);
    await joinWithCode(app, code);

    expect(types(await inbox(owner))).toContain('MEMBER_JOINED');
  });

  it('does not let a worker create work for the company', async () => {
    const { owner, worker } = await companyOfTwo();

    await worker.agent.post('/api/tasks').send({ title: 'Restock the van' }).expect(403);
    expect((await inbox(owner)).items).toHaveLength(0);
  });

  it('tells the owner when somebody else finishes work, without telling them twice', async () => {
    const { owner, worker } = await companyOfTwo();

    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Sweep the yard', assigneeId: worker.session.membership.id })
      .expect(201);
    await worker.agent
      .patch(`/api/tasks/${task.body.id}/status`)
      .send({ status: 'DONE' })
      .expect(200);

    // Exactly one, and that is the point of the test. The owner raised this
    // task, so they are told about it as its creator, and the leadership
    // fan-out then skips them on purpose rather than sending a second
    // notification about the very same event.
    const box = await inbox(owner);
    const aboutThisTask = box.items.filter((item) => item.taskId === task.body.id);
    expect(aboutThisTask).toHaveLength(1);
    expect(aboutThisTask[0].type).toBe('TASK_STATUS_CHANGED');
  });

  it('never writes a notification to a placeholder, who has no way to read it', async () => {
    const owner = await signUpOwner(app);
    const person = await owner.agent.post('/api/people').send({ fullName: 'Stand In' }).expect(201);

    await owner.agent
      .post('/api/tasks')
      .send({ title: 'Assigned to nobody real', assigneeId: person.body.id })
      .expect(201);

    const rows = await prisma.notification.count({ where: { recipientId: person.body.id } });
    expect(rows).toBe(0);
  });

  it('tells somebody when they are given a role, and does not echo it to whoever gave it', async () => {
    const { owner, worker } = await companyOfTwo();
    const role = await owner.agent.post('/api/roles').send({ name: 'Lead Technician' }).expect(201);

    await owner.agent
      .patch(`/api/people/${worker.session.membership.id}/assigned-role`)
      .send({ roleId: role.body.id })
      .expect(200);

    const box = await inbox(worker);
    expect(types(box)).toContain('ROLE_ASSIGNED');
    expect(box.items[0].title).toBe('You are now Lead Technician');

    expect(types(await inbox(owner))).not.toContain('ROLE_ASSIGNED');
  });

  it('lets an owner switch the company feed off without losing their own work', async () => {
    const { owner, worker } = await companyOfTwo();

    await owner.agent
      .patch('/api/notifications/preferences')
      .send({ companyActivity: false })
      .expect(200);

    // A task the owner created, commented on by somebody else. That is their
    // own work, and no feed switch should be able to silence it.
    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'For the boss', assigneeId: worker.session.membership.id })
      .expect(201);
    await worker.agent
      .post(`/api/tasks/${task.body.id}/comments`)
      .send({ body: 'Started this one.' })
      .expect(201);

    const box = await inbox(owner);
    expect(types(box)).not.toContain('TASK_CREATED');
    expect(types(box)).toContain('TASK_COMMENTED');
  });

  it('emails notifications by default, and exposes the switch to turn that off', async () => {
    const owner = await signUpOwner(app);

    const initial = await owner.agent.get('/api/notifications/preferences').expect(200);
    expect(initial.body.emailNotifications).toBe(true);

    const updated = await owner.agent
      .patch('/api/notifications/preferences')
      .send({ emailNotifications: false })
      .expect(200);
    expect(updated.body.emailNotifications).toBe(false);

    const persisted = await owner.agent.get('/api/notifications/preferences').expect(200);
    expect(persisted.body.emailNotifications).toBe(false);
  });

  it('tells the owner once when work is sent for review, not twice', async () => {
    const { owner, worker } = await companyOfTwo();

    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Deep clean the kitchen', assigneeId: worker.session.membership.id })
      .expect(201);
    await worker.agent
      .patch(`/api/tasks/${task.body.id}/status`)
      .send({ status: 'AWAITING_REVIEW' })
      .expect(200);

    // The owner raised this task, so the direct notification already reached
    // them. The leadership fan-out must skip them the way the completion path
    // does, or the same event lands in the bell twice.
    const box = await inbox(owner);
    const aboutThisTask = box.items.filter((item) => item.taskId === task.body.id);
    expect(aboutThisTask).toHaveLength(1);
  });

  it('still shows a notification in the app when its email copy is switched off', async () => {
    const { owner, worker } = await companyOfTwo();

    await owner.agent
      .patch('/api/notifications/preferences')
      .send({ emailNotifications: false })
      .expect(200);

    // The email switch must only stop the email. Losing the bell as well would
    // make turning it off a much worse trade than anybody intended.
    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Still want the bell', assigneeId: worker.session.membership.id })
      .expect(201);
    await worker.agent
      .post(`/api/tasks/${task.body.id}/comments`)
      .send({ body: 'On it.' })
      .expect(201);

    expect(types(await inbox(owner))).toContain('TASK_COMMENTED');
  });

  it('clears read notifications and leaves the unread ones alone', async () => {
    const { owner, worker } = await companyOfTwo();
    const first = await owner.agent
      .post('/api/tasks')
      .send({ title: 'First', assigneeId: worker.session.membership.id })
      .expect(201);
    const second = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Second', assigneeId: worker.session.membership.id })
      .expect(201);
    await worker.agent
      .post(`/api/tasks/${first.body.id}/comments`)
      .send({ body: 'First update' })
      .expect(201);
    await worker.agent
      .post(`/api/tasks/${second.body.id}/comments`)
      .send({ body: 'Second update' })
      .expect(201);

    const before = await inbox(owner);
    expect(before.items).toHaveLength(2);

    await owner.agent
      .post('/api/notifications/read')
      .send({ ids: [before.items[0].id] })
      .expect(200);
    await owner.agent.delete('/api/notifications').expect(200);

    const after = await inbox(owner);
    expect(after.items).toHaveLength(1);
    expect(after.items[0].id).toBe(before.items[1].id);
    expect(after.unread).toBe(1);
  });
});

/* ========================================================================== */
/*  Task list filtering                                                       */
/* ========================================================================== */

describe('task list filters', () => {
  /** An owner, plus a worker who can see nothing of their own. */
  async function ownerAndStranger() {
    const owner = await signUpOwner(app, { companyName: `Filters ${Date.now().toString(36)}` });
    const code = await createInviteCode(owner);
    const joined = await joinWithCode(app, code);
    const worker: Client = { agent: joined.agent, session: joined.response.body as SessionUserDto };
    return { owner, worker };
  }

  it('does not let a worker see other people\u2019s tasks by typing in the search box', async () => {
    const { owner, worker } = await ownerAndStranger();

    // A task that belongs to the owner alone. The worker is not the assignee,
    // not the creator, and it sits on no team they are in.
    await owner.agent
      .post('/api/tasks')
      .send({
        title: 'Confidential payroll reconciliation',
        assigneeId: owner.session.membership.id,
      })
      .expect(201);

    const unfiltered = await worker.agent.get('/api/tasks').expect(200);
    expect(unfiltered.body.items).toHaveLength(0);

    // The same request with a search term must not widen what they can see.
    const searched = await worker.agent.get('/api/tasks').query({ search: 'payroll' }).expect(200);
    expect(searched.body.items).toHaveLength(0);
  });

  it('honours includeDone=false instead of treating the string as true', async () => {
    const owner = await signUpOwner(app, { companyName: `Done ${Date.now().toString(36)}` });

    const created = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Finished job' })
      .expect(201);
    await owner.agent
      .patch(`/api/tasks/${created.body.id}/status`)
      .send({ status: 'DONE' })
      .expect(200);

    const withDone = await owner.agent.get('/api/tasks').expect(200);
    expect(withDone.body.items.map((t: { title: string }) => t.title)).toContain('Finished job');

    const withoutDone = await owner.agent
      .get('/api/tasks')
      .query({ includeDone: false })
      .expect(200);
    expect(withoutDone.body.items.map((t: { title: string }) => t.title)).not.toContain(
      'Finished job',
    );
  });

  it('keeps an explicit status filter when done tasks are excluded', async () => {
    const owner = await signUpOwner(app, { companyName: `Status ${Date.now().toString(36)}` });

    const blocked = await owner.agent.post('/api/tasks').send({ title: 'Blocked job' }).expect(201);
    await owner.agent
      .patch(`/api/tasks/${blocked.body.id}/status`)
      .send({ status: 'BLOCKED', blockedReason: 'Waiting on a part' })
      .expect(200);
    await owner.agent.post('/api/tasks').send({ title: 'Untouched job' }).expect(201);

    const response = await owner.agent
      .get('/api/tasks')
      .query({ status: 'BLOCKED', includeDone: false })
      .expect(200);

    const titles = response.body.items.map((t: { title: string }) => t.title);
    expect(titles).toContain('Blocked job');
    expect(titles).not.toContain('Untouched job');
  });
});

/* ========================================================================== */
/*  Schedule integrity                                                        */
/* ========================================================================== */

describe('schedule integrity', () => {
  it('keeps a booking duration when only its start time is moved', async () => {
    const owner = await signUpOwner(app);
    const task = await owner.agent.post('/api/tasks').send({ title: 'Two-hour visit' }).expect(201);

    await owner.agent
      .patch(`/api/schedule/tasks/${task.body.id}`)
      .send({
        startAt: '2030-01-07T09:00:00.000Z',
        endAt: '2030-01-07T11:00:00.000Z',
      })
      .expect(200);

    const moved = await owner.agent
      .patch(`/api/schedule/tasks/${task.body.id}`)
      .send({ startAt: '2030-01-08T13:00:00.000Z' })
      .expect(200);

    expect(moved.body.startAt).toBe('2030-01-08T13:00:00.000Z');
    expect(moved.body.endAt).toBe('2030-01-08T15:00:00.000Z');
  });

  it('shows company-wide leaders team resources and team-owned work', async () => {
    const owner = await signUpOwner(app);
    const team = await owner.agent
      .post('/api/organization/teams')
      .send({ name: 'Day Crew', leadId: owner.session.membership.id })
      .expect(201);
    const task = await owner.agent
      .post('/api/tasks')
      .send({ title: 'Crew briefing', teamId: team.body.id })
      .expect(201);
    await owner.agent
      .patch(`/api/schedule/tasks/${task.body.id}`)
      .send({ startAt: '2030-01-07T09:00:00.000Z' })
      .expect(200);

    const schedule = await owner.agent
      .get('/api/schedule')
      .query({
        from: '2030-01-07T00:00:00.000Z',
        to: '2030-01-08T00:00:00.000Z',
        resources: team.body.id,
      })
      .expect(200);

    expect(schedule.body.resources).toContainEqual(
      expect.objectContaining({ id: team.body.id, kind: 'TEAM' }),
    );
    expect(schedule.body.blocks).toContainEqual(expect.objectContaining({ taskId: task.body.id }));
  });

  it('rejects a team from another company when scheduling work', async () => {
    const first = await signUpOwner(app);
    const second = await signUpOwner(app);
    const foreignTeam = await first.agent
      .post('/api/organization/teams')
      .send({ name: 'Foreign Crew', leadId: first.session.membership.id })
      .expect(201);
    const task = await second.agent.post('/api/tasks').send({ title: 'Local work' }).expect(201);

    await second.agent
      .patch(`/api/schedule/tasks/${task.body.id}`)
      .send({ startAt: '2030-01-07T09:00:00.000Z', teamId: foreignTeam.body.id })
      .expect(403);

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.body.id } });
    expect(stored.teamId).toBeNull();
    expect(stored.startAt).toBeNull();
  });

  it('rejects invalid schedule filters as a client error', async () => {
    const owner = await signUpOwner(app);
    await owner.agent
      .get('/api/schedule')
      .query({
        from: '2030-01-07T00:00:00.000Z',
        to: '2030-01-08T00:00:00.000Z',
        status: 'NOT_A_STATUS',
      })
      .expect(422);
  });
});

/* ========================================================================== */
/*  Subscription plan enforcement                                             */
/* ========================================================================== */

describe('subscription plan enforcement', () => {
  it('keeps Growth features off Starter and reports the exact entitlements', async () => {
    const starter = await signUpOwner(app, { subscriptionPlan: 'STARTER' });

    const entitlements = await starter.agent.get('/api/companies/current/entitlements').expect(200);
    expect(entitlements.body).toMatchObject({
      plan: 'STARTER',
      employeeLimit: 10,
      activeEmployees: 1,
      features: [],
    });

    await starter.agent.get('/api/knowledge').expect(402);
    await starter.agent
      .get('/api/schedule')
      .query({
        from: '2030-01-01T00:00:00.000Z',
        to: '2030-01-02T00:00:00.000Z',
      })
      .expect(402);
    await starter.agent.get('/api/activity').expect(402);
    await starter.agent.get('/api/ranks').expect(402);
    await starter.agent
      .post('/api/tasks')
      .send({ title: 'Schedule bypass', startAt: '2030-01-01T09:00:00.000Z' })
      .expect(402);
    await starter.agent.get('/api/tasks/templates/list').expect(402);
  });

  it('unlocks the advertised Growth tools but not Business tools', async () => {
    const growth = await signUpOwner(app, { subscriptionPlan: 'GROWTH' });
    const entitlements = await growth.agent.get('/api/companies/current/entitlements').expect(200);
    expect(entitlements.body.employeeLimit).toBe(50);

    await growth.agent.get('/api/knowledge').expect(200);
    await growth.agent
      .get('/api/schedule')
      .query({
        from: '2030-01-01T00:00:00.000Z',
        to: '2030-01-02T00:00:00.000Z',
      })
      .expect(200);
    await growth.agent.get('/api/activity').expect(200);
    await growth.agent.get('/api/companies/current/metrics').expect(200);
    await growth.agent.get('/api/ranks').expect(402);
    await growth.agent.get('/api/companies/current/analytics').expect(402);
    await growth.agent.get('/api/companies/current/api-keys').expect(402);
  });

  it('provides Business analytics and revocable programmatic API access', async () => {
    const business = await signUpOwner(app, { subscriptionPlan: 'BUSINESS' });
    const entitlements = await business.agent
      .get('/api/companies/current/entitlements')
      .expect(200);
    expect(entitlements.body.employeeLimit).toBe(150);

    await business.agent.get('/api/ranks').expect(200);
    await business.agent.get('/api/companies/current/analytics').expect(200);
    const created = await business.agent
      .post('/api/companies/current/api-keys')
      .send({ name: 'Reporting integration' })
      .expect(201);
    expect(created.body.token).toMatch(/^atlas_live_/);

    await request(app)
      .get('/api/companies/current')
      .set('Authorization', `Bearer ${created.body.token}`)
      .expect(200);

    await business.agent.delete(`/api/companies/current/api-keys/${created.body.id}`).expect(200);
    await request(app)
      .get('/api/companies/current')
      .set('Authorization', `Bearer ${created.body.token}`)
      .expect(401);
  });

  it('reserves multi-company switching and flexible capacity for Enterprise', async () => {
    const primary = await signUpOwner(app);
    const secondary = await signUpOwner(app);
    await prisma.membership.update({
      where: { id: secondary.session.membership.id },
      data: { userId: primary.session.user.id },
    });

    const switched = await primary.agent
      .post('/api/auth/switch-company')
      .send({ membershipId: secondary.session.membership.id })
      .expect(200);
    expect(switched.body.company.id).toBe(secondary.session.company.id);

    const entitlements = await primary.agent.get('/api/companies/current/entitlements').expect(200);
    expect(entitlements.body).toMatchObject({
      plan: 'ENTERPRISE',
      employeeLimit: null,
    });
  });

  it('enforces Starter’s ten-employee ceiling', async () => {
    const starter = await signUpOwner(app, { subscriptionPlan: 'STARTER' });
    for (let index = 0; index < 9; index += 1) {
      await starter.agent
        .post('/api/people')
        .send({ fullName: `Starter Person ${index + 1}` })
        .expect(201);
    }
    const rejected = await starter.agent
      .post('/api/people')
      .send({ fullName: 'One Too Many' })
      .expect(409);
    expect(rejected.body.error.code).toBe('EMPLOYEE_LIMIT_REACHED');
  });

  it('falls an expired paid plan back to Starter and blocks suspended operations', async () => {
    const expired = await signUpOwner(app, { subscriptionPlan: 'GROWTH' });
    await prisma.company.update({
      where: { id: expired.session.company.id },
      data: { subscriptionExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expired.agent.get('/api/knowledge').expect(402);
    const session = await expired.agent.get('/api/auth/session').expect(200);
    expect(session.body.company.subscriptionPlan).toBe('STARTER');

    const suspended = await signUpOwner(app);
    await prisma.company.update({
      where: { id: suspended.session.company.id },
      data: { subscriptionStatus: 'SUSPENDED' },
    });
    await suspended.agent.get('/api/tasks').expect(402);
    await suspended.agent.get('/api/companies/current').expect(200);
  });
});

/* ========================================================================== */
/*  Cross-tenant sweep — "paste user A's URL as user B"                       */
/* ========================================================================== */

describe('cross-tenant isolation', () => {
  let victim: Client;
  let attacker: Client;
  let attackerWorker: ReturnType<typeof request.agent>;
  /** Every id that belongs to the victim company and nobody else. */
  let owned: Record<string, string>;

  beforeAll(async () => {
    victim = await signUpOwner(app, { companyName: `Victim ${Date.now().toString(36)}` });
    attacker = await signUpOwner(app, { companyName: `Attacker ${Date.now().toString(36)}` });

    const attackerCode = await createInviteCode(attacker);
    attackerWorker = (await joinWithCode(app, attackerCode)).agent;

    const task = await victim.agent.post('/api/tasks').send({ title: 'Victim work' }).expect(201);
    const team = await victim.agent
      .post('/api/organization/teams')
      .send({ name: 'Victim Crew', leadId: victim.session.membership.id })
      .expect(201);
    const role = await victim.agent.post('/api/roles').send({ name: 'Victim Role' }).expect(201);
    const doc = await victim.agent
      .post('/api/knowledge')
      .send({ title: 'Victim handbook', contentMarkdown: 'secret', status: 'PUBLISHED' })
      .expect(201);
    const announcement = await victim.agent
      .post('/api/companies/current/announcements')
      .send({ title: 'Victim notice', body: 'Internal only.' })
      .expect(201);
    const inviteCode = await createInviteCode(victim);
    const invites = await victim.agent.get('/api/invites').expect(200);
    const invite = invites.body.items.find((i: { code: string }) => i.code === inviteCode);

    owned = {
      taskId: task.body.id,
      teamId: team.body.id,
      roleId: role.body.id,
      docId: doc.body.id,
      announcementId: announcement.body.id,
      inviteId: invite.id,
      membershipId: victim.session.membership.id,
      companyId: victim.session.company.id,
    };
  });

  /** Anything but a 200 is fine here — 403 and 404 are both honest answers. */
  const forbidden = (status: number) => status === 403 || status === 404 || status === 400;

  it('refuses every read of another company’s records', async () => {
    const reads = [
      `/api/tasks/${owned.taskId}`,
      `/api/people/${owned.membershipId}`,
      `/api/knowledge/${owned.docId}`,
      `/api/schedule/availability/${owned.membershipId}`,
    ];

    for (const path of reads) {
      const response = await attacker.agent.get(path);
      expect(forbidden(response.status), `${path} returned ${response.status}`).toBe(true);
    }
  });

  it('refuses every write to another company’s records', async () => {
    const writes: [string, string, object][] = [
      ['patch', `/api/tasks/${owned.taskId}`, { title: 'Owned by me now' }],
      ['patch', `/api/tasks/${owned.taskId}/status`, { status: 'DONE' }],
      ['delete', `/api/tasks/${owned.taskId}`, {}],
      ['post', `/api/tasks/${owned.taskId}/comments`, { body: 'hello' }],
      ['patch', `/api/organization/teams/${owned.teamId}`, { name: 'Renamed' }],
      ['delete', `/api/organization/teams/${owned.teamId}`, {}],
      ['patch', `/api/roles/${owned.roleId}`, { name: 'Renamed' }],
      ['delete', `/api/roles/${owned.roleId}`, {}],
      ['patch', `/api/knowledge/${owned.docId}`, { title: 'Renamed' }],
      ['delete', `/api/knowledge/${owned.docId}`, {}],
      ['patch', `/api/invites/${owned.inviteId}`, { active: false }],
      ['delete', `/api/invites/${owned.inviteId}`, {}],
      ['delete', `/api/companies/current/announcements/${owned.announcementId}`, {}],
    ];

    for (const [method, path, body] of writes) {
      const agent = attacker.agent as unknown as Record<
        string,
        (p: string) => { send: (b: object) => Promise<{ status: number }> }
      >;
      const response = await agent[method](path).send(body);
      expect(
        forbidden(response.status),
        `${method.toUpperCase()} ${path} returned ${response.status}`,
      ).toBe(true);
    }
  });

  it('leaves the victim’s records untouched after all of that', async () => {
    const task = await victim.agent.get(`/api/tasks/${owned.taskId}`).expect(200);
    expect(task.body.title).toBe('Victim work');
    expect(task.body.status).not.toBe('DONE');
    expect(task.body.comments).toHaveLength(0);

    await victim.agent.get(`/api/knowledge/${owned.docId}`).expect(200);
    const roles = await victim.agent.get('/api/roles').expect(200);
    expect(roles.body.items.map((r: { name: string }) => r.name)).toContain('Victim Role');
  });

  it('never mentions another company in any list endpoint', async () => {
    const lists: [string, string][] = [
      ['/api/people', 'items'],
      ['/api/tasks', 'items'],
      ['/api/roles', 'items'],
      ['/api/companies/current/announcements', 'items'],
    ];

    for (const [path, key] of lists) {
      const response = await attacker.agent.get(path).expect(200);
      const serialized = JSON.stringify(response.body[key]);
      expect(serialized, `${path} leaked a victim id`).not.toContain(owned.taskId);
      expect(serialized, `${path} leaked a victim id`).not.toContain(owned.membershipId);
      expect(serialized, `${path} leaked a victim id`).not.toContain(owned.roleId);
    }
  });

  it('does not leak another company through the chat rooms', async () => {
    const conversations = await attacker.agent.get('/api/chat/conversations').expect(200);
    const ids = conversations.body.items.map((c: { id: string }) => c.id);

    const victimRooms = await victim.agent.get('/api/chat/conversations').expect(200);
    for (const room of victimRooms.body.items) {
      expect(ids).not.toContain(room.id);
      // And the attacker cannot read it by id either, company room or not.
      const response = await attacker.agent.get(`/api/chat/conversations/${room.id}/messages`);
      expect(forbidden(response.status), `chat ${room.id} returned ${response.status}`).toBe(true);
    }
  });

  it('locks every admin surface against a logged-out stranger', async () => {
    const adminPaths = [
      '/api/invites',
      '/api/activity',
      '/api/knowledge',
      '/api/companies/current',
      '/api/roles',
      '/api/people',
      '/api/organization/graph',
      '/api/notifications',
      '/api/schedule/permissions',
      '/api/chat/conversations',
    ];

    for (const path of adminPaths) {
      const response = await request(app).get(path);
      expect(response.status, `${path} answered a stranger with ${response.status}`).toBe(401);
    }
  });

  it('locks every leadership-only write against an ordinary worker', async () => {
    const code = await createInviteCode(attacker);
    const workerAgent = (await joinWithCode(app, code)).agent;

    const writes: [string, string, object][] = [
      ['post', '/api/invites', { role: 'WORKER' }],
      ['post', '/api/roles', { name: 'Self Promotion' }],
      ['post', '/api/organization/teams', { name: 'My Own Team' }],
      ['post', '/api/knowledge', { title: 'Should not exist' }],
      [
        'post',
        '/api/companies/current/announcements',
        { title: 'Hello all', body: 'From a worker.' },
      ],
      ['patch', '/api/companies/current', { name: 'Renamed By A Worker' }],
      ['post', '/api/people', { fullName: 'Ghost Employee' }],
    ];

    for (const [method, path, body] of writes) {
      const agent = workerAgent as unknown as Record<
        string,
        (p: string) => { send: (b: object) => Promise<{ status: number }> }
      >;
      const response = await agent[method](path).send(body);
      expect(response.status, `${method.toUpperCase()} ${path} returned ${response.status}`).toBe(
        403,
      );
    }
  });

  it('does not let a worker in another company reach any of it either', async () => {
    const response = await attackerWorker.get(`/api/tasks/${owned.taskId}`);
    expect(forbidden(response.status)).toBe(true);
    const person = await attackerWorker.get(`/api/people/${owned.membershipId}`);
    expect(forbidden(person.status)).toBe(true);
  });
});
