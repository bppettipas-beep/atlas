import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../auth/cookies';
import {
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyPassword,
} from '../auth/tokens';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody, validateQuery, parsedQuery } from '../http/validate';
import { currentAuth, requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { uniqueSlug } from '../lib/ids';
import { recordActivity } from '../services/activity';
import { ensureNotificationPreference, notify } from '../services/notifications';
import { ensureOrganizationNodes, broadcastOrganizationChange } from '../services/organization';
import { serializeCompany } from '../services/serializers';
import { emitToCompany } from '../realtime/io';
import type { SessionUserDto } from '../../shared/types';
import type { Request, Response } from 'express';

export const authRouter = Router();

/** Brute-force protection on the credential endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    },
  },
});

const email = z
  .string()
  .trim()
  .min(1, 'Email address is required')
  .email('That does not look like a valid email address')
  .toLowerCase();

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'That password is too long');

const fullName = z.string().trim().min(2, 'Please enter your full name').max(120);

const ownerSignupSchema = z.object({
  fullName,
  email,
  password,
  companyName: z.string().trim().min(2, 'Company name is required').max(120),
  industry: z.string().trim().max(80).optional().or(z.literal('')),
  sizeRange: z.string().trim().max(40).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  timezone: z.string().trim().max(80).default('UTC'),
  logoUrl: z.string().trim().max(500).optional().or(z.literal('')),
});

const workerJoinSchema = z.object({
  fullName,
  email,
  password,
  code: z
    .string()
    .trim()
    .min(4, 'Enter the invitation code your manager gave you')
    .max(32)
    .transform((value) => value.toUpperCase().replace(/\s+/g, '')),
  jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

async function issueSession(req: Request, res: Response, userId: string, membershipId: string) {
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { id: membershipId },
    select: { id: true, companyId: true, role: true },
  });

  const { token, tokenHash } = createRefreshToken();
  const expiresAt = refreshTokenExpiry();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    },
  });

  const accessToken = signAccessToken({
    sub: userId,
    mid: membership.id,
    cid: membership.companyId,
    role: membership.role,
  });

  setAuthCookies(res, accessToken, token, expiresAt);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function buildSessionPayload(
  userId: string,
  membershipId: string,
): Promise<SessionUserDto> {
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { id: membershipId },
    include: {
      user: { select: { id: true, email: true, fullName: true, avatarUrl: true } },
      company: true,
      profile: true,
    },
  });

  const [memberships, unread] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', deactivatedAt: null },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.notification.count({ where: { recipientId: membershipId, readAt: null } }),
  ]);

  return {
    user: {
      id: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      avatarUrl: membership.user.avatarUrl,
    },
    membership: {
      id: membership.id,
      role: membership.role,
      jobTitle: membership.jobTitle,
      status: membership.status,
      availability: membership.profile?.availability ?? 'AVAILABLE',
    },
    company: serializeCompany(membership.company),
    memberships: memberships.map((item) => ({
      id: item.id,
      companyId: item.companyId,
      companyName: item.company.name,
      role: item.role,
    })),
    unreadNotifications: unread,
  };
}

// --------------------------- owner sign-up ---------------------------------

authRouter.post(
  '/owner-signup',
  authLimiter,
  validateBody(ownerSignupSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof ownerSignupSchema>;

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw ApiError.conflict(
        'An account already uses that email address. Sign in instead.',
        'EMAIL_TAKEN',
      );
    }

    const slug = await uniqueSlug(input.companyName, async (candidate) =>
      Boolean(await prisma.company.findUnique({ where: { slug: candidate } })),
    );

    const { membershipId, companyId } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: await hashPassword(input.password),
        },
      });

      const company = await tx.company.create({
        data: {
          name: input.companyName,
          slug,
          industry: input.industry || null,
          sizeRange: input.sizeRange || null,
          location: input.location || null,
          timezone: input.timezone || 'UTC',
          logoUrl: input.logoUrl || null,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: 'OWNER',
          jobTitle: 'Owner',
          profile: {
            create: {
              headline: 'Runs the business',
              availability: 'AVAILABLE',
            },
          },
        },
      });

      await tx.notificationPreference.create({ data: { membershipId: membership.id } });

      // Every new company starts with a Leadership team so the map is never
      // completely empty and there is somewhere obvious to add managers.
      const team = await tx.team.create({
        data: {
          companyId: company.id,
          name: 'Leadership',
          description: 'Owners and managers who set direction for the company.',
          color: '#1f6feb',
          leadId: membership.id,
        },
      });

      await tx.teamMembership.create({
        data: { teamId: team.id, membershipId: membership.id, roleInTeam: 'Owner' },
      });

      return { membershipId: membership.id, companyId: company.id, userId: user.id };
    });

    await ensureOrganizationNodes(companyId);

    await recordActivity({
      companyId,
      type: 'MEMBER_JOINED',
      summary: `${input.fullName} created ${input.companyName} on Atlas`,
      actorId: membershipId,
      targetId: membershipId,
    });

    const user = await prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { userId: true },
    });

    await issueSession(req, res, user.userId, membershipId);
    res.status(201).json(await buildSessionPayload(user.userId, membershipId));
  }),
);

// --------------------------- worker join -----------------------------------

/**
 * Public lookup so the join screen can say "You're joining Northstar
 * Facilities" before the account is created. It only ever echoes back the
 * company name for a code the caller already possesses.
 */
authRouter.get(
  '/invite-preview',
  authLimiter,
  validateQuery(z.object({ code: z.string().trim().min(1).max(32) })),
  asyncHandler(async (_req, res) => {
    const { code } = parsedQuery<{ code: string }>(res);
    const invite = await prisma.inviteCode.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        company: { select: { name: true, logoUrl: true } },
        team: { select: { name: true } },
      },
    });

    if (!invite || !invite.active) {
      throw ApiError.notFound('That invitation code is not valid.', 'INVALID_INVITE');
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('That invitation code has expired.', 'EXPIRED_INVITE');
    }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw ApiError.badRequest(
        'That invitation code has already been used the maximum number of times.',
        'EXHAUSTED_INVITE',
      );
    }

    res.json({
      companyName: invite.company.name,
      companyLogoUrl: invite.company.logoUrl,
      teamName: invite.team?.name ?? null,
      role: invite.role,
    });
  }),
);

