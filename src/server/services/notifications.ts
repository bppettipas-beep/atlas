import type { NotificationType } from '@prisma/client';
import { prisma } from '../prisma';
import { emitNotification } from '../realtime/io';
import { sendNotificationEmail } from './email';
import { serializeNotification } from './serializers';

export interface CreateNotificationInput {
  companyId: string;
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  taskId?: string | null;
}

interface PreferenceRow {
  taskAssigned: boolean;
  mentions: boolean;
  teamChanges: boolean;
  knowledgeUpdates: boolean;
  dueDateChanges: boolean;
  announcements: boolean;
  taskComments: boolean;
  companyActivity: boolean;
}

/**
 * Maps a notification type onto the switch that silences it.
 *
 * `null` means the type cannot be turned off. Those are the ones where being
 * uninformed causes a problem for somebody else — work that has gone overdue or
 * blocked, or a task that came back rejected.
 */
const PREFERENCE_FOR_TYPE: Record<NotificationType, keyof PreferenceRow | null> = {
  TASK_ASSIGNED: 'taskAssigned',
  TASK_MENTIONED: 'mentions',
  TASK_STATUS_CHANGED: null,
  TASK_DUE_CHANGED: 'dueDateChanges',
  TASK_OVERDUE: null,
  TASK_BLOCKED: null,
  TASK_APPROVED: null,
  TASK_CREATED: 'companyActivity',
  TASK_COMPLETED: 'companyActivity',
  TASK_COMMENTED: 'taskComments',
  TEAM_ADDED: 'teamChanges',
  MEMBER_JOINED: 'teamChanges',
  MEMBER_LEFT: 'companyActivity',
  ROLE_ASSIGNED: 'teamChanges',
  DOCUMENT_PUBLISHED: 'knowledgeUpdates',
  DOCUMENT_ACK_REQUESTED: 'knowledgeUpdates',
  ANNOUNCEMENT: 'announcements',
};

export async function notify(input: CreateNotificationInput) {
  // Nobody needs telling about their own actions. This is also why a company
  // with one person in it sees no notifications at all: they are the actor
  // every time. It is correct, and it is not a sign the system is asleep.
  if (input.actorId && input.actorId === input.recipientId) return null;

  const recipient = await prisma.membership.findUnique({
    where: { id: input.recipientId },
    select: {
      isPlaceholder: true,
      status: true,
      deactivatedAt: true,
      notificationPreference: true,
      user: { select: { email: true, fullName: true } },
    },
  });

  // A placeholder has no login, so a notification for one is a row nobody will
  // ever read. Someone who has left should not accrue them either.
  if (!recipient || recipient.isPlaceholder) return null;
  if (recipient.status !== 'ACTIVE' || recipient.deactivatedAt) return null;

  const key = PREFERENCE_FOR_TYPE[input.type];
  if (key && recipient.notificationPreference?.[key] === false) return null;

  const notification = await prisma.notification.create({
    data: {
      companyId: input.companyId,
      recipientId: input.recipientId,
      actorId: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      taskId: input.taskId ?? null,
    },
  });

  emitNotification(input.recipientId, serializeNotification(notification));

  // Not awaited, on purpose. A leadership fan-out calls this once per person,
  // so awaiting Resend here would add its round trip to the request that
  // triggered it — several seconds on a busy company, and up to the ten second
  // timeout each if the provider is slow. The notification is already
  // committed and already on the socket; the email is a side effect of it.
  if (recipient.notificationPreference?.emailNotifications !== false) {
    void sendNotificationEmail({
      to: recipient.user.email,
      recipientName: recipient.user.fullName,
      title: notification.title,
      body: notification.body,
      link: {
        taskId: notification.taskId,
        entityType: notification.entityType,
        entityId: notification.entityId,
      },
    }).catch((error) => {
      console.error('Atlas could not send notification email.', error);
    });
  }

  return notification;
}

export async function notifyMany(inputs: CreateNotificationInput[]) {
  const results = [];
  for (const input of inputs) {
    results.push(await notify(input));
  }
  return results;
}

export interface LeadershipNotificationInput extends Omit<CreateNotificationInput, 'recipientId'> {
  /** Owners only. Defaults to false, which includes managers. */
  ownersOnly?: boolean;
  /** People already told directly, so they do not get the same thing twice. */
  except?: (string | null | undefined)[];
}

/**
 * Tells the people who run the company that something happened in it.
 *
 * This is the answer to "the owner should know when anything happens": the
 * per-person notifications above only reach whoever the work belongs to, so
 * without this an owner hears nothing about a company they are responsible for.
 * The actor is always excluded, so it reads as a feed of other people's work
 * rather than an echo of your own.
 */
export async function notifyLeadership(input: LeadershipNotificationInput) {
  const leaders = await prisma.membership.findMany({
    where: {
      companyId: input.companyId,
      status: 'ACTIVE',
      deactivatedAt: null,
      isPlaceholder: false,
      role: input.ownersOnly
        ? { in: ['OWNER', 'CO_OWNER'] }
        : { in: ['OWNER', 'CO_OWNER', 'MANAGER'] },
    },
    select: { id: true },
  });

  const skip = new Set(
    [...(input.except ?? []), input.actorId].filter((id): id is string => Boolean(id)),
  );

  const { ownersOnly: _ownersOnly, except: _except, ...rest } = input;
  return notifyMany(
    leaders
      .filter((leader) => !skip.has(leader.id))
      .map((leader) => ({ ...rest, recipientId: leader.id })),
  );
}

/** Ensures a preference row exists so the settings screen always has values. */
export async function ensureNotificationPreference(membershipId: string) {
  return prisma.notificationPreference.upsert({
    where: { membershipId },
    update: {},
    create: { membershipId },
  });
}
