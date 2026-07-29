import { Router } from 'express';
import { PermissionScope } from '@prisma/client';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ApiError, asyncHandler } from '../http/errors';
import { booleanQuery, parsedQuery, validateBody, validateQuery } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { canAccessMembership, hasPermission, PERMISSIONS } from '../services/authorization';
import { endOfDay, startOfDay } from '../lib/dates';
import { upload } from '../lib/uploads';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify, notifyLeadership } from '../services/notifications';
import { canEditTask, canViewTask, isLeadership, managedTeamIds } from '../services/permissions';
import { computeNextRun, escalateTask } from '../services/taskAutomation';
import {
  activityInclude,
  serializeActivity,
  serializeAttachment,
  serializeComment,
  serializeTaskSummary,
  taskSummaryInclude,
} from '../services/serializers';
import type { TaskDetail } from '../../shared/types';

export const tasksRouter = Router();

tasksRouter.use(requireAuth, requirePermission(PERMISSIONS.TASKS_VIEW));

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_REVIEW', 'DONE'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const detailInclude = {
  ...taskSummaryInclude,
  createdBy: { include: { user: { select: { fullName: true } } } },
  approvedBy: { include: { user: { select: { fullName: true } } } },
  scheduledBy: { include: { user: { select: { fullName: true } } } },
  document: { select: { id: true, title: true, category: true } },
  subtasks: { orderBy: { position: 'asc' } },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      mentions: { include: { membership: { include: { user: { select: { fullName: true } } } } } },
      attachments: { include: { uploader: { include: { user: { select: { fullName: true } } } } } },
    },
  },
  attachments: {
    where: { commentId: null },
    include: { uploader: { include: { user: { select: { fullName: true } } } } },
    orderBy: { createdAt: 'desc' },
  },
} as const;

/** Loads a task, checks company ownership, and checks read permission. */
async function loadTask(id: string, auth: ReturnType<typeof currentAuth>) {
  const task = await prisma.task.findFirst({
    where: { id, companyId: auth.companyId, archivedAt: null },
    include: detailInclude,
  });
  if (!task) throw ApiError.notFound('That task no longer exists.');
  if (!(await canViewTask(auth, task))) {
    throw ApiError.forbidden('You do not have access to that task.');
  }
  return task;
}

type TaskWithDetail = Awaited<ReturnType<typeof loadTask>>;

async function toDetail(
  task: TaskWithDetail,
  auth: ReturnType<typeof currentAuth>,
): Promise<TaskDetail> {
  const history = await prisma.activityEvent.findMany({
    where: {
      taskId: task.id,
      ...(isLeadership(auth) ? {} : { visibility: 'COMPANY' }),
    },
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  return {
    ...serializeTaskSummary(task),
    description: task.description,
    location: task.location,
    startAt: task.startAt?.toISOString() ?? null,
    endAt: task.endAt?.toISOString() ?? null,
    scheduledBy: task.scheduledBy
      ? { id: task.scheduledBy.id, fullName: task.scheduledBy.user.fullName }
      : null,
    requiresApproval: task.requiresApproval,
    requiresProofPhoto: task.requiresProofPhoto,
    blockedReason: task.blockedReason,
    blockedAt: task.blockedAt?.toISOString() ?? null,
    completionNote: task.completionNote,
    completedAt: task.completedAt?.toISOString() ?? null,
    approvedAt: task.approvedAt?.toISOString() ?? null,
    escalatedAt: task.escalatedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    createdBy: task.createdBy
      ? { id: task.createdBy.id, fullName: task.createdBy.user.fullName }
      : null,
    approvedBy: task.approvedBy
      ? { id: task.approvedBy.id, fullName: task.approvedBy.user.fullName }
      : null,
    document: task.document,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      done: subtask.done,
      position: subtask.position,
    })),
    comments: task.comments.map(serializeComment),
    attachments: task.attachments.map(serializeAttachment),
    history: history.map(serializeActivity),
  };
}

