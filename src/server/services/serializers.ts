import type {
  ActivityEventDto,
  AnnouncementDto,
  InviteCodeDto,
  KnowledgeDocumentSummary,
  NotificationDto,
  OrgEdgeDto,
  PersonSummary,
  TaskAttachmentDto,
  TaskCommentDto,
  TaskSummary,
  TeamDto,
} from '../../shared/types';
import { env } from '../env';
import { isOverdue } from '../lib/dates';

type Nullable<T> = T | null | undefined;

const iso = (value: Nullable<Date>) => (value ? value.toISOString() : null);

// The `any` usage below is deliberate and contained: these helpers take Prisma
// query results whose shapes vary with each `include`, and re-declaring every
// permutation as a named type would add far more noise than safety.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function serializeCompany(company: any) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    industry: company.industry ?? null,
    sizeRange: company.sizeRange ?? null,
    location: company.location ?? null,
    timezone: company.timezone,
    logoUrl: company.logoUrl ?? null,
    createdAt: company.createdAt.toISOString(),
  };
}

export function serializePerson(membership: any): PersonSummary {
  return {
    id: membership.id,
    userId: membership.userId,
    fullName: membership.user.fullName,
    email: membership.user.email,
    avatarUrl: membership.user.avatarUrl ?? null,
    role: membership.role,
    status: membership.status,
    jobTitle: membership.jobTitle ?? null,
    managerId: membership.managerId ?? null,
    availability: membership.profile?.availability ?? 'AVAILABLE',
    headline: membership.profile?.headline ?? null,
    assignedRole: membership.assignedRole
      ? {
          id: membership.assignedRole.id,
          name: membership.assignedRole.name,
          color: membership.assignedRole.color,
        }
      : null,
    teams: (membership.teamMemberships ?? []).map((tm: any) => ({
      id: tm.team.id,
      name: tm.team.name,
      color: tm.team.color ?? null,
    })),
  };
}

export function serializeTeam(team: any): TeamDto {
  return {
    id: team.id,
    name: team.name,
    description: team.description ?? null,
    color: team.color ?? null,
    leadId: team.leadId ?? null,
    memberCount: team._count?.members ?? team.members?.length ?? 0,
    members: team.members
      ? team.members.map((tm: any) => ({
          id: tm.membership.id,
          fullName: tm.membership.user.fullName,
          jobTitle: tm.membership.jobTitle ?? null,
          avatarUrl: tm.membership.user.avatarUrl ?? null,
        }))
      : undefined,
  };
}

export function serializeTaskSummary(task: any): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: iso(task.dueAt),
    completionPercent: task.completionPercent,
    isOverdue: isOverdue(task.dueAt ?? null, task.status),
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          fullName: task.assignee.user.fullName,
          avatarUrl: task.assignee.user.avatarUrl ?? null,
        }
      : null,
    team: task.team
      ? { id: task.team.id, name: task.team.name, color: task.team.color ?? null }
      : null,
  };
}

export function attachmentUrl(storageKey: string) {
  return `/uploads/${storageKey}`;
}

export function serializeAttachment(attachment: any): TaskAttachmentDto {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: attachmentUrl(attachment.storageKey),
    kind: attachment.kind,
    createdAt: attachment.createdAt.toISOString(),
    uploadedBy: attachment.uploader
      ? { id: attachment.uploader.id, fullName: attachment.uploader.user.fullName }
      : null,
  };
}

export function serializeComment(comment: any): TaskCommentDto {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: comment.author
      ? {
          id: comment.author.id,
          fullName: comment.author.user.fullName,
          avatarUrl: comment.author.user.avatarUrl ?? null,
        }
      : null,
    mentions: (comment.mentions ?? []).map((mention: any) => ({
      id: mention.membership.id,
      fullName: mention.membership.user.fullName,
    })),
    attachments: (comment.attachments ?? []).map(serializeAttachment),
  };
}

export function serializeActivity(event: any): ActivityEventDto {
  return {
    id: event.id,
    type: event.type,
    summary: event.summary,
    createdAt: event.createdAt.toISOString(),
    metadata: (event.metadata as Record<string, unknown> | null) ?? null,
    actor: event.actor
      ? {
          id: event.actor.id,
          fullName: event.actor.user.fullName,
          avatarUrl: event.actor.user.avatarUrl ?? null,
        }
      : null,
    target: event.target ? { id: event.target.id, fullName: event.target.user.fullName } : null,
    taskId: event.taskId ?? null,
    documentId: event.documentId ?? null,
    teamId: event.teamId ?? null,
  };
}

export function serializeNotification(notification: any): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body ?? null,
    entityType: notification.entityType ?? null,
    entityId: notification.entityId ?? null,
    taskId: notification.taskId ?? null,
    readAt: iso(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
}

export function serializeDocumentSummary(
  document: any,
  viewerMembershipId: string,
): KnowledgeDocumentSummary {
  const acks = document.acknowledgments ?? [];
  return {
    id: document.id,
    title: document.title,
    slug: document.slug,
    category: document.category,
    excerpt: document.excerpt ?? null,
    tags: document.tags ?? [],
    status: document.status,
    requiresAcknowledgment: document.requiresAcknowledgment,
    version: document.version,
    updatedAt: document.updatedAt.toISOString(),
    owner: document.owner
      ? {
          id: document.owner.id,
          fullName: document.owner.user.fullName,
          avatarUrl: document.owner.user.avatarUrl ?? null,
        }
      : null,
    team: document.team ? { id: document.team.id, name: document.team.name } : null,
    acknowledgedByMe: acks.some((ack: any) => ack.membershipId === viewerMembershipId),
    acknowledgmentCount: document._count?.acknowledgments ?? acks.length,
  };
}

export function serializeInviteCode(invite: any): InviteCodeDto {
  const expired = invite.expiresAt ? invite.expiresAt.getTime() < Date.now() : false;
  const exhausted = invite.maxUses !== null && invite.useCount >= invite.maxUses;
  const origin = env.allowedOrigins[0] ?? '';
  return {
    id: invite.id,
    code: invite.code,
    label: invite.label ?? null,
    role: invite.role,
    teamId: invite.teamId ?? null,
    teamName: invite.team?.name ?? null,
    expiresAt: iso(invite.expiresAt),
    maxUses: invite.maxUses ?? null,
    useCount: invite.useCount,
    active: invite.active,
    isUsable: invite.active && !expired && !exhausted,
    createdAt: invite.createdAt.toISOString(),
    joinUrl: `${origin}/join?code=${invite.code}`,
  };
}

export function serializeAnnouncement(announcement: any): AnnouncementDto {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    pinned: announcement.pinned,
    createdAt: announcement.createdAt.toISOString(),
    author: announcement.author
      ? {
          id: announcement.author.id,
          fullName: announcement.author.user.fullName,
          avatarUrl: announcement.author.user.avatarUrl ?? null,
        }
      : null,
  };
}

export function serializeOrgEdge(relationship: any, derived = false): OrgEdgeDto {
  return {
    id: relationship.id,
    source: relationship.sourceNodeId,
    target: relationship.targetNodeId,
    type: relationship.type,
    label: relationship.label ?? null,
    strength: relationship.strength ?? 1,
    derived,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// Prisma `include` shapes reused across routes so serializers always get the
// relations they expect.
export const personInclude = {
  user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  profile: true,
  assignedRole: { select: { id: true, name: true, color: true } },
  teamMemberships: { include: { team: true } },
} as const;

export const taskSummaryInclude = {
  assignee: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
  team: true,
} as const;

export const activityInclude = {
  actor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
  target: { include: { user: { select: { fullName: true } } } },
} as const;