authRouter.post(
  '/worker-join',
  authLimiter,
  validateBody(workerJoinSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof workerJoinSchema>;

    const invite = await prisma.inviteCode.findUnique({
      where: { code: input.code },
      include: { company: true },
    });

    if (!invite || !invite.active) {
      throw ApiError.badRequest(
        'That invitation code is not valid. Double-check it with whoever invited you.',
        'INVALID_INVITE',
      );
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest(
        'That invitation code has expired. Ask your manager for a new one.',
        'EXPIRED_INVITE',
      );
    }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw ApiError.badRequest(
        'That invitation code has already been used the maximum number of times.',
        'EXHAUSTED_INVITE',
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      include: { memberships: { where: { companyId: invite.companyId } } },
    });

    if (existingUser && existingUser.memberships.length > 0) {
      throw ApiError.conflict(
        `You are already part of ${invite.company.name}. Sign in instead.`,
        'ALREADY_MEMBER',
      );
    }
    if (existingUser) {
      throw ApiError.conflict(
        'An account already uses that email address. Sign in, then ask an owner to add you.',
        'EMAIL_TAKEN',
      );
    }

    const membershipId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: await hashPassword(input.password),
        },
      });

      // A new worker reports to the lead of the team they were invited into,
      // falling back to the company owner so nobody is orphaned on the map.
      let managerId: string | null = null;
      if (invite.teamId) {
        const team = await tx.team.findUnique({ where: { id: invite.teamId } });
        managerId = team?.leadId ?? null;
      }
      if (!managerId) {
        const owner = await tx.membership.findFirst({
          where: { companyId: invite.companyId, role: 'OWNER', deactivatedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        managerId = owner?.id ?? null;
      }

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          companyId: invite.companyId,
          role: invite.role,
          jobTitle: input.jobTitle || null,
          managerId,
          profile: { create: { availability: 'AVAILABLE' } },
        },
      });

      await tx.notificationPreference.create({ data: { membershipId: membership.id } });

      if (invite.teamId) {
        await tx.teamMembership.create({
          data: { teamId: invite.teamId, membershipId: membership.id },
        });
      }

      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      });

      await tx.directInvite.updateMany({
        where: { companyId: invite.companyId, email: input.email, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });

      return membership.id;
    });

    await ensureOrganizationNodes(invite.companyId);

    await recordActivity({
      companyId: invite.companyId,
      type: 'MEMBER_JOINED',
      summary: `${input.fullName} joined ${invite.company.name}`,
      actorId: membershipId,
      targetId: membershipId,
      metadata: { via: 'invite-code' },
    });
    await recordActivity({
      companyId: invite.companyId,
      type: 'INVITE_USED',
      summary: `Invitation code ${invite.code} was used by ${input.fullName}`,
      targetId: membershipId,
      visibility: 'MANAGERS',
      metadata: { inviteCodeId: invite.id },
    });

    const leadership = await prisma.membership.findMany({
      where: {
        companyId: invite.companyId,
        role: { in: ['OWNER', 'MANAGER'] },
        deactivatedAt: null,
        id: { not: membershipId },
      },
      select: { id: true },
    });

    for (const leader of leadership) {
      await notify({
        companyId: invite.companyId,
        recipientId: leader.id,
        actorId: membershipId,
        type: 'MEMBER_JOINED',
        title: `${input.fullName} joined the company`,
        body: input.jobTitle
          ? `They joined as ${input.jobTitle}.`
          : 'Say hello and assign their first task.',
        entityType: 'person',
        entityId: membershipId,
      });
    }

    broadcastOrganizationChange(invite.companyId);
    emitToCompany(invite.companyId, 'people:updated', {});

    const created = await prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { userId: true },
    });

    await issueSession(req, res, created.userId, membershipId);
    res.status(201).json(await buildSessionPayload(created.userId, membershipId));
  }),
);

