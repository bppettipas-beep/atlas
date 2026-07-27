import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { parsedQuery, validateBody, validateQuery } from '../http/validate';
import { currentAuth, requireAuth, requireRole } from '../middleware/authenticate';
import { daysAgo, endOfDay, startOfDay } from '../lib/dates';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify } from '../services/notifications';
import { broadcastOrganizationChange, ensureOrganizationNodes } from '../services/organization';
import { canManagePerson, canViewPrivateNotes, isLeadership } from '../services/permissions';
import {
  activityInclude,
  personInclude,
  serializeActivity,
  serializeAnnouncement,
  serializePerson,
  serializeTaskSummary,
  serializeTeam,
  taskSummaryInclude,
} from '../services/serializers';
import type { MyDayDto, PersonDetail, PersonSummary } from '../../shared/types';

export const peopleRouter = Router();

peopleRouter.use(requireAuth);

/** Loads a membership and proves it belongs to the caller's company. */
async function loadPersonInCompany(id: string, companyId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id, companyId },
    include: personInclude,
  });
  if (!membership) throw ApiError.notFound('We could not find that person in your company.');
  return membership;
}

// -------------------------------- my day -----------------------------------

peopleRouter.get(
  '/me/my-day',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const me = await prisma.membership.findUniqueOrThrow({
      where: { id: auth.membershipId },
      include: {
        ...personInclude,
        manager: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      },
    });

    const myTasks = await prisma.task.findMany({
      where: {
        companyId: auth.companyId,
        archivedAt: null,
        assigneeId: auth.membershipId,
        OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: todayStart } }],
      },
      include: taskSummaryInclude,
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      take: 200,
    });

    const summaries = myTasks.map(serializeTaskSummary);
    const done = summaries.filter((task) => task.status === 'DONE');
    const open = summaries.filter((task) => task.status !== 'DONE');

    const overdue = open.filter((task) => task.isOverdue);
    const dueToday = open.filter(
      (task) =>
        !task.isOverdue &&
        task.dueAt &&
        new Date(task.dueAt) >= todayStart &&
        new Date(task.dueAt) <= todayEnd,
    );
    const blocked = open.filter((task) => task.status === 'BLOCKED');
    const awaitingReview = open.filter((task) => task.status === 'AWAITING_REVIEW');
    const handled = new Set(
      [...overdue, ...dueToday, ...blocked, ...awaitingReview].map((t) => t.id),
    );
    const upcoming = open.filter((task) => !handled.has(task.id)).slice(0, 12);

    const teamIds = me.teamMemberships.map((tm) => tm.teamId);
    const [teams, teammates, announcements, training] = await Promise.all([
      prisma.team.findMany({
        where: { id: { in: teamIds } },
        include: { _count: { select: { members: true } } },
      }),
      teamIds.length
        ? prisma.membership.findMany({
            where: {
              companyId: auth.companyId,
              deactivatedAt: null,
              id: { not: auth.membershipId },
              teamMemberships: { some: { teamId: { in: teamIds } } },
            },
            include: personInclude,
            take: 24,
          })
        : Promise.resolve([]),
      prisma.announcement.findMany({
        where: { companyId: auth.companyId },
        include: { author: { include: { user: { select: { fullName: true, avatarUrl: true } } } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      prisma.knowledgeDocument.findMany({
        where: {
          companyId: auth.companyId,
          archivedAt: null,
          status: 'PUBLISHED',
          OR: [
            { requiresAcknowledgment: true },
            { people: { some: { membershipId: auth.membershipId } } },
            teamIds.length ? { teamId: { in: teamIds } } : { id: '__none__' },
          ],
        },
        include: { acknowledgments: { where: { membershipId: auth.membershipId } } },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
    ]);

    const payload: MyDayDto = {
      greetingName: me.user.fullName.split(' ')[0] ?? me.user.fullName,
      today: now.toISOString(),
      tasks: {
        overdue,
        dueToday,
        upcoming,
        blocked,
        awaitingReview,
        completedToday: done,
      },
      counts: {
        active: open.length,
        overdue: overdue.length,
        blocked: blocked.length,
        doneToday: done.length,
      },
      manager: me.manager
        ? {
            id: me.manager.id,
            fullName: me.manager.user.fullName,
            jobTitle: me.manager.jobTitle,
            avatarUrl: me.manager.user.avatarUrl,
          }
        : null,
      teams: teams.map(serializeTeam),
      teammates: teammates.map(serializePerson),
      announcements: announcements.map(serializeAnnouncement),
      training: training.map((doc) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        requiresAcknowledgment: doc.requiresAcknowledgment,
        acknowledgedByMe: doc.acknowledgments.length > 0,
      })),
    };

    res.json(payload);
  }),
);

// -------------------------------- list -------------------------------------

const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  teamId: z.string().min(1).optional(),
  role: z.enum(['OWNER', 'MANAGER', 'WORKER']).optional(),
  availability: z.enum(['AVAILABLE', 'BUSY', 'FOCUSED', 'OFF_SHIFT', 'ON_LEAVE']).optional(),
  includeInactive: z.coerce.boolean().default(false),
});

peopleRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<z.infer<typeof listQuerySchema>>(res);

    const memberships = await prisma.membership.findMany({
      where: {
        companyId: auth.companyId,
        ...(query.includeInactive && isLeadership(auth) ? {} : { deactivatedAt: null }),
        ...(query.role ? { role: query.role } : {}),
        ...(query.teamId ? { teamMemberships: { some: { teamId: query.teamId } } } : {}),
        ...(query.availability ? { profile: { availability: query.availability } } : {}),
        ...(query.search
          ? {
              OR: [
                { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
                { user: { email: { contains: query.search, mode: 'insensitive' } } },
                { jobTitle: { contains: query.search, mode: 'insensitive' } },
                { profile: { headline: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: personInclude,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    const items: PersonSummary[] = memberships.map(serializePerson);
    res.json({ items });
  }),
);

// ------------------------------- detail ------------------------------------

peopleRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);

    const [
      full,
      activeTasks,
      recentlyCompleted,
      overdueCount,
      blockedCount,
      completedCount,
      timeline,
      ownedDocuments,
      notes,
    ] = await Promise.all([
      prisma.membership.findUniqueOrThrow({
        where: { id: membership.id },
        include: {
          manager: { include: { user: { select: { fullName: true } } } },
          directReports: {
            where: { deactivatedAt: null },
            include: { user: { select: { fullName: true } } },
          },
          memberSkills: { include: { skill: true }, orderBy: { level: 'desc' } },
          certifications: { orderBy: { createdAt: 'desc' } },
          trainingRecords: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.task.findMany({
        where: {
          companyId: auth.companyId,
          archivedAt: null,
          assigneeId: membership.id,
          status: { not: 'DONE' },
        },
        include: taskSummaryInclude,
        orderBy: [{ dueAt: 'asc' }],
        take: 25,
      }),
      prisma.task.findMany({
        where: {
          companyId: auth.companyId,
          archivedAt: null,
          assigneeId: membership.id,
          status: 'DONE',
        },
        include: taskSummaryInclude,
        orderBy: { completedAt: 'desc' },
        take: 8,
      }),
      prisma.task.count({
        where: {
          companyId: auth.companyId,
          archivedAt: null,
          assigneeId: membership.id,
          status: { not: 'DONE' },
          dueAt: { lt: new Date() },
        },
      }),
      prisma.task.count({
        where: {
          companyId: auth.companyId,
          archivedAt: null,
          assigneeId: membership.id,
          status: 'BLOCKED',
        },
      }),
      prisma.task.count({
        where: {
          companyId: auth.companyId,
          archivedAt: null,
          assigneeId: membership.id,
          status: 'DONE',
          completedAt: { gte: daysAgo(30) },
        },
      }),
      prisma.activityEvent.findMany({
        where: {
          companyId: auth.companyId,
          OR: [{ actorId: membership.id }, { targetId: membership.id }],
          ...(isLeadership(auth) ? {} : { visibility: 'COMPANY' }),
        },
        include: activityInclude,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.knowledgeDocument.findMany({
        where: { companyId: auth.companyId, archivedAt: null, ownerId: membership.id },
        select: { id: true, title: true, category: true },
        orderBy: { updatedAt: 'desc' },
      }),
      canViewPrivateNotes(auth)
        ? prisma.memberNote.findMany({
            where: { companyId: auth.companyId, subjectId: membership.id },
            include: { author: { include: { user: { select: { fullName: true } } } } },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const base = serializePerson(membership);
    const detail: PersonDetail = {
      ...base,
      bio: membership.profile?.bio ?? null,
      phone: membership.profile?.phone ?? null,
      workEmail: membership.profile?.workEmail ?? null,
      location: membership.profile?.location ?? null,
      timezone: membership.profile?.timezone ?? null,
      startDate: membership.profile?.startDate?.toISOString() ?? null,
      availabilityNote: membership.profile?.availabilityNote ?? null,
      weeklyHoursTarget: membership.profile?.weeklyHoursTarget ?? null,
      joinedAt: membership.joinedAt.toISOString(),
      manager: full.manager
        ? {
            id: full.manager.id,
            fullName: full.manager.user.fullName,
            jobTitle: full.manager.jobTitle,
          }
        : null,
      directReports: full.directReports.map((report) => ({
        id: report.id,
        fullName: report.user.fullName,
        jobTitle: report.jobTitle,
      })),
      skills: full.memberSkills.map((ms) => ({
        id: ms.skillId,
        name: ms.skill.name,
        level: ms.level,
      })),
      certifications: full.certifications.map((cert) => ({
        id: cert.id,
        name: cert.name,
        issuer: cert.issuer,
        issuedAt: cert.issuedAt?.toISOString() ?? null,
        expiresAt: cert.expiresAt?.toISOString() ?? null,
      })),
      trainingRecords: full.trainingRecords.map((record) => ({
        id: record.id,
        title: record.title,
        documentId: record.documentId,
        completedAt: record.completedAt?.toISOString() ?? null,
      })),
      ownedDocuments,
      workload: {
        active: activeTasks.length,
        overdue: overdueCount,
        blocked: blockedCount,
        completedLast30Days: completedCount,
      },
      activeTasks: activeTasks.map(serializeTaskSummary),
      recentlyCompleted: recentlyCompleted.map(serializeTaskSummary),
      timeline: timeline.map(serializeActivity),
      ...(canViewPrivateNotes(auth)
        ? {
            notes: notes.map((note) => ({
              id: note.id,
              body: note.body,
              createdAt: note.createdAt.toISOString(),
              author: note.author
                ? { id: note.author.id, fullName: note.author.user.fullName }
                : null,
            })),
          }
        : {}),
    };

    res.json(detail);
  }),
);

// ------------------------------- updates -----------------------------------

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  headline: z.string().trim().max(200).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  workEmail: z.string().trim().email('Enter a valid email').nullable().optional().or(z.literal('')),
  location: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  availability: z.enum(['AVAILABLE', 'BUSY', 'FOCUSED', 'OFF_SHIFT', 'ON_LEAVE']).optional(),
  availabilityNote: z.string().trim().max(200).nullable().optional(),
  weeklyHoursTarget: z.coerce.number().int().min(0).max(168).nullable().optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

/** Fields a worker is allowed to change on their own profile. */
const SELF_EDITABLE = new Set([
  'fullName',
  'headline',
  'bio',
  'phone',
  'workEmail',
  'location',
  'timezone',
  'availability',
  'availabilityNote',
  'avatarUrl',
]);

/**
 * Adds a person by hand, with no invitation and no login.
 *
 * For a role you are still hiring for, or somebody who simply does not use a
 * computer. The membership created here is an ordinary one — it appears on the
 * map, holds a role, joins teams and is assigned work through exactly the same
 * endpoints as anybody else, with no special-casing anywhere.
 *
 * The user row behind it has no password and no Google id, so it cannot be
 * signed into. If that person later needs real access, they join with an
 * invitation code and get their own account.
 */
peopleRouter.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateBody(
    z.object({
      fullName: z.string().trim().min(2, 'Enter their name').max(120),
      jobTitle: z.string().trim().max(120).nullable().optional(),
      email: z.string().trim().email('Enter a valid email').nullable().optional().or(z.literal('')),
      roleId: z.string().min(1).nullable().optional(),
      managerId: z.string().min(1).nullable().optional(),
      teamId: z.string().min(1).nullable().optional(),
      headline: z.string().trim().max(200).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as {
      fullName: string;
      jobTitle?: string | null;
      email?: string | null;
      roleId?: string | null;
      managerId?: string | null;
      teamId?: string | null;
      headline?: string | null;
    };

    const email = input.email?.trim().toLowerCase() || null;
    if (email) {
      const taken = await prisma.user.findUnique({ where: { email } });
      if (taken) {
        throw ApiError.conflict(
          'Somebody already uses that email address. Leave it blank, or invite them properly with a code.',
          'EMAIL_TAKEN',
        );
      }
    }

    if (input.roleId) {
      const role = await prisma.role.findFirst({
        where: { id: input.roleId, companyId: auth.companyId },
      });
      if (!role) throw ApiError.notFound('That role does not exist.', 'ROLE_NOT_FOUND');
    }
    if (input.managerId) {
      const manager = await prisma.membership.findFirst({
        where: { id: input.managerId, companyId: auth.companyId, deactivatedAt: null },
      });
      if (!manager) throw ApiError.notFound('That manager is not in your company.');
    }
    if (input.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: input.teamId, companyId: auth.companyId },
      });
      if (!team) throw ApiError.notFound('That team does not exist.');
    }

    const membershipId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          // A placeholder address in a domain nobody can receive mail at, so it
          // can never collide with a real one or be mistaken for reachable.
          email: email ?? `placeholder.${crypto.randomUUID()}@placeholder.atlas.invalid`,
          fullName: input.fullName,
          passwordHash: null,
          googleId: null,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          companyId: auth.companyId,
          role: 'WORKER',
          isPlaceholder: true,
          roleId: input.roleId ?? null,
          managerId: input.managerId ?? null,
          jobTitle: input.jobTitle || null,
          profile: {
            create: { availability: 'AVAILABLE', headline: input.headline || null },
          },
        },
      });

      await tx.notificationPreference.create({ data: { membershipId: membership.id } });
      if (input.teamId) {
        await tx.teamMembership.create({
          data: { teamId: input.teamId, membershipId: membership.id },
        });
      }
      return membership.id;
    });

    await ensureOrganizationNodes(auth.companyId);
    await recordActivity({
      companyId: auth.companyId,
      type: 'MEMBER_JOINED',
      summary: `${auth.fullName} added ${input.fullName} to the company`,
      actorId: auth.membershipId,
      targetId: membershipId,
      metadata: { placeholder: true },
    });

    emitToCompany(auth.companyId, 'people:updated', { membershipId });
    broadcastOrganizationChange(auth.companyId);

    res.status(201).json(serializePerson(await loadPersonInCompany(membershipId, auth.companyId)));
  }),
);

/**
 * Removes a placeholder outright.
 *
 * Only ever a placeholder: a real person is deactivated instead, because their
 * account, their history and their sessions are theirs. A placeholder has none
 * of those, so keeping a deactivated husk of one would just be clutter.
 */
peopleRouter.delete(
  '/:id/placeholder',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);

    if (!membership.isPlaceholder) {
      throw ApiError.badRequest(
        'That is a real account. Deactivate it instead of deleting it.',
        'NOT_A_PLACEHOLDER',
      );
    }

    // Deleting the user cascades the membership; tasks and comments they were
    // attached to are SetNull, so the company keeps its work.
    await prisma.user.delete({ where: { id: membership.userId } });

    await ensureOrganizationNodes(auth.companyId);
    emitToCompany(auth.companyId, 'people:updated', {});
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);

/**
 * Assigns (or clears) somebody's company role.
 *
 * Separate from the profile endpoint because this is not self-service: your
 * role is not yours to award. `canManagePerson` already encodes who may.
 */
peopleRouter.patch(
  '/:id/assigned-role',
  requireRole('OWNER', 'MANAGER'),
  validateBody(z.object({ roleId: z.string().min(1).nullable() })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    const { roleId } = req.body as { roleId: string | null };

    if (!(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You cannot change that person’s role.');
    }

    if (roleId) {
      const role = await prisma.role.findFirst({
        where: { id: roleId, companyId: auth.companyId },
      });
      if (!role) throw ApiError.notFound('That role does not exist.', 'ROLE_NOT_FOUND');
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { roleId } });

    emitToCompany(auth.companyId, 'people:updated', { membershipId: membership.id });
    emitToCompany(auth.companyId, 'roles:updated', {});
    broadcastOrganizationChange(auth.companyId);

    res.json(serializePerson(await loadPersonInCompany(membership.id, auth.companyId)));
  }),
);

peopleRouter.patch(
  '/:id',
  validateBody(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    const input = req.body as z.infer<typeof profileUpdateSchema>;

    const isSelf = membership.id === auth.membershipId;
    const canManage = await canManagePerson(auth, membership.id);

    if (!isSelf && !canManage) {
      throw ApiError.forbidden('You can only edit your own profile.');
    }
    if (isSelf && !canManage) {
      const blocked = Object.keys(input).filter((key) => !SELF_EDITABLE.has(key));
      if (blocked.length > 0) {
        throw ApiError.forbidden(
          `Only an owner or manager can change: ${blocked.join(', ')}.`,
          'FIELD_NOT_EDITABLE',
        );
      }
    }

    const userData: Record<string, unknown> = {};
    if (input.fullName !== undefined) userData.fullName = input.fullName;
    if (input.avatarUrl !== undefined) userData.avatarUrl = input.avatarUrl || null;

    const profileData = {
      headline: input.headline,
      bio: input.bio,
      phone: input.phone,
      workEmail: input.workEmail === '' ? null : input.workEmail,
      location: input.location,
      timezone: input.timezone,
      startDate: input.startDate,
      availability: input.availability,
      availabilityNote: input.availabilityNote,
      weeklyHoursTarget: input.weeklyHoursTarget,
    };
    // Drop keys the caller did not send so we never null out untouched fields.
    const profileUpdate = Object.fromEntries(
      Object.entries(profileData).filter(([, value]) => value !== undefined),
    );

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: membership.userId }, data: userData });
      }
      if (input.jobTitle !== undefined) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { jobTitle: input.jobTitle },
        });
      }
      if (Object.keys(profileUpdate).length > 0) {
        await tx.employeeProfile.upsert({
          where: { membershipId: membership.id },
          update: profileUpdate,
          create: { membershipId: membership.id, ...profileUpdate },
        });
      }
    });

    emitToCompany(auth.companyId, 'people:updated', { membershipId: membership.id });
    broadcastOrganizationChange(auth.companyId);

    const updated = await loadPersonInCompany(membership.id, auth.companyId);
    res.json(serializePerson(updated));
  }),
);