/** Restricts a worker's task list to work they are allowed to see. */
async function visibilityFilter(auth: ReturnType<typeof currentAuth>) {
  if (isLeadership(auth)) return {};
  const teamIds = await managedTeamIds(auth);
  return {
    OR: [
      { assigneeId: auth.membershipId },
      { createdById: auth.membershipId },
      ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
    ],
  };
}

// -------------------------------- list -------------------------------------

const listQuerySchema = z.object({
  status: z
    .union([z.enum(STATUSES), z.array(z.enum(STATUSES))])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    ),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  search: z.string().trim().max(160).optional(),
  scope: z.enum(['all', 'mine', 'unassigned', 'overdue', 'today']).default('all'),
  includeDone: booleanQuery(true),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

tasksRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<z.infer<typeof listQuerySchema>>(res);
    const now = new Date();

    const scopeFilter: Prisma.TaskWhereInput =
      query.scope === 'mine'
        ? { assigneeId: auth.membershipId }
        : query.scope === 'unassigned'
          ? { assigneeId: null, status: { not: 'DONE' as const } }
          : query.scope === 'overdue'
            ? { dueAt: { lt: now }, status: { not: 'DONE' as const } }
            : query.scope === 'today'
              ? { dueAt: { gte: startOfDay(now), lte: endOfDay(now) } }
              : {};

    // Conditions are collected into AND rather than spread as sibling keys.
    // Spreading meant the last writer of a key silently replaced the earlier
    // ones — and since both the visibility rule and the search are expressed as
    // `OR`, a worker who typed anything into the search box had their
    // visibility filter overwritten and saw the whole company's tasks.
    const conditions: Prisma.TaskWhereInput[] = [await visibilityFilter(auth)];

    if (query.status) conditions.push({ status: { in: query.status } });
    if (!query.includeDone) conditions.push({ status: { not: 'DONE' } });
    if (query.search) {
      conditions.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' as const } },
          { description: { contains: query.search, mode: 'insensitive' as const } },
          { location: { contains: query.search, mode: 'insensitive' as const } },
        ],
      });
    }

    const where: Prisma.TaskWhereInput = {
      companyId: auth.companyId,
      archivedAt: null,
      ...scopeFilter,
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      AND: conditions,
    };
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: taskSummaryInclude,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        take: query.limit,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ items: tasks.map(serializeTaskSummary), total });
  }),
);

tasksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    res.json(await toDetail(task, auth));
  }),
);

// ------------------------------- create ------------------------------------

const createSchema = z.object({
  title: z.string().trim().min(2, 'Give the task a clear title').max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  status: z.enum(STATUSES).default('NOT_STARTED'),
  dueAt: z.coerce.date().nullable().optional(),
  // startAt/endAt are the booking. A task with a startAt is on the Schedule.
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  documentId: z.string().min(1).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  requiresApproval: z.boolean().default(false),
  requiresProofPhoto: z.boolean().default(false),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

async function assertRelationsInCompany(
  companyId: string,
  input: { assigneeId?: string | null; teamId?: string | null; documentId?: string | null },
) {
  if (input.assigneeId) {
    const assignee = await prisma.membership.findFirst({
      where: { id: input.assigneeId, companyId, deactivatedAt: null },
    });
    if (!assignee) throw ApiError.badRequest('That assignee is not in your company.');
  }
  if (input.teamId) {
    const team = await prisma.team.findFirst({ where: { id: input.teamId, companyId } });
    if (!team) throw ApiError.badRequest('That team is not in your company.');
  }
  if (input.documentId) {
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id: input.documentId, companyId },
    });
    if (!document) throw ApiError.badRequest('That document is not in your company.');
  }
}

