import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { PERMISSIONS } from '../services/authorization';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify } from '../services/notifications';
import { serializeAnnouncement, serializeCompany } from '../services/serializers';
import { endOfDay, startOfDay, startOfWeek } from '../lib/dates';
import type {
  CompanyMetricsDto,
  DailyBriefingDto,
  HomeSummaryDto,
  TaskStatus,
} from '../../shared/types';
import { PLAN_ENTITLEMENTS } from '../../shared/plans';
import { requireActiveSubscription, requirePlanFeature } from '../services/subscriptions';
import { createApiKeySecret } from '../services/apiKeys';

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

companiesRouter.get(
  '/current/entitlements',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const entitlements = PLAN_ENTITLEMENTS[auth.subscriptionPlan];
    const activeEmployees = await prisma.membership.count({
      where: { companyId: auth.companyId, status: 'ACTIVE', deactivatedAt: null },
    });
    res.json({
      plan: auth.subscriptionPlan,
      status: auth.subscriptionStatus,
      expiresAt: auth.subscriptionExpiresAt?.toISOString() ?? null,
      employeeLimit: entitlements.employeeLimit,
      activeEmployees,
      features: entitlements.features,
      servicePerks: entitlements.servicePerks,
    });
  }),
);

companiesRouter.get(
  '/current/api-keys',
  requirePlanFeature('API_ACCESS'),
  requirePermission(PERMISSIONS.COMPANY_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const keys = await prisma.apiKey.findMany({
      where: { companyId: auth.companyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        expiresAt: key.expiresAt?.toISOString() ?? null,
      })),
    });
  }),
);

companiesRouter.post(
  '/current/api-keys',
  requirePlanFeature('API_ACCESS'),
  requirePermission(PERMISSIONS.COMPANY_MANAGE),
  validateBody(
    z.object({
      name: z.string().trim().min(2).max(80),
      expiresAt: z.coerce.date().nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as { name: string; expiresAt?: Date | null };
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw ApiError.badRequest('The API key expiry must be in the future.', 'BAD_EXPIRY');
    }
    const secret = createApiKeySecret();
    const key = await prisma.apiKey.create({
      data: {
        companyId: auth.companyId,
        membershipId: auth.membershipId,
        name: input.name,
        prefix: secret.prefix,
        tokenHash: secret.hash,
        expiresAt: input.expiresAt ?? null,
      },
    });
    res.status(201).json({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      token: secret.token,
      createdAt: key.createdAt.toISOString(),
      expiresAt: key.expiresAt?.toISOString() ?? null,
    });
  }),
);

