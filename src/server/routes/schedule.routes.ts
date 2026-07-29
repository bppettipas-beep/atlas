/**
 * Schedule endpoints.
 *
 * The Schedule reads and writes ordinary tasks, so scheduling something is an
 * edit to a task and is authorised by exactly the rules that already govern
 * task edits. Nothing here grants a way to touch work you could not otherwise
 * touch — see services/schedule.ts for the read scope.
 */
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { parsedQuery, validateBody, validateQuery } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify } from '../services/notifications';
import { canEditTask, isLeadership } from '../services/permissions';
import {
  MAX_RANGE_DAYS,
  buildSchedule,
  describeConflicts,
  scheduleScope,
} from '../services/schedule';
import type { TaskPriority, TaskStatus } from '../../shared/types';
import { canAccessMembership, PERMISSIONS } from '../services/authorization';

export const scheduleRouter = Router();

scheduleRouter.use(requireAuth);

/** Comma-separated query lists, which survive bookmarking better than repeats. */
const list = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  resources: list,
  status: list.pipe(z.array(z.enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE']))),
  priority: list.pipe(z.array(z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']))),
  location: z.string().trim().max(120).optional(),
});

scheduleRouter.get(
  '/',
  requirePermission(PERMISSIONS.SCHEDULE_VIEW),
  validateQuery(rangeSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<z.infer<typeof rangeSchema>>(res);

    if (query.to.getTime() <= query.from.getTime()) {
      throw ApiError.badRequest('The end of the range must be after the start.', 'BAD_RANGE');
    }
    const days = (query.to.getTime() - query.from.getTime()) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
      throw ApiError.badRequest(
        `Ask for ${MAX_RANGE_DAYS} days or fewer at a time.`,
        'RANGE_TOO_WIDE',
      );
    }

    res.json(
      await buildSchedule(auth, {
        from: query.from,
        to: query.to,
        resourceIds: query.resources,
        status: query.status as TaskStatus[],
        priority: query.priority as TaskPriority[],
        location: query.location,
      }),
    );
  }),
);

/** What the client may offer. The server still checks every write regardless. */
scheduleRouter.get(
  '/permissions',
  requirePermission(PERMISSIONS.SCHEDULE_VIEW),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const scope = await scheduleScope(auth);
    res.json({
      canScheduleOthers: scope.canScheduleOthers,
      canManageAvailability: scope.canManageAvailability,
      visibleMembershipIds: scope.membershipIds,
    });
  }),
);

/**
 * Asks what would be awkward about a booking, without making it.
 *
 * The Schedule calls this while dragging so it can warn before the drop rather
 * than undoing afterwards.
 */
