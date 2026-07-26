import type { ActivityType, ActivityVisibility, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { emitToCompany, emitToLeadership } from '../realtime/io';

export interface RecordActivityInput {
  companyId: string;
  type: ActivityType;
  summary: string;
  actorId?: string | null;
  targetId?: string | null;
  teamId?: string | null;
  taskId?: string | null;
  documentId?: string | null;
  visibility?: ActivityVisibility;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Appends an event to the company timeline. Every meaningful state change in
 * Atlas goes through here — that is what gives the business a "memory".
 */
export async function recordActivity(input: RecordActivityInput) {
  const event = await prisma.activityEvent.create({
    data: {
      companyId: input.companyId,
      type: input.type,
      summary: input.summary,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      teamId: input.teamId ?? null,
      taskId: input.taskId ?? null,
      documentId: input.documentId ?? null,
      visibility: input.visibility ?? 'COMPANY',
      metadata: input.metadata,
    },
  });

  // Only a lightweight ping is broadcast; clients refetch the feed they are
  // allowed to see so manager-only events never leak to workers.
  if (event.visibility === 'MANAGERS') {
    emitToLeadership(input.companyId, 'activity:new', { activityId: event.id });
  } else {
    emitToCompany(input.companyId, 'activity:new', { activityId: event.id });
  }

  return event;
}
