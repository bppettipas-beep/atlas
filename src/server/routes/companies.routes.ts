import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth, requireRole } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify } from '../services/notifications';
import { serializeAnnouncement, serializeCompany } from '../services/serializers';
import { endOfDay, startOfDay, startOfWeek } from '../lib/dates';
import type { HomeSummaryDto, TaskStatus } from '../../shared/types';

export const companiesRouter = Router();

companiesRouter.use(requireAuth);

companiesRouter.get(
  '/current',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: auth.companyId } });
    res.json(serializeCompany(company));
  }),
);

const companyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  sizeRange: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(80).optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
});

companiesRouter.patch(
  '/current',
  requireRole('OWNER'),
  validateBody(companyUpdateSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const company = await prisma.company.update({
      where: { id: auth.companyId },
      data: req.body as z.infer<typeof companyUpdateSchema>,
    });
    emitToCompany(auth.companyId, 'company:updated', {});
    res.json(serializeCompany(company));
  }),
);

/** Numbers behind the Home dashboard. */
companiesRouter.get(
  '/current/summary',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const companyId = auth.companyId;
    const now = new Date();

    const [
      people,
      teams,
      grouped,
      overdue,
      unassigned,
      dueToday,
      completedThisWeek,
      requiredDocs,
      myAcks,
      openInvites,
    ] = await Promise.all([
      prisma.membership.count({ where: { companyId, deactivatedAt: null } }),
      prisma.team.count({ where: { companyId, archivedAt: null } }),
      prisma.task.groupBy({
        by: ['status'],
        where: { companyId, archivedAt: null },
        _count: { _all: true },
      }),
      prisma.task.count({
        where: { companyId, archivedAt: null, status: { not: 'DONE' }, dueAt: { lt: now } },
      }),
      prisma.task.count({
        where: { companyId, archivedAt: null, status: { not: 'DONE' }, assigneeId: null },
      }),
      prisma.task.count({
        where: {
          companyId,
          archivedAt: null,
          status: { not: 'DONE' },
          dueAt: { gte: startOfDay(now), lte: endOfDay(now) },
        },
      }),
      prisma.task.count({
        where: {
          companyId,
          archivedAt: null,
          status: 'DONE',
          completedAt: { gte: startOfWeek(now) },
        },
      }),
      prisma.knowledgeDocument.count({
        where: { companyId, archivedAt: null, status: 'PUBLISHED', requiresAcknowledgment: true },
      }),
      prisma.knowledgeAcknowledgment.count({
        where: {
          membershipId: auth.membershipId,
          document: {
            companyId,
            archivedAt: null,
            status: 'PUBLISHED',
            requiresAcknowledgment: true,
          },
        },
      }),
      prisma.inviteCode.count({ where: { companyId, active: true } }),
    ]);

    const tasksByStatus = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      BLOCKED: 0,
      AWAITING_REVIEW: 0,
      DONE: 0,
    } as Record<TaskStatus, number>;
    for (const row of grouped) {
      tasksByStatus[row.status as TaskStatus] = row._count._all;
    }

    const payload: HomeSummaryDto = {
      people,
      teams,
      tasksByStatus,
      overdue,
      unassigned,
      dueToday,
      completedThisWeek,
      pendingAcknowledgments: Math.max(0, requiredDocs - myAcks),
      openInvites,
    };
    res.json(payload);
  }),
);

// ---------------------------- announcements --------------------------------

companiesRouter.get(
  '/current/announcements',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const announcements = await prisma.announcement.findMany({
      where: { companyId: auth.companyId },
      include: { author: { include: { user: { select: { fullName: true, avatarUrl: true } } } } },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 25,
    });
    res.json({ items: announcements.map(serializeAnnouncement) });
  }),
);

companiesRouter.post(
  '/current/announcements',
  requireRole('OWNER', 'MANAGER'),
  validateBody(
    z.object({
      title: z.string().trim().min(2, 'Give the announcement a title').max(140),
      body: z.string().trim().min(2, 'Write the announcement').max(4000),
      pinned: z.boolean().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as { title: string; body: string; pinned: boolean };

    const announcement = await prisma.announcement.create({
      data: { ...input, companyId: auth.companyId, authorId: auth.membershipId },
      include: { author: { include: { user: { select: { fullName: true, avatarUrl: true } } } } },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'ANNOUNCEMENT_POSTED',
      summary: `${auth.fullName} posted an announcement: "${input.title}"`,
      actorId: auth.membershipId,
    });

    const audience = await prisma.membership.findMany({
      where: { companyId: auth.companyId, deactivatedAt: null, id: { not: auth.membershipId } },
      select: { id: true },
    });
    for (const member of audience) {
      await notify({
        companyId: auth.companyId,
        recipientId: member.id,
        actorId: auth.membershipId,
        type: 'ANNOUNCEMENT',
        title: input.title,
        body: input.body.slice(0, 200),
        entityType: 'announcement',
        entityId: announcement.id,
      });
    }

    emitToCompany(auth.companyId, 'announcement:new', { announcementId: announcement.id });
    res.status(201).json(serializeAnnouncement(announcement));
  }),
);

companiesRouter.delete(
  '/current/announcements/:id',
  requireRole('OWNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!announcement) throw ApiError.notFound('That announcement no longer exists.');
    await prisma.announcement.delete({ where: { id: announcement.id } });
    emitToCompany(auth.companyId, 'announcement:new', {});
    res.json({ ok: true });
  }),
);