tasksRouter.post(
  '/',
  requirePermission(PERMISSIONS.TASKS_CREATE),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof createSchema>;

    await assertRelationsInCompany(auth.companyId, input);
    const createGrants = await hasPermission(auth, PERMISSIONS.TASKS_CREATE);
    const sharesTargetTeam = input.teamId && createGrants.some((grant) => grant.scope === PermissionScope.TEAM)
      ? Boolean(await prisma.teamMembership.findFirst({
          where: { teamId: input.teamId, membershipId: auth.membershipId },
          select: { id: true },
        }))
      : false;
    const canCreate =
      createGrants.some((grant) => grant.scope === PermissionScope.COMPANY_WIDE) ||
      (input.assigneeId === auth.membershipId &&
        createGrants.some((grant) =>
          grant.scope === PermissionScope.OWN || grant.scope === PermissionScope.ASSIGNED)) ||
      (Boolean(input.assigneeId) &&
        await canAccessMembership(auth, PERMISSIONS.TASKS_CREATE, input.assigneeId!)) ||
      (Boolean(input.teamId) &&
        createGrants.some((grant) =>
          (grant.scope === PermissionScope.SELECTED_TEAMS &&
            grant.selectedTeamIds.includes(input.teamId!)) ||
          (grant.scope === PermissionScope.TEAM && sharesTargetTeam)));
    if (!canCreate) {
      throw ApiError.forbidden('Your task creation scope does not include that assignee or team.');
    }

    const task = await prisma.task.create({
      data: {
        companyId: auth.companyId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status: input.status,
        dueAt: input.dueAt ?? null,
        startAt: input.startAt ?? null,
        endAt: input.startAt ? (input.endAt ?? null) : null,
        scheduledById: input.startAt ? auth.membershipId : null,
        assigneeId: input.assigneeId ?? null,
        teamId: input.teamId ?? null,
        documentId: input.documentId ?? null,
        location: input.location ?? null,
        requiresApproval: input.requiresApproval,
        requiresProofPhoto: input.requiresProofPhoto,
        createdById: auth.membershipId,
        subtasks: {
          create: input.subtasks.map((title, index) => ({ title, position: index })),
        },
      },
      include: detailInclude,
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TASK_CREATED',
      summary: `${auth.fullName} created "${task.title}"`,
      actorId: auth.membershipId,
      targetId: task.assigneeId,
      taskId: task.id,
      teamId: task.teamId,
    });

    if (task.assigneeId) {
      await notify({
        companyId: auth.companyId,
        recipientId: task.assigneeId,
        actorId: auth.membershipId,
        type: 'TASK_ASSIGNED',
        title: `New task: ${task.title}`,
        body: task.dueAt ? `Due ${task.dueAt.toLocaleString()}.` : 'No due date set.',
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    // The people running the company see the work appear. The assignee is
    // excluded because they were just told directly, and the creator because
    // notifyLeadership never reports your own actions back to you.
    await notifyLeadership({
      companyId: auth.companyId,
      actorId: auth.membershipId,
      except: [task.assigneeId],
      type: 'TASK_CREATED',
      title: `New task: ${task.title}`,
      body: task.assigneeId
        ? `${auth.fullName} created this.`
        : `${auth.fullName} created this and left it unassigned.`,
      entityType: 'task',
      entityId: task.id,
      taskId: task.id,
    });

    emitToCompany(auth.companyId, 'task:created', { taskId: task.id });
    res.status(201).json(await toDetail(task, auth));
  }),
);

// ------------------------------- update ------------------------------------

const updateSchema = createSchema
  .partial()
  .omit({ subtasks: true, status: true })
  .extend({
    completionPercent: z.coerce.number().int().min(0).max(100).optional(),
  });

tasksRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await loadTask(req.params.id, auth);
    if (!(await canEditTask(auth, existing))) {
      throw ApiError.forbidden('You can only change tasks assigned to you.');
    }

    const input = req.body as z.infer<typeof updateSchema>;
    if (!isLeadership(auth) && input.assigneeId && input.assigneeId !== auth.membershipId) {
      throw ApiError.forbidden('Only owners and managers can reassign work.');
    }
    await assertRelationsInCompany(auth.companyId, input);

    const dueChanged =
      input.dueAt !== undefined &&
      (input.dueAt?.getTime() ?? null) !== (existing.dueAt?.getTime() ?? null);
    const assigneeChanged =
      input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId;

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...(Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ) as Record<string, unknown>),
        // A new due date deserves a fresh escalation window.
        ...(dueChanged ? { escalatedAt: null } : {}),
      },
      include: detailInclude,
    });

    if (assigneeChanged && task.assigneeId) {
      await recordActivity({
        companyId: auth.companyId,
        type: 'TASK_ASSIGNED',
        summary: `${auth.fullName} assigned "${task.title}" to ${task.assignee?.user.fullName ?? 'someone'}`,
        actorId: auth.membershipId,
        targetId: task.assigneeId,
        taskId: task.id,
      });
      await notify({
        companyId: auth.companyId,
        recipientId: task.assigneeId,
        actorId: auth.membershipId,
        type: 'TASK_ASSIGNED',
        title: `You were assigned: ${task.title}`,
        body: task.dueAt ? `Due ${task.dueAt.toLocaleString()}.` : null,
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    if (dueChanged && task.assigneeId) {
      await notify({
        companyId: auth.companyId,
        recipientId: task.assigneeId,
        actorId: auth.membershipId,
        type: 'TASK_DUE_CHANGED',
        title: `Deadline changed: ${task.title}`,
        body: task.dueAt ? `Now due ${task.dueAt.toLocaleString()}.` : 'The due date was removed.',
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.json(await toDetail(task, auth));
  }),
);

// --------------------------- status transitions ----------------------------

const statusSchema = z
  .object({
    status: z.enum(STATUSES),
    blockedReason: z.string().trim().max(1000).optional(),
    completionNote: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'BLOCKED' && !value.blockedReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedReason'],
        message: 'Explain what is blocking you so your manager can help.',
      });
    }
  });

