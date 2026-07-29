import { Router } from 'express';
import { z } from 'zod';
import { requirePlatformAdmin } from '../admin';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';

export const adminRouter = Router();

// This router is deliberately separate from company administration. It is
// protected by the hard-coded platform-admin email at the server boundary.
adminRouter.use(requireAuth, requirePlatformAdmin);

adminRouter.get(
  '/companies',
  asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
      include: {
        memberships: {
          where: { status: 'ACTIVE', deactivatedAt: null },
          select: { role: true, user: { select: { fullName: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      items: companies.map((company) => {
        const owner = company.memberships.find(
          (membership) => membership.role === 'OWNER' || membership.role === 'CO_OWNER',
        );
        return {
          id: company.id,
          name: company.name,
          slug: company.slug,
          createdAt: company.createdAt.toISOString(),
          memberCount: company.memberships.length,
          owner: owner ? { fullName: owner.user.fullName, email: owner.user.email } : null,
          subscriptionPlan: company.subscriptionPlan,
          subscriptionStatus: company.subscriptionStatus,
          subscriptionExpiresAt: company.subscriptionExpiresAt?.toISOString() ?? null,
        };
      }),
    });
  }),
);

const subscriptionSchema = z.object({
  subscriptionPlan: z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']),
  subscriptionStatus: z.enum(['ACTIVE', 'SUSPENDED']),
  subscriptionExpiresAt: z.coerce.date().nullable().optional(),
});

adminRouter.patch(
  '/companies/:id/subscription',
  validateBody(subscriptionSchema),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) throw ApiError.notFound('That company no longer exists.');

    const input = req.body as z.infer<typeof subscriptionSchema>;
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        subscriptionPlan: input.subscriptionPlan,
        subscriptionStatus: input.subscriptionStatus,
        ...(input.subscriptionExpiresAt !== undefined
          ? { subscriptionExpiresAt: input.subscriptionExpiresAt }
          : {}),
      },
    });
    res.json({
      id: updated.id,
      subscriptionPlan: updated.subscriptionPlan,
      subscriptionStatus: updated.subscriptionStatus,
      subscriptionExpiresAt: updated.subscriptionExpiresAt?.toISOString() ?? null,
    });
  }),
);