// ------------------------------ login --------------------------------------

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          where: { status: 'ACTIVE', deactivatedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Always compare against *something* so the response time does not reveal
    // whether the email exists.
    const passwordOk = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(
          input.password,
          '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinva',
        );

    if (!user || !passwordOk) {
      throw ApiError.unauthorized('That email or password is not correct.', 'INVALID_CREDENTIALS');
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw ApiError.forbidden(
        'Your account is not active in any company. Ask an owner to invite you again.',
        'NO_ACTIVE_MEMBERSHIP',
      );
    }

    await issueSession(req, res, user.id, membership.id);
    res.json(await buildSessionPayload(user.id, membership.id));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/session',
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'You are not signed in.' },
      });
      return;
    }
    res.json(await buildSessionPayload(req.auth.userId, req.auth.membershipId));
  }),
);

authRouter.post(
  '/switch-company',
  requireAuth,
  validateBody(z.object({ membershipId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const target = await prisma.membership.findFirst({
      where: {
        id: (req.body as { membershipId: string }).membershipId,
        userId: auth.userId,
        status: 'ACTIVE',
        deactivatedAt: null,
      },
    });
    if (!target) throw ApiError.notFound('You are not a member of that company.');

    await issueSession(req, res, auth.userId, target.id);
    res.json(await buildSessionPayload(auth.userId, target.id));
  }),
);

authRouter.patch(
  '/password',
  requireAuth,
  validateBody(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password'),
      newPassword: password,
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Your current password is not correct.', 'INVALID_CREDENTIALS');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Signing out other devices is the safe default after a password change.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await issueSession(req, res, user.id, auth.membershipId);
    await ensureNotificationPreference(auth.membershipId);

    res.json({ ok: true });
  }),
);