companiesRouter.delete(
  '/current/api-keys/:id',
  requirePlanFeature('API_ACCESS'),
  requirePermission(PERMISSIONS.COMPANY_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const changed = await prisma.apiKey.updateMany({
      where: { id: req.params.id, companyId: auth.companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!changed.count) throw ApiError.notFound('That API key is already gone.');
    res.json({ ok: true });
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

async function companyMetrics(companyId: string, now = new Date()): Promise<CompanyMetricsDto> {
  const weekStart = startOfWeek(now);
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const activeWhere = { companyId, archivedAt: null, status: { not: 'DONE' as const } };
  const [
    activeTasks,
    createdThisWeek,
    completedThisWeek,
    scheduledToday,
    dueToday,
    overdue,
    blocked,
    unassigned,
    messagesLast24Hours,
    workloadCounts,
  ] = await Promise.all([
    prisma.task.count({ where: activeWhere }),
    prisma.task.count({ where: { companyId, archivedAt: null, createdAt: { gte: weekStart } } }),
    prisma.task.count({
      where: { companyId, archivedAt: null, status: 'DONE', completedAt: { gte: weekStart } },
    }),
    prisma.task.count({ where: { ...activeWhere, startAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.task.count({ where: { ...activeWhere, dueAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.task.count({ where: { ...activeWhere, dueAt: { lt: now } } }),
    prisma.task.count({ where: { companyId, archivedAt: null, status: 'BLOCKED' } }),
    prisma.task.count({ where: { ...activeWhere, assigneeId: null } }),
    prisma.chatMessage.count({
      where: {
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1_000) },
        conversation: { companyId, kind: 'COMPANY' },
      },
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { ...activeWhere, assigneeId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { assigneeId: 'desc' } },
      take: 5,
    }),
  ]);

  const membershipIds = workloadCounts.flatMap((row) => (row.assigneeId ? [row.assigneeId] : []));
  const people = await prisma.membership.findMany({
    where: { id: { in: membershipIds }, companyId },
    select: { id: true, user: { select: { fullName: true, avatarUrl: true } } },
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const workload = workloadCounts.flatMap((row) => {
    const person = row.assigneeId ? peopleById.get(row.assigneeId) : null;
    return person
      ? [
          {
            membershipId: person.id,
            fullName: person.user.fullName,
            avatarUrl: person.user.avatarUrl,
            activeTasks: row._count._all,
          },
        ]
      : [];
  });

  const completedOrActive = completedThisWeek + activeTasks;
  return {
    activeTasks,
    createdThisWeek,
    completedThisWeek,
    completionRate:
      completedOrActive === 0 ? 0 : Math.round((completedThisWeek / completedOrActive) * 100),
    scheduledToday,
    dueToday,
    overdue,
    blocked,
    unassigned,
    messagesLast24Hours,
    workload,
  };
}

companiesRouter.patch(
  '/current',
  requirePermission(PERMISSIONS.COMPANY_MANAGE),
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

const PROMO_CODE = 'ATLAS26';
const PROMO_PLAN_DAYS = 30;

const redeemPromoSchema = z.object({
  code: z.string().trim().min(1).max(40),
});

companiesRouter.post(
  '/current/redeem-promo',
  requirePermission(PERMISSIONS.COMPANY_MANAGE),
  validateBody(redeemPromoSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof redeemPromoSchema>;

    if (input.code.trim().toUpperCase() !== PROMO_CODE) {
      throw ApiError.badRequest('That code is not valid.', 'INVALID_PROMO_CODE');
    }

    const company = await prisma.company.findUniqueOrThrow({ where: { id: auth.companyId } });

    if (company.promoCodeRedeemedAt) {
      throw ApiError.conflict(
        'This company has already redeemed a promo code.',
        'PROMO_ALREADY_USED',
      );
    }
    if (company.subscriptionPlan !== 'STARTER') {
      throw ApiError.conflict(
        'This company already has a paid plan, so this code does not apply.',
        'ALREADY_PAID',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PROMO_PLAN_DAYS * 24 * 60 * 60 * 1_000);
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        subscriptionPlan: 'GROWTH',
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: expiresAt,
        promoCodeRedeemedAt: now,
      },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'SUBSCRIPTION_UPGRADED',
      summary: `Redeemed code ${PROMO_CODE} for a free month of Growth`,
      actorId: auth.membershipId,
      visibility: 'MANAGERS',
    });

    emitToCompany(auth.companyId, 'company:updated', {});
    res.json(serializeCompany(updated));
  }),
);

/** Numbers behind the Home dashboard. */
companiesRouter.get(
  '/current/summary',
  requireActiveSubscription,
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

/** Management-only operational metrics for the company dashboard and Atlasy. */
companiesRouter.get(
  '/current/metrics',
  requirePlanFeature('REPORTING'),
  requirePermission(PERMISSIONS.METRICS_VIEW),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    res.json(await companyMetrics(auth.companyId));
  }),
);

/** A concise, data-backed start-of-day brief. Atlasy can expand on this in chat. */
companiesRouter.get(
  '/current/briefing',
  requirePlanFeature('ATLASY'),
  requirePermission(PERMISSIONS.ATLASY_BRIEFING),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const metrics = await companyMetrics(auth.companyId);
    const priorities: DailyBriefingDto['priorities'] = [];
    if (metrics.overdue > 0)
      priorities.push({
        tone: 'alert',
        text: `${metrics.overdue} overdue task${metrics.overdue === 1 ? '' : 's'} need attention.`,
        href: '/app/work?scope=overdue',
      });
    if (metrics.blocked > 0)
      priorities.push({
        tone: 'alert',
        text: `${metrics.blocked} task${metrics.blocked === 1 ? ' is' : 's are'} blocked.`,
        href: '/app/work?scope=all',
      });
    if (metrics.unassigned > 0)
      priorities.push({
        tone: 'pending',
        text: `${metrics.unassigned} task${metrics.unassigned === 1 ? ' is' : 's are'} waiting for an owner.`,
        href: '/app/work?scope=unassigned',
      });
    if (metrics.dueToday > 0)
      priorities.push({
        tone: 'mark',
        text: `${metrics.dueToday} task${metrics.dueToday === 1 ? ' is' : 's are'} due today.`,
        href: '/app/work?scope=today',
      });

    const payload: DailyBriefingDto = {
      generatedAt: new Date().toISOString(),
      headline:
        priorities.length > 0
          ? `There ${priorities.length === 1 ? 'is' : 'are'} ${priorities.length} thing${priorities.length === 1 ? '' : 's'} to focus on.`
          : 'Everything is on track right now.',
      priorities,
      highlights: [
        `${metrics.activeTasks} active task${metrics.activeTasks === 1 ? '' : 's'} across the company.`,
        `${metrics.scheduledToday} scheduled for today and ${metrics.completedThisWeek} completed since Monday.`,
        `${metrics.messagesLast24Hours} company-chat message${metrics.messagesLast24Hours === 1 ? '' : 's'} in the last 24 hours.`,
      ],
    };
    res.json(payload);
  }),
);

/** Business-level trend data used by dashboards and external API clients. */
companiesRouter.get(
  '/current/analytics',
  requirePlanFeature('ANALYTICS'),
  requirePermission(PERMISSIONS.METRICS_VIEW),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const now = new Date();
    const windows = Array.from({ length: 6 }, (_, index) => {
      const to = new Date(now);
      to.setDate(to.getDate() - index * 7);
      const from = new Date(to);
      from.setDate(from.getDate() - 7);
      return { from, to };
    }).reverse();
    const points = await Promise.all(
      windows.map(async ({ from, to }) => {
        const [created, completed, blocked] = await Promise.all([
          prisma.task.count({
            where: { companyId: auth.companyId, createdAt: { gte: from, lt: to } },
          }),
          prisma.task.count({
            where: { companyId: auth.companyId, completedAt: { gte: from, lt: to } },
          }),
          prisma.activityEvent.count({
            where: {
              companyId: auth.companyId,
              type: 'TASK_BLOCKED',
              createdAt: { gte: from, lt: to },
            },
          }),
        ]);
        return { from: from.toISOString(), to: to.toISOString(), created, completed, blocked };
      }),
    );
    res.json({ generatedAt: now.toISOString(), points });
  }),
);

// ---------------------------- announcements --------------------------------

companiesRouter.get(
  '/current/announcements',
  requireActiveSubscription,
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
  requireActiveSubscription,
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
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
  requireActiveSubscription,
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
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