tasksRouter.patch(
  '/:id/status',
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await loadTask(req.params.id, auth);
    const input = req.body as z.infer<typeof statusSchema>;

    const isAssignee = existing.assigneeId === auth.membershipId;
    if (!isAssignee && !(await canEditTask(auth, existing))) {
      throw ApiError.forbidden('Only the assignee, a manager or the owner can move this task.');
    }

    // A task that needs sign-off cannot be marked Done directly by the worker.
    let nextStatus = input.status;
    if (
      nextStatus === 'DONE' &&
      existing.requiresApproval &&
      !isLeadership(auth) &&
      existing.status !== 'AWAITING_REVIEW'
    ) {
      nextStatus = 'AWAITING_REVIEW';
    }

    if (nextStatus === 'DONE' && existing.requiresProofPhoto) {
      const proof = await prisma.taskAttachment.count({
        where: { taskId: existing.id, kind: 'COMPLETION_PROOF' },
      });
      if (proof === 0) {
        throw ApiError.badRequest(
          'This task needs a completion photo before it can be marked done.',
          'PROOF_REQUIRED',
        );
      }
    }

    const now = new Date();
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        blockedReason: nextStatus === 'BLOCKED' ? (input.blockedReason ?? null) : null,
        blockedAt: nextStatus === 'BLOCKED' ? now : null,
        completionNote: input.completionNote ?? existing.completionNote,
        completedAt: nextStatus === 'DONE' ? now : null,
        completionPercent: nextStatus === 'DONE' ? 100 : existing.completionPercent,
        ...(nextStatus === 'DONE' ? { escalatedAt: null } : {}),
      },
      include: detailInclude,
    });

    await recordActivity({
      companyId: auth.companyId,
      type:
        nextStatus === 'DONE'
          ? 'TASK_COMPLETED'
          : nextStatus === 'BLOCKED'
            ? 'TASK_BLOCKED'
            : 'TASK_STATUS_CHANGED',
      summary:
        nextStatus === 'DONE'
          ? `${auth.fullName} completed "${task.title}"`
          : nextStatus === 'BLOCKED'
            ? `${auth.fullName} reported "${task.title}" as blocked`
            : `${auth.fullName} moved "${task.title}" to ${nextStatus.replace('_', ' ').toLowerCase()}`,
      actorId: auth.membershipId,
      targetId: task.assigneeId,
      taskId: task.id,
      metadata: { from: existing.status, to: nextStatus },
    });

    // Escalation stamps `escalatedAt` on the row, so the response has to be
    // built from a fresh read — otherwise the client is told the blocker was
    // never escalated when in fact the manager has already been notified.
    let current = task;
    if (nextStatus === 'BLOCKED') {
      await escalateTask(task.id, 'BLOCKED');
      current = await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        include: detailInclude,
      });
    }

    // Tell whoever cares: the assignee, the creator, and reviewers.
    const interested = new Set(
      [task.assigneeId, task.createdById].filter((id): id is string => Boolean(id)),
    );
    interested.delete(auth.membershipId);
    for (const recipientId of interested) {
      await notify({
        companyId: auth.companyId,
        recipientId,
        actorId: auth.membershipId,
        type: 'TASK_STATUS_CHANGED',
        title: `${task.title} → ${nextStatus.replace('_', ' ').toLowerCase()}`,
        body: nextStatus === 'BLOCKED' ? (input.blockedReason ?? null) : null,
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    if (nextStatus === 'AWAITING_REVIEW') {
      await notifyLeadership({
        companyId: auth.companyId,
        actorId: auth.membershipId,
        // Same dedup as the completion path below. Without it, a task raised by
        // an owner or manager notified them twice for one event: once as the
        // work's own person in the loop above, once again in this fan-out.
        except: [task.assigneeId, task.createdById],
        type: 'TASK_STATUS_CHANGED',
        title: `Ready for review: ${task.title}`,
        body: `${auth.fullName} finished this and is waiting for approval.`,
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    if (nextStatus === 'DONE') {
      await notifyLeadership({
        companyId: auth.companyId,
        actorId: auth.membershipId,
        // Both were told by the loop above, which covers the work's own people.
        except: [task.assigneeId, task.createdById],
        type: 'TASK_COMPLETED',
        title: `Done: ${task.title}`,
        body: `${auth.fullName} marked this finished.`,
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.json(await toDetail(current, auth));
  }),
);

tasksRouter.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await loadTask(req.params.id, auth);
    if (!(await canEditTask(auth, existing))) {
      throw ApiError.forbidden('You can only approve work for your own team.');
    }

    const now = new Date();
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        status: 'DONE',
        approvedAt: now,
        approvedById: auth.membershipId,
        completedAt: existing.completedAt ?? now,
        completionPercent: 100,
        escalatedAt: null,
      },
      include: detailInclude,
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TASK_APPROVED',
      summary: `${auth.fullName} approved "${task.title}"`,
      actorId: auth.membershipId,
      targetId: task.assigneeId,
      taskId: task.id,
    });

    if (task.assigneeId) {
      await notify({
        companyId: auth.companyId,
        recipientId: task.assigneeId,
        actorId: auth.membershipId,
        type: 'TASK_APPROVED',
        title: `Approved: ${task.title}`,
        body: `${auth.fullName} signed off on your work.`,
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.json(await toDetail(task, auth));
  }),
);

tasksRouter.delete(
  '/',
  validateBody(z.object({ confirmation: z.literal('DELETE_ALL_TASKS') })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    if (!isLeadership(auth)) {
      throw ApiError.forbidden('Only owners and managers can clear company work.');
    }

    // A confirmed company-wide clear is final, matching Atlasy's individual
    // deletion path. Task-owned records cascade with their task.
    const result = await prisma.task.deleteMany({
      where: { companyId: auth.companyId, archivedAt: null },
    });
    emitToCompany(auth.companyId, 'task:deleted', { all: true });
    res.json({ ok: true, archivedCount: result.count });
  }),
);

tasksRouter.delete(
  '/:id/permanent',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await loadTask(req.params.id, auth);
    // Atlasy's confirmed delete is intentionally final. Its related comments,
    // subtasks, attachments and task-scoped activity cascade with the record,
    // so a deleted task can never return through a stale archive query.
    await prisma.task.delete({ where: { id: existing.id } });
    emitToCompany(auth.companyId, 'task:deleted', { taskId: existing.id });
    res.json({ ok: true, permanentlyDeleted: true });
  }),
);

tasksRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await loadTask(req.params.id, auth);
    // Archived, not deleted — the activity feed keeps referencing it.
    await prisma.task.update({ where: { id: existing.id }, data: { archivedAt: new Date() } });
    emitToCompany(auth.companyId, 'task:deleted', { taskId: existing.id });
    res.json({ ok: true });
  }),
);

// ------------------------------- subtasks ----------------------------------

async function recalculateProgress(taskId: string) {
  const subtasks = await prisma.subtask.findMany({ where: { taskId } });
  if (subtasks.length === 0) return;
  const done = subtasks.filter((subtask) => subtask.done).length;
  await prisma.task.update({
    where: { id: taskId },
    data: { completionPercent: Math.round((done / subtasks.length) * 100) },
  });
}

tasksRouter.post(
  '/:id/subtasks',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  validateBody(z.object({ title: z.string().trim().min(1, 'Name the step').max(200) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    if (!(await canEditTask(auth, task))) throw ApiError.forbidden();

    const count = await prisma.subtask.count({ where: { taskId: task.id } });
    const subtask = await prisma.subtask.create({
      data: { taskId: task.id, title: (req.body as { title: string }).title, position: count },
    });
    await recalculateProgress(task.id);
    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.status(201).json(subtask);
  }),
);

tasksRouter.patch(
  '/:id/subtasks/:subtaskId',
  validateBody(
    z.object({
      done: z.boolean().optional(),
      title: z.string().trim().min(1).max(200).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    const isAssignee = task.assigneeId === auth.membershipId;
    if (!isAssignee && !(await canEditTask(auth, task))) throw ApiError.forbidden();

    // Workers can check off the steps they were given, but only management can
    // rewrite the job plan itself.
    if (!isLeadership(auth) && (req.body as { title?: string }).title !== undefined) {
      throw ApiError.forbidden('Only owners and managers can change the task steps.');
    }

    await prisma.subtask.updateMany({
      where: { id: req.params.subtaskId, taskId: task.id },
      data: req.body as Record<string, unknown>,
    });
    await recalculateProgress(task.id);
    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.json({ ok: true });
  }),
);

tasksRouter.delete(
  '/:id/subtasks/:subtaskId',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    if (!(await canEditTask(auth, task))) throw ApiError.forbidden();
    await prisma.subtask.deleteMany({ where: { id: req.params.subtaskId, taskId: task.id } });
    await recalculateProgress(task.id);
    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.json({ ok: true });
  }),
);

