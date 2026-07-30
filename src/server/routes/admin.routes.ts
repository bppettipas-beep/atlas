import { Router } from 'express';
import { z } from 'zod';
import { requirePlatformAdmin } from '../admin';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { sendSubscriptionEmail } from '../services/email';

export const adminRouter = Router();

adminRouter.use(requireAuth, requirePlatformAdmin);

const planSchema = z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']);
const statusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

const userSubscriptionSchema = z
  .object({
    subscriptionPlan: planSchema.nullable(),
    subscriptionStatus: statusSchema.nullable(),
    subscriptionExpiresAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.subscriptionPlan === null && value.subscriptionStatus !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subscriptionStatus'],
        message: 'An account without a plan cannot have a subscription status.',
      });
    }
    if (value.subscriptionPlan !== null && value.subscriptionStatus === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subscriptionStatus'],
        message: 'Choose a status for this plan.',
      });
    }
  });

function serializeUser(user: {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  isPlatformAdmin: boolean;
  accountPlan: 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE' | null;
  accountSubscriptionStatus: 'ACTIVE' | 'SUSPENDED' | null;
  accountSubscriptionExpiresAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  memberships: {
    id: string;
    role: 'OWNER' | 'CO_OWNER' | 'MANAGER' | 'WORKER';
    company: { id: string; name: string; slug: string };
  }[];
  refreshTokens: { id: string }[];
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    location: user.location,
    isPlatformAdmin: user.isPlatformAdmin,
    subscriptionPlan: user.accountPlan,
    subscriptionStatus: user.accountSubscriptionStatus,
    subscriptionExpiresAt: user.accountSubscriptionExpiresAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    activeSessionCount: user.refreshTokens.length,
    companies: user.memberships.map((membership) => ({
      membershipId: membership.id,
      role: membership.role,
      ...membership.company,
    })),
  };
}

const userInclude = {
  memberships: {
    where: { status: 'ACTIVE' as const, deactivatedAt: null },
    select: {
      id: true,
      role: true,
      company: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  refreshTokens: {
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  },
};

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const plan = planSchema.safeParse(req.query.plan).success
      ? (req.query.plan as z.infer<typeof planSchema>)
      : undefined;
    const state =
      req.query.state === 'free' || req.query.state === 'active' || req.query.state === 'suspended'
        ? req.query.state
        : undefined;

    const where = {
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              {
                memberships: {
                  some: { company: { name: { contains: search, mode: 'insensitive' as const } } },
                },
              },
            ],
          }
        : {}),
      ...(plan ? { accountPlan: plan } : {}),
      ...(state === 'free'
        ? { accountPlan: null }
        : state
          ? {
              accountSubscriptionStatus:
                state === 'active' ? ('ACTIVE' as const) : ('SUSPENDED' as const),
            }
          : {}),
    };

    const [users, total, allUsers, paidUsers, panelUsers, activeSessions] = await Promise.all([
      prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: { createdAt: 'desc' },
        take: 250,
      }),
      prisma.user.count({ where }),
      prisma.user.count(),
      prisma.user.count({ where: { accountPlan: { not: null } } }),
      prisma.user.count({
        where: { memberships: { some: { status: 'ACTIVE', deactivatedAt: null } } },
      }),
      prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);

    res.json({
      items: users.map(serializeUser),
      total,
      limited: total > users.length,
      metrics: { allUsers, paidUsers, freeUsers: allUsers - paidUsers, panelUsers, activeSessions },
    });
  }),
);

adminRouter.patch(
  '/users/:id/subscription',
  validateBody(userSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, fullName: true },
    });
    if (!target) throw ApiError.notFound('That account no longer exists.');
    const input = req.body as z.infer<typeof userSubscriptionSchema>;

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          accountPlan: input.subscriptionPlan,
          accountSubscriptionStatus: input.subscriptionStatus,
          accountSubscriptionExpiresAt:
            input.subscriptionPlan === null ? null : (input.subscriptionExpiresAt ?? null),
        },
        include: userInclude,
      });

      if (input.subscriptionPlan !== null && input.subscriptionStatus !== null) {
        await tx.company.updateMany({
          where: {
            memberships: {
              some: {
                userId: target.id,
                role: 'OWNER',
                status: 'ACTIVE',
                deactivatedAt: null,
              },
            },
          },
          data: {
            subscriptionPlan: input.subscriptionPlan,
            subscriptionStatus: input.subscriptionStatus,
            subscriptionExpiresAt: input.subscriptionExpiresAt ?? null,
          },
        });
      } else {
        // A company row must always carry a plan enum, so removing the
        // account's paid plan parks owned panels on suspended Starter access.
        // The panel remains recoverable if the account subscribes again.
        await tx.company.updateMany({
          where: {
            memberships: {
              some: {
                userId: target.id,
                role: 'OWNER',
                status: 'ACTIVE',
                deactivatedAt: null,
              },
            },
          },
          data: {
            subscriptionPlan: 'STARTER',
            subscriptionStatus: 'SUSPENDED',
            subscriptionExpiresAt: null,
          },
        });
      }
      return user;
    });

    void sendSubscriptionEmail(
      target,
      updated.accountPlan,
      updated.accountSubscriptionStatus === 'ACTIVE',
    );
    res.json(serializeUser(updated));
  }),
);

adminRouter.post(
  '/users/:id/revoke-sessions',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isPlatformAdmin: true },
    });
    if (!target) throw ApiError.notFound('That account no longer exists.');
    if (target.isPlatformAdmin) {
      throw ApiError.forbidden('The platform administrator cannot revoke their own sessions here.');
    }

    const result = await prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true, revokedSessions: result.count });
  }),
);