peopleRouter.patch(
  '/:id/role',
  requireRole('OWNER'),
  validateBody(z.object({ role: z.enum(['OWNER', 'MANAGER', 'WORKER']) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    const { role } = req.body as { role: 'OWNER' | 'MANAGER' | 'WORKER' };

    if (membership.role === 'OWNER' && role !== 'OWNER') {
      const owners = await prisma.membership.count({
        where: { companyId: auth.companyId, role: 'OWNER', deactivatedAt: null },
      });
      if (owners <= 1) {
        throw ApiError.badRequest(
          'A company needs at least one owner. Promote someone else first.',
          'LAST_OWNER',
        );
      }
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { role } });

    await recordActivity({
      companyId: auth.companyId,
      type: 'MEMBER_ROLE_CHANGED',
      summary: `${auth.fullName} changed ${membership.user.fullName}'s role to ${role.toLowerCase()}`,
      actorId: auth.membershipId,
      targetId: membership.id,
      metadata: { from: membership.role, to: role },
    });

    emitToCompany(auth.companyId, 'people:updated', { membershipId: membership.id });
    res.json({ ok: true });
  }),
);

peopleRouter.patch(
  '/:id/manager',
  requireRole('OWNER', 'MANAGER'),
  validateBody(z.object({ managerId: z.string().min(1).nullable() })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    const { managerId } = req.body as { managerId: string | null };

    if (!(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only change reporting lines for your own team.');
    }
    if (managerId === membership.id) {
      throw ApiError.badRequest('Somebody cannot report to themselves.');
    }

    if (managerId) {
      const manager = await prisma.membership.findFirst({
        where: { id: managerId, companyId: auth.companyId, deactivatedAt: null },
      });
      if (!manager) throw ApiError.badRequest('That manager is not in your company.');

      // Walk up the chain to make sure we are not creating a loop.
      let cursor: string | null = manager.managerId;
      for (let depth = 0; cursor && depth < 50; depth += 1) {
        if (cursor === membership.id) {
          throw ApiError.badRequest(
            'That would create a reporting loop. Pick a different manager.',
            'REPORTING_LOOP',
          );
        }
        const next: { managerId: string | null } | null = await prisma.membership.findUnique({
          where: { id: cursor },
          select: { managerId: true },
        });
        cursor = next?.managerId ?? null;
      }
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { managerId } });

    await recordActivity({
      companyId: auth.companyId,
      type: 'MANAGER_CHANGED',
      summary: managerId
        ? `${membership.user.fullName}'s reporting line was updated`
        : `${membership.user.fullName} no longer reports to anyone`,
      actorId: auth.membershipId,
      targetId: membership.id,
    });

    broadcastOrganizationChange(auth.companyId);
    emitToCompany(auth.companyId, 'people:updated', { membershipId: membership.id });
    res.json({ ok: true });
  }),
);