// ------------------------------- comments ----------------------------------

tasksRouter.post(
  '/:id/comments',
  validateBody(
    z.object({
      body: z.string().trim().min(1, 'Write a comment').max(4000),
      mentionIds: z.array(z.string().min(1)).max(20).default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    const input = req.body as { body: string; mentionIds: string[] };

    // Only mention people who really are in this company.
    const mentioned = input.mentionIds.length
      ? await prisma.membership.findMany({
          where: {
            id: { in: input.mentionIds },
            companyId: auth.companyId,
            deactivatedAt: null,
          },
          include: { user: { select: { fullName: true } } },
        })
      : [];

    const comment = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: auth.membershipId,
        body: input.body,
        mentions: { create: mentioned.map((person) => ({ membershipId: person.id })) },
      },
      include: {
        author: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
        mentions: {
          include: { membership: { include: { user: { select: { fullName: true } } } } },
        },
        attachments: {
          include: { uploader: { include: { user: { select: { fullName: true } } } } },
        },
      },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TASK_COMMENTED',
      summary: `${auth.fullName} commented on "${task.title}"`,
      actorId: auth.membershipId,
      taskId: task.id,
    });

    for (const person of mentioned) {
      await notify({
        companyId: auth.companyId,
        recipientId: person.id,
        actorId: auth.membershipId,
        type: 'TASK_MENTIONED',
        title: `${auth.fullName} mentioned you`,
        body: `On "${task.title}": ${input.body.slice(0, 160)}`,
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    // Keep the assignee and creator in the loop even without a mention.
    const followers = new Set(
      [task.assigneeId, task.createdById].filter((id): id is string => Boolean(id)),
    );
    followers.delete(auth.membershipId);
    mentioned.forEach((person) => followers.delete(person.id));
    for (const recipientId of followers) {
      await notify({
        companyId: auth.companyId,
        recipientId,
        actorId: auth.membershipId,
        // Was TASK_STATUS_CHANGED, which is not what happened and made the
        // "comments" preference impossible to honour: silencing comments would
        // have silenced genuine status changes with it.
        type: 'TASK_COMMENTED',
        title: `New comment on ${task.title}`,
        body: input.body.slice(0, 160),
        entityType: 'task',
        entityId: task.id,
        taskId: task.id,
      });
    }

    emitToCompany(auth.companyId, 'task:comment', { taskId: task.id });
    res.status(201).json(serializeComment(comment));
  }),
);

tasksRouter.delete(
  '/:id/comments/:commentId',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    const comment = await prisma.taskComment.findFirst({
      where: { id: req.params.commentId, taskId: task.id },
    });
    if (!comment) throw ApiError.notFound('That comment no longer exists.');
    if (comment.authorId !== auth.membershipId && !isLeadership(auth)) {
      throw ApiError.forbidden('You can only delete your own comments.');
    }
    await prisma.taskComment.update({
      where: { id: comment.id },
      data: { deletedAt: new Date() },
    });
    emitToCompany(auth.companyId, 'task:comment', { taskId: task.id });
    res.json({ ok: true });
  }),
);

