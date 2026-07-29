import request from 'supertest';
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

  const response = await agent.post('/api/auth/owner-signup').send(payload);
  if (response.status !== 201) {
    throw new Error(`Owner sign-up failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  const subscriptionPlan = overrides.subscriptionPlan ?? 'ENTERPRISE';
  if (subscriptionPlan !== 'STARTER') {
    await prisma.company.update({
      where: { id: response.body.company.id },
      data: { subscriptionPlan },
    });
    response.body.company.subscriptionPlan = subscriptionPlan;
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