peopleRouter.delete(
  '/:id',
  requireRole('OWNER'),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);

    if (membership.id === auth.membershipId) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }
    if (membership.role === 'OWNER') {
      const owners = await prisma.membership.count({
        where: { companyId: auth.companyId, role: 'OWNER', deactivatedAt: null },
      });
      if (owners <= 1) throw ApiError.badRequest('A company needs at least one owner.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: membership.id },
        data: { deactivatedAt: new Date(), status: 'SUSPENDED' },
      });
      // Their reports move up to their manager so nobody is orphaned.
      await tx.membership.updateMany({
        where: { managerId: membership.id },
        data: { managerId: membership.managerId },
      });
      await tx.refreshToken.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'MEMBER_DEACTIVATED',
      summary: `${auth.fullName} deactivated ${membership.user.fullName}`,
      actorId: auth.membershipId,
      targetId: membership.id,
      visibility: 'MANAGERS',
    });

    broadcastOrganizationChange(auth.companyId);
    emitToCompany(auth.companyId, 'people:updated', {});
    res.json({ ok: true });
  }),
);

// -------------------------- skills & credentials ---------------------------

peopleRouter.post(
  '/:id/skills',
  validateBody(
    z.object({
      name: z.string().trim().min(1, 'Name the skill').max(60),
      level: z.coerce.number().int().min(1).max(5).default(3),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    const isSelf = membership.id === auth.membershipId;
    if (!isSelf && !(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only edit your own skills.');
    }

    const input = req.body as { name: string; level: number };
    const skill = await prisma.skill.upsert({
      where: { companyId_name: { companyId: auth.companyId, name: input.name } },
      update: {},
      create: { companyId: auth.companyId, name: input.name },
    });

    await prisma.memberSkill.upsert({
      where: { membershipId_skillId: { membershipId: membership.id, skillId: skill.id } },
      update: { level: input.level },
      create: { membershipId: membership.id, skillId: skill.id, level: input.level },
    });

    broadcastOrganizationChange(auth.companyId);
    res.status(201).json({ id: skill.id, name: skill.name, level: input.level });
  }),
);

peopleRouter.delete(
  '/:id/skills/:skillId',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    const isSelf = membership.id === auth.membershipId;
    if (!isSelf && !(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only edit your own skills.');
    }

    await prisma.memberSkill.deleteMany({
      where: { membershipId: membership.id, skillId: req.params.skillId },
    });
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);

peopleRouter.post(
  '/:id/certifications',
  validateBody(
    z.object({
      name: z.string().trim().min(1, 'Name the certification').max(120),
      issuer: z.string().trim().max(120).optional().or(z.literal('')),
      issuedAt: z.coerce.date().nullable().optional(),
      expiresAt: z.coerce.date().nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    if (membership.id !== auth.membershipId && !(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only edit your own certifications.');
    }
    const input = req.body as {
      name: string;
      issuer?: string;
      issuedAt?: Date | null;
      expiresAt?: Date | null;
    };

    const certification = await prisma.certification.create({
      data: {
        membershipId: membership.id,
        name: input.name,
        issuer: input.issuer || null,
        issuedAt: input.issuedAt ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
    res.status(201).json({ id: certification.id });
  }),
);

peopleRouter.delete(
  '/:id/certifications/:certificationId',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    if (membership.id !== auth.membershipId && !(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only edit your own certifications.');
    }
    await prisma.certification.deleteMany({
      where: { id: req.params.certificationId, membershipId: membership.id },
    });
    res.json({ ok: true });
  }),
);

peopleRouter.post(
  '/:id/training',
  requireRole('OWNER', 'MANAGER'),
  validateBody(
    z.object({
      title: z.string().trim().min(1, 'Name the training step').max(160),
      documentId: z.string().min(1).nullable().optional(),
      completed: z.boolean().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    if (!(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only manage onboarding for your own team.');
    }
    const input = req.body as { title: string; documentId?: string | null; completed: boolean };

    const record = await prisma.trainingRecord.create({
      data: {
        membershipId: membership.id,
        title: input.title,
        documentId: input.documentId ?? null,
        completedAt: input.completed ? new Date() : null,
      },
    });
    res.status(201).json({ id: record.id });
  }),
);

peopleRouter.patch(
  '/:id/training/:recordId',
  validateBody(z.object({ completed: z.boolean() })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    if (membership.id !== auth.membershipId && !(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only update your own onboarding steps.');
    }
    const { completed } = req.body as { completed: boolean };
    await prisma.trainingRecord.updateMany({
      where: { id: req.params.recordId, membershipId: membership.id },
      data: { completedAt: completed ? new Date() : null },
    });
    res.json({ ok: true });
  }),
);

// -------------------------- manager-only notes -----------------------------

peopleRouter.post(
  '/:id/notes',
  requireRole('OWNER', 'MANAGER'),
  validateBody(z.object({ body: z.string().trim().min(1, 'Write a note').max(2000) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    if (!(await canManagePerson(auth, membership.id))) {
      throw ApiError.forbidden('You can only leave notes on people you manage.');
    }

    const note = await prisma.memberNote.create({
      data: {
        companyId: auth.companyId,
        subjectId: membership.id,
        authorId: auth.membershipId,
        body: (req.body as { body: string }).body,
      },
      include: { author: { include: { user: { select: { fullName: true } } } } },
    });

    res.status(201).json({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      author: note.author ? { id: note.author.id, fullName: note.author.user.fullName } : null,
    });
  }),
);

peopleRouter.delete(
  '/:id/notes/:noteId',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const note = await prisma.memberNote.findFirst({
      where: { id: req.params.noteId, companyId: auth.companyId, subjectId: req.params.id },
    });
    if (!note) throw ApiError.notFound('That note no longer exists.');
    if (auth.role !== 'OWNER' && note.authorId !== auth.membershipId) {
      throw ApiError.forbidden('You can only delete notes you wrote.');
    }
    await prisma.memberNote.delete({ where: { id: note.id } });
    res.json({ ok: true });
  }),
);

// ------------------------- quick "nudge" a person ---------------------------

peopleRouter.post(
  '/:id/message',
  validateBody(z.object({ body: z.string().trim().min(1, 'Write a message').max(1000) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const membership = await loadPersonInCompany(req.params.id, auth.companyId);
    if (membership.id === auth.membershipId) {
      throw ApiError.badRequest('You cannot send yourself a message.');
    }

    await notify({
      companyId: auth.companyId,
      recipientId: membership.id,
      actorId: auth.membershipId,
      type: 'ANNOUNCEMENT',
      title: `Message from ${auth.fullName}`,
      body: (req.body as { body: string }).body,
      entityType: 'person',
      entityId: auth.membershipId,
    });

    res.status(201).json({ ok: true });
  }),
);

// Keeps the map in sync if a company was created before nodes existed.
peopleRouter.post(
  '/sync-organization',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    await ensureOrganizationNodes(auth.companyId);
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);