// ------------------------------ attachments --------------------------------

tasksRouter.post(
  '/:id/attachments',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    const isAssignee = task.assigneeId === auth.membershipId;
    if (!isAssignee && !(await canEditTask(auth, task))) throw ApiError.forbidden();

    const file = req.file;
    if (!file) throw ApiError.badRequest('Choose a file to upload.', 'NO_FILE');

    const kind = req.body?.kind === 'COMPLETION_PROOF' ? 'COMPLETION_PROOF' : 'GENERAL';

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        uploaderId: auth.membershipId,
        kind,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: file.filename,
      },
      include: { uploader: { include: { user: { select: { fullName: true } } } } },
    });

    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.status(201).json(serializeAttachment(attachment));
  }),
);

tasksRouter.delete(
  '/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const task = await loadTask(req.params.id, auth);
    const attachment = await prisma.taskAttachment.findFirst({
      where: { id: req.params.attachmentId, taskId: task.id },
    });
    if (!attachment) throw ApiError.notFound('That attachment no longer exists.');
    if (attachment.uploaderId !== auth.membershipId && !isLeadership(auth)) {
      throw ApiError.forbidden('You can only remove files you uploaded.');
    }
    await prisma.taskAttachment.delete({ where: { id: attachment.id } });
    emitToCompany(auth.companyId, 'task:updated', { taskId: task.id });
    res.json({ ok: true });
  }),
);