scheduleRouter.get(
  '/conflicts',
  requirePermission(PERMISSIONS.SCHEDULE_VIEW),
  validateQuery(
    z.object({
      membershipId: z.string().min(1),
      startAt: z.coerce.date(),
      endAt: z.coerce.date(),
      ignoreTaskId: z.string().min(1).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<{
      membershipId: string;
      startAt: Date;
      endAt: Date;
      ignoreTaskId?: string;
    }>(res);

    const scope = await scheduleScope(auth);
    if (!scope.membershipIds.includes(query.membershipId)) {
      throw ApiError.forbidden('You cannot see that person’s schedule.');
    }

    res.json(
      await describeConflicts({
        companyId: auth.companyId,
        membershipId: query.membershipId,
        startAt: query.startAt,
        endAt: query.endAt,
        ignoreTaskId: query.ignoreTaskId,
      }),
    );
  }),
);

/**
 * Books, moves or unbooks a task.
 *
 * Sending `startAt: null` takes it off the Schedule and leaves it as an
 * ordinary unscheduled task — the work does not disappear.
 */
scheduleRouter.patch(
  '/tasks/:id',
  requirePermission(PERMISSIONS.SCHEDULE_MANAGE),
  validateBody(
    z.object({
      startAt: z.coerce.date().nullable(),
      endAt: z.coerce.date().nullable().optional(),
      assigneeId: z.string().min(1).nullable().optional(),
      teamId: z.string().min(1).nullable().optional(),
      location: z.string().trim().max(200).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as {
      startAt: Date | null;
      endAt?: Date | null;
      assigneeId?: string | null;
      teamId?: string | null;
      location?: string | null;
    };

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, companyId: auth.companyId, archivedAt: null },
    });
    if (!task) throw ApiError.notFound('That task no longer exists.');
    if (!(await canEditTask(auth, task))) {
      throw ApiError.forbidden('You cannot reschedule that work.');
    }

    if (input.startAt && input.endAt && input.endAt.getTime() <= input.startAt.getTime()) {
      throw ApiError.badRequest('The end time has to be after the start time.', 'BAD_RANGE');
    }

    // Moving work onto somebody else is an assignment, not a reschedule, and
    // needs the permission that assignment needs.
    const changingAssignee = input.assigneeId !== undefined && input.assigneeId !== task.assigneeId;
    if (changingAssignee && !isLeadership(auth)) {
      throw ApiError.forbidden('Only owners and managers can move work to somebody else.');
    }
    if (input.assigneeId) {
      const scope = await scheduleScope(auth);
      if (!scope.membershipIds.includes(input.assigneeId)) {
        throw ApiError.forbidden('That person is not yours to schedule.');
      }
    }
    if (input.teamId) {
      const scope = await scheduleScope(auth);
      if (!scope.teamIds.includes(input.teamId)) {
        throw ApiError.forbidden('That team is not yours to schedule.');
      }
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, companyId: auth.companyId, archivedAt: null },
        select: { id: true },
      });
      if (!team) throw ApiError.badRequest('That team is not in this company.', 'BAD_TEAM');
    }

    // A PATCH that moves only the start keeps the existing duration. Silently
    // dropping the end time turns a two-hour booking into the one-hour default.
    const existingDuration =
      task.startAt && task.endAt
        ? Math.max(task.endAt.getTime() - task.startAt.getTime(), 0)
        : null;
    const nextEndAt = input.startAt
      ? input.endAt !== undefined
        ? input.endAt
        : existingDuration
          ? new Date(input.startAt.getTime() + existingDuration)
          : null
      : null;

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        startAt: input.startAt,
        // Clearing the start clears the end too; an end time on its own is not
        // a schedule, and leaving one behind makes the next booking confusing.
        endAt: nextEndAt,
        scheduledById: input.startAt ? auth.membershipId : null,
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TASK_STATUS_CHANGED',
      summary: input.startAt
        ? `${auth.fullName} scheduled "${updated.title}"`
        : `${auth.fullName} took "${updated.title}" off the schedule`,
      actorId: auth.membershipId,
      targetId: updated.assigneeId,
      taskId: updated.id,
    });

    if (updated.assigneeId && input.startAt) {
      await notify({
        companyId: auth.companyId,
        recipientId: updated.assigneeId,
        actorId: auth.membershipId,
        type: changingAssignee ? 'TASK_ASSIGNED' : 'TASK_DUE_CHANGED',
        title: changingAssignee ? `New task: ${updated.title}` : `Rescheduled: ${updated.title}`,
        body: `Now ${input.startAt.toLocaleString()}.`,
        entityType: 'task',
        entityId: updated.id,
        taskId: updated.id,
      });
    }

    emitToCompany(auth.companyId, 'schedule:updated', { taskId: updated.id });
    emitToCompany(auth.companyId, 'task:updated', { taskId: updated.id });

    const conflicts = input.startAt
      ? await describeConflicts({
          companyId: auth.companyId,
          membershipId: updated.assigneeId,
          startAt: updated.startAt as Date,
          endAt: updated.endAt ?? new Date((updated.startAt as Date).getTime() + 60 * 60 * 1_000),
          ignoreTaskId: updated.id,
        })
      : { conflicts: [], unavailable: null };

    res.json({
      taskId: updated.id,
      startAt: updated.startAt?.toISOString() ?? null,
      endAt: updated.endAt?.toISOString() ?? null,
      // Reported, never enforced — see describeConflicts.
      conflicts: conflicts.conflicts,
      unavailable: conflicts.unavailable,
    });
  }),
);

// ------------------------------- availability -------------------------------

const HOURS = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startMinute: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  endMinute: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60),
});

/** Anybody may read their own; leadership may read the people they manage. */
async function assertCanSeeAvailability(
  auth: ReturnType<typeof currentAuth>,
  membershipId: string,
) {
  if (membershipId === auth.membershipId) return;
  const scope = await scheduleScope(auth);
  if (!scope.membershipIds.includes(membershipId)) {
    throw ApiError.forbidden('You cannot see that person’s availability.');
  }
}

