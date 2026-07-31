import request, { type Response } from 'supertest';
import type { Express } from 'express';
import type { SessionUserDto } from '../src/shared/types';
import type { SubscriptionPlanKey } from '../src/shared/plans';
import { prisma } from '../src/server/prisma';

/**
 * A signed-in client. `agent` keeps the auth cookies between requests, which is
 * exactly how the browser behaves, so the tests exercise the real cookie flow
 * rather than a shortcut.
 */
export interface Client {
  agent: ReturnType<typeof request.agent>;
  session: SessionUserDto;
}

let counter = 0;
/** Unique-per-run so tests never collide on the unique email index. */
export const uniqueEmail = (prefix: string) => {
  counter += 1;
  return `${prefix}.${Date.now().toString(36)}.${counter}@atlas.test`;
};

export const STRONG_PASSWORD = 'CorrectHorseBattery9';

export async function completePendingSignup(
  agent: ReturnType<typeof request.agent>,
  pending: Response,
) {
  if (pending.status !== 202 || !pending.body.verificationId || !pending.body.testCode) {
    throw new Error(`Expected pending sign-up: ${JSON.stringify(pending.body)}`);
  }
  return agent.post('/api/auth/verify-email-code').send({
    verificationId: pending.body.verificationId,
    code: pending.body.testCode,
  });
}

export async function signUpOwner(
  app: Express,
  overrides: Partial<{
    fullName: string;
    email: string;
    password: string;
    companyName: string;
    subscriptionPlan: SubscriptionPlanKey;
  }> = {},
): Promise<Client> {
  const agent = request.agent(app);
  const payload = {
    fullName: overrides.fullName ?? 'Ada Owner',
    email: overrides.email ?? uniqueEmail('owner'),
    password: overrides.password ?? STRONG_PASSWORD,
    companyName: overrides.companyName ?? `Test Co ${Date.now().toString(36)}${counter}`,
    industry: 'Facilities & Cleaning Services',
    sizeRange: '10-25',
    location: 'Portland, Oregon',
    timezone: 'UTC',
  };

  const account = await agent.post('/api/auth/account-signup').send({
    fullName: payload.fullName,
    email: payload.email,
    password: payload.password,
  });
  if (account.status !== 202) {
    throw new Error(`Account sign-up failed (${account.status}): ${JSON.stringify(account.body)}`);
  }
  const verified = await completePendingSignup(agent, account);
  if (verified.status !== 200) {
    throw new Error(`Account verification failed: ${JSON.stringify(verified.body)}`);
  }
  const subscriptionPlan = overrides.subscriptionPlan ?? 'ENTERPRISE';
  await prisma.user.update({
    where: { id: verified.body.user.id },
    data: {
      emailVerifiedAt: new Date(),
      accountPlan: subscriptionPlan,
      accountSubscriptionStatus: 'ACTIVE',
    },
  });
  const response = await agent.post('/api/auth/owner-signup').send({
    companyName: payload.companyName,
    industry: payload.industry,
    sizeRange: payload.sizeRange,
    location: payload.location,
    timezone: payload.timezone,
  });
  if (response.status !== 201) {
    throw new Error(`Owner sign-up failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return { agent, session: response.body as SessionUserDto };
}

export async function joinWithCode(
  app: Express,
  code: string,
  overrides: Partial<{ fullName: string; email: string; password: string; jobTitle: string }> = {},
) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/worker-join').send({
    fullName: overrides.fullName ?? 'Theo Worker',
    email: overrides.email ?? uniqueEmail('worker'),
    password: overrides.password ?? STRONG_PASSWORD,
    code,
    jobTitle: overrides.jobTitle ?? 'Cleaning Technician',
  });
  return { agent, response };
}

/** Creates an invitation code as the given owner/manager client. */
export async function createInviteCode(
  client: Client,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await client.agent.post('/api/invites').send({ role: 'WORKER', ...overrides });
  if (response.status !== 201) {
    throw new Error(
      `Invite creation failed (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }
  return response.body.code as string;
}