// ------------------------- recurring task templates -------------------------

const templateSchema = z.object({
  name: z.string().trim().min(2, 'Name the routine').max(120),
  titleTemplate: z.string().trim().min(2, 'What should the task be called?').max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  checklistItems: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
  interval: z.coerce.number().int().min(1).max(12).default(1),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:00')
    .default('09:00'),
  defaultAssigneeId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  requiresApproval: z.boolean().default(false),
  requiresProofPhoto: z.boolean().default(false),
  active: z.boolean().default(true),
});

tasksRouter.get(
  '/templates/list',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const templates = await prisma.taskTemplate.findMany({
      where: { companyId: auth.companyId },
      include: {
        defaultAssignee: { include: { user: { select: { fullName: true } } } },
        team: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: templates.map((template) => ({
        id: template.id,
        name: template.name,
        titleTemplate: template.titleTemplate,
        description: template.description,
        checklistItems: template.checklistItems,
        priority: template.priority,
        frequency: template.frequency,
        interval: template.interval,
        weekdays: template.weekdays,
        dayOfMonth: template.dayOfMonth,
        timeOfDay: template.timeOfDay,
        active: template.active,
        nextRunAt: template.nextRunAt?.toISOString() ?? null,
        lastGeneratedAt: template.lastGeneratedAt?.toISOString() ?? null,
        assigneeName: template.defaultAssignee?.user.fullName ?? null,
        teamName: template.team?.name ?? null,
        requiresApproval: template.requiresApproval,
        requiresProofPhoto: template.requiresProofPhoto,
      })),
    });
  }),
);

tasksRouter.post(
  '/templates',
  requirePermission(PERMISSIONS.TASKS_MANAGE),
  validateBody(templateSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof templateSchema>;
    await assertRelationsInCompany(auth.companyId, {
      assigneeId: input.defaultAssigneeId,
      teamId: input.teamId,
    });

    const template = await prisma.taskTemplate.create({
      data: {
        companyId: auth.companyId,
        name: input.name,
        titleTemplate: input.titleTemplate,
        description: input.description ?? null,
        checklistItems: input.checklistItems,
        priority: input.priority,
        frequency: input.frequency,
        interval: input.interval,
        weekdays: input.weekdays,
        dayOfMonth: input.dayOfMonth ?? null,
        timeOfDay: input.timeOfDay,
        defaultAssigneeId: input.defaultAssigneeId ?? null,
        teamId: input.teamId ?? null,
        requiresApproval: input.requiresApproval,
        requiresProofPhoto: input.requiresProofPhoto,
        active: input.active,
        nextRunAt: computeNextRun(input),
      },
    });

    res.status(201).json({ id: template.id, nextRunAt: template.nextRunAt?.toISOString() ?? null });
  }),
);

tasksRouter.patch(
  '/templates/:templateId',
  requirePermission(PERMISSIONS.TASKS_DELETE),
  validateBody(templateSchema.partial()),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.taskTemplate.findFirst({
      where: { id: req.params.templateId, companyId: auth.companyId },
    });
    if (!existing) throw ApiError.notFound('That routine no longer exists.');

    const input = req.body as Partial<z.infer<typeof templateSchema>>;
    const merged = { ...existing, ...input };

    const template = await prisma.taskTemplate.update({
      where: { id: existing.id },
      data: {
        ...(Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ) as Record<string, unknown>),
        nextRunAt: merged.active ? computeNextRun(merged) : null,
      },
    });
    res.json({ id: template.id, nextRunAt: template.nextRunAt?.toISOString() ?? null });
  }),
);

tasksRouter.delete(
  '/templates/:templateId',
  requirePermission(PERMISSIONS.TASKS_DELETE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.taskTemplate.findFirst({
      where: { id: req.params.templateId, companyId: auth.companyId },
    });
    if (!existing) throw ApiError.notFound('That routine no longer exists.');
    await prisma.taskTemplate.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);