scheduleRouter.get(
  '/availability/:membershipId',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { membershipId } = req.params;
    await assertCanSeeAvailability(auth, membershipId);

    const [workingHours, timeOff] = await Promise.all([
      prisma.workingHours.findMany({
        where: { membershipId, companyId: auth.companyId },
        orderBy: { weekday: 'asc' },
      }),
      prisma.timeOff.findMany({
        where: { membershipId, companyId: auth.companyId, endAt: { gt: new Date() } },
        include: { createdBy: { include: { user: { select: { fullName: true } } } } },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    res.json({
      membershipId,
      workingHours: workingHours.map((row) => ({
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      })),
      timeOff: timeOff.map((row) => ({
        id: row.id,
        membershipId: row.membershipId,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        note: row.note,
        createdBy: row.createdBy
          ? { id: row.createdBy.id, fullName: row.createdBy.user.fullName }
          : null,
      })),
    });
  }),
);

/**
 * Replaces somebody's week outright.
 *
 * A whole-week PUT rather than per-day edits: working hours are read as a set,
 * and patching one day at a time invites a half-saved week where Tuesday is
 * from the old shift pattern and Wednesday the new one.
 */
scheduleRouter.put(
  '/availability/:membershipId/hours',
  validateBody(z.object({ workingHours: z.array(HOURS).max(7) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { membershipId } = req.params;
    const { workingHours } = req.body as { workingHours: z.infer<typeof HOURS>[] };

    // Your own hours are yours to state. Somebody else's need authority over them.
    if (
      membershipId !== auth.membershipId &&
      !(await canAccessMembership(auth, PERMISSIONS.AVAILABILITY_MANAGE, membershipId))
    ) {
      throw ApiError.forbidden('You cannot change that person’s working hours.');
    }

    const person = await prisma.membership.findFirst({
      where: { id: membershipId, companyId: auth.companyId },
      select: { id: true },
    });
    if (!person) throw ApiError.notFound('That person is not in this company.');

    for (const row of workingHours) {
      if (row.endMinute <= row.startMinute) {
        throw ApiError.badRequest('A working day has to end after it starts.', 'BAD_RANGE');
      }
    }

    await prisma.$transaction([
      prisma.workingHours.deleteMany({ where: { membershipId } }),
      prisma.workingHours.createMany({
        data: workingHours.map((row) => ({
          companyId: auth.companyId,
          membershipId,
          weekday: row.weekday,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
      }),
    ]);

    emitToCompany(auth.companyId, 'schedule:availability', { membershipId });
    res.json({ ok: true, workingHours });
  }),
);

scheduleRouter.post(
  '/availability/:membershipId/time-off',
  validateBody(
    z.object({
      startAt: z.coerce.date(),
      endAt: z.coerce.date(),
      note: z.string().trim().max(200).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { membershipId } = req.params;
    const input = req.body as { startAt: Date; endAt: Date; note?: string | null };

    // A worker may say they are unavailable. That is the point of the feature:
    // the person who knows they cannot make it is the person reporting it.
    if (
      membershipId !== auth.membershipId &&
      !(await canAccessMembership(auth, PERMISSIONS.AVAILABILITY_MANAGE, membershipId))
    ) {
      throw ApiError.forbidden('You cannot book time off for that person.');
    }
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      throw ApiError.badRequest('Time off has to end after it starts.', 'BAD_RANGE');
    }

    const person = await prisma.membership.findFirst({
      where: { id: membershipId, companyId: auth.companyId },
      select: { id: true },
    });
    if (!person) throw ApiError.notFound('That person is not in this company.');

    const created = await prisma.timeOff.create({
      data: {
        companyId: auth.companyId,
        membershipId,
        startAt: input.startAt,
        endAt: input.endAt,
        note: input.note ?? null,
        createdById: auth.membershipId,
      },
    });

    // Whoever is responsible needs to know somebody is unavailable, and the
    // person themselves needs to know if a manager booked it for them.
    if (membershipId === auth.membershipId) {
      const managers = await prisma.membership.findMany({
        where: {
          companyId: auth.companyId,
          role: { in: ['OWNER', 'CO_OWNER', 'MANAGER'] },
          status: 'ACTIVE',
          deactivatedAt: null,
          isPlaceholder: false,
        },
        select: { id: true },
      });
      for (const manager of managers) {
        await notify({
          companyId: auth.companyId,
          recipientId: manager.id,
          actorId: auth.membershipId,
          type: 'TEAM_ADDED',
          title: `${auth.fullName} is unavailable`,
          body: `${input.startAt.toLocaleString()} until ${input.endAt.toLocaleString()}.`,
          entityType: 'person',
          entityId: auth.membershipId,
        });
      }
    } else {
      await notify({
        companyId: auth.companyId,
        recipientId: membershipId,
        actorId: auth.membershipId,
        type: 'TEAM_ADDED',
        title: 'Time off was booked for you',
        body: `${input.startAt.toLocaleString()} until ${input.endAt.toLocaleString()}.`,
        entityType: 'person',
        entityId: membershipId,
      });
    }

    emitToCompany(auth.companyId, 'schedule:availability', { membershipId });
    res.status(201).json({
      id: created.id,
      membershipId,
      startAt: created.startAt.toISOString(),
      endAt: created.endAt.toISOString(),
      note: created.note,
      createdBy: { id: auth.membershipId, fullName: auth.fullName },
    });
  }),
);

scheduleRouter.delete(
  '/time-off/:id',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const period = await prisma.timeOff.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!period) throw ApiError.notFound('That time off is already gone.');

    if (
      period.membershipId !== auth.membershipId &&
      !(await canAccessMembership(auth, PERMISSIONS.AVAILABILITY_MANAGE, period.membershipId))
    ) {
      throw ApiError.forbidden('You cannot change that person’s time off.');
    }

    await prisma.timeOff.delete({ where: { id: period.id } });
    emitToCompany(auth.companyId, 'schedule:availability', {
      membershipId: period.membershipId,
    });
    res.json({ ok: true });
  }),
);
