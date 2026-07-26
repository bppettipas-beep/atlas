import type { NotificationType } from '@prisma/client';
import { prisma } from '../prisma';
import { emitNotification } from '../realtime/io';
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

/** Maps a notification type onto the user's preference switch. */
const PREFERENCE_FOR_TYPE: Record<NotificationType, keyof PreferenceRow | null> = {
  TASK_ASSIGNED: 'taskAssigned',
  TASK_MENTIONED: 'mentions',
  TASK_STATUS_CHANGED: null,
  TASK_DUE_CHANGED: 'dueDateChanges',
  TASK_OVERDUE: null,
  TASK_BLOCKED: null,
  TASK_APPROVED: null,
  TEAM_ADDED: 'teamChanges',
  MEMBER_JOINED: 'teamChanges',
  DOCUMENT_PUBLISHED: 'knowledgeUpdates',
  DOCUMENT_ACK_REQUESTED: 'knowledgeUpdates',
  ANNOUNCEMENT: 'announcements',
};

interface PreferenceRow {
  taskAssigned: boolean;
  mentions: boolean;
  teamChanges: boolean;
  knowledgeUpdates: boolean;
  dueDateChanges: boolean;
  announcements: boolean;
}

async function isMuted(recipientId: string, type: NotificationType): Promise<boolean> {
  const key = PREFERENCE_FOR_TYPE[type];
  if (!key) return false;
  const preference = await prisma.notificationPreference.findUnique({
    where: { membershipId: recipientId },
  });
  if (!preference) return false;
  return preference[key] === false;
}

export async function notify(input: CreateNotificationInput) {
  // Never notify people about their own actions.
  if (input.actorId && input.actorId === input.recipientId) return null;
  if (await isMuted(input.recipientId, input.type)) return null;

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
  return notification;
}

export async function notifyMany(inputs: CreateNotificationInput[]) {
  const results = [];
  for (const input of inputs) {
    results.push(await notify(input));
  }
  return results;
}

/** Ensures a preference row exists so the settings screen always has values. */
export async function ensureNotificationPreference(membershipId: string) {
  return prisma.notificationPreference.upsert({
    where: { membershipId },
    update: {},
    create: { membershipId },
  });
}
