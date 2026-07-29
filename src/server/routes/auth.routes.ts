import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  clearAuthCookies,
  clearGoogleCookies,
  GOOGLE_GRANT_COOKIE,
  GOOGLE_NONCE_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  setGoogleGrantCookie,
  setGoogleNonceCookie,
} from '../auth/cookies';
import {
  buildAuthorizationUrl,
  decodeGrant,
  decodeState,
  encodeGrant,
  exchangeCodeForProfile,
  type GoogleIntent,
} from '../auth/google';
import { env } from '../env';
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
import { createCompanyRanks, rankIdForLegacyRole } from '../services/authorization';
import { uniqueSlug } from '../lib/ids';
import { recordActivity } from '../services/activity';
import { ensureNotificationPreference, notify, notifyLeadership } from '../services/notifications';
import { ensureOrganizationNodes, broadcastOrganizationChange } from '../services/organization';
import { serializeCompany } from '../services/serializers';
import { emitToCompany } from '../realtime/io';
import { isPlatformAdmin } from '../admin';
import type { SessionUserDto } from '../../shared/types';
import type { Request, Response } from 'express';

export const authRouter = Router();

/** Brute-force protection on the credential endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT,
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

/**
 * Name, email and password are optional *only* because they may instead come
 * from a completed Google sign-in. `resolveNewAccount` enforces that one of the
 * two is actually present, and never trusts a client-supplied email when Google
 * is the source — otherwise anyone could claim any address.
 */
const credentials = {
  fullName: fullName.optional(),
  email: email.optional(),
  password: password.optional(),
  useGoogle: z.boolean().optional(),
};

const ownerSignupSchema = z.object({
  ...credentials,
  companyName: z.string().trim().min(2, 'Company name is required').max(120),
  industry: z.string().trim().max(80).optional().or(z.literal('')),
  sizeRange: z.string().trim().max(40).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  timezone: z.string().trim().max(80).default('UTC'),
  logoUrl: z.string().trim().max(500).optional().or(z.literal('')),
});

const workerJoinSchema = z.object({
  ...credentials,
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

/** The account fields to create, from whichever way the person proved who they are. */
interface NewAccount {
  email: string;
  fullName: string;
  avatarUrl: string | null;
  googleId: string | null;
  passwordHash: string | null;
}

/**
 * Turns a sign-up body into the account to create.
 *
 * When Google is the source, every identity field is read from the signed grant
 * cookie rather than the request body. The browser is free to send whatever it
 * likes in the JSON; none of it is trusted.
 */
async function resolveNewAccount(
  req: Request,
  input: { useGoogle?: boolean; email?: string; fullName?: string; password?: string },
): Promise<NewAccount> {
  if (input.useGoogle) {
    const grant = decodeGrant(req.cookies?.[GOOGLE_GRANT_COOKIE] as string | undefined);
    return {
      email: grant.email,
      fullName: grant.fullName,
      avatarUrl: grant.avatarUrl,
      googleId: grant.googleId,
      passwordHash: null,
    };
  }

  if (!input.email || !input.fullName || !input.password) {
    throw ApiError.badRequest(
      'Enter your name, email address and a password.',
      'MISSING_CREDENTIALS',
    );
  }

  return {
    email: input.email,
    fullName: input.fullName,
    avatarUrl: null,
    googleId: null,
    passwordHash: await hashPassword(input.password),
  };
}

/** A deleted email address remains permanently reserved and cannot be reused. */
async function assertEmailAvailable(emailAddress: string) {
  const deleted = await prisma.deletedEmail.findUnique({ where: { email: emailAddress } });
  if (deleted) {
    throw ApiError.conflict(
      'An account previously used that email address and it cannot be registered again.',
      'EMAIL_RETIRED',
    );
  }
}

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
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          passwordHash: true,
          googleId: true,
        },
      },
      company: true,
      profile: true,
      rank: { include: { permissions: { select: { permissionKey: true } } } },
    },
  });

  const [memberships, unread] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', deactivatedAt: null },
      include: {
        company: { select: { id: true, name: true } },
        rank: { select: { name: true } },
      },
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
      // Booleans only — the hash itself must never leave the server.
      hasPassword: membership.user.passwordHash !== null,
      hasGoogle: membership.user.googleId !== null,
      isPlatformAdmin: isPlatformAdmin(membership.user.email),
    },
    membership: {
      id: membership.id,
      role: membership.role,
      rank: {
        id: membership.rank.id,
        key: membership.rank.key,
        name: membership.rank.name,
        position: membership.rank.position,
      },
      permissions: [...new Set(membership.rank.permissions.map((grant) => grant.permissionKey))],
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
      rankName: item.rank.name,
    })),
    unreadNotifications: unread,
  };
}

// ------------------------------ Google -------------------------------------

/**
 * Lets the sign-in screens know whether to draw the Google button at all.
 * Without credentials configured the button would be a dead end, so it is
 * simply not rendered.
 */
authRouter.get('/config', (_req, res) => {
  res.json({ google: env.googleEnabled });
});

function requireGoogleConfigured() {
  if (!env.googleEnabled) {
    throw ApiError.badRequest(
      'Google sign-in is not configured for this Atlas instance.',
      'GOOGLE_NOT_CONFIGURED',
    );
  }
}

/** Sends the browser to Google's account chooser. */
authRouter.get(
  '/google/start',
  authLimiter,
  validateQuery(
    z.object({
      intent: z.enum(['signin', 'signup', 'join']).default('signin'),
      code: z.string().trim().max(32).optional(),
    }),
  ),
  asyncHandler(async (_req, res) => {
    requireGoogleConfigured();
    const { intent, code } = parsedQuery<{ intent: GoogleIntent; code?: string }>(res);

    const nonce = crypto.randomBytes(16).toString('base64url');
    setGoogleNonceCookie(res, nonce);

    res.redirect(
      buildAuthorizationUrl({
        intent,
        inviteCode: code ? code.toUpperCase().replace(/\s+/g, '') : undefined,
        nonce,
      }),
    );
  }),
);

/** Where the person lands after choosing an account. Always ends in a redirect. */
authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const fail = (message: string) => res.redirect(`/signin?error=${encodeURIComponent(message)}`);

    if (!env.googleEnabled) return fail('Google sign-in is not configured.');
    if (typeof req.query.error === 'string') return fail('Google sign-in was cancelled.');

    const code = req.query.code;
    const rawState = req.query.state;
    if (typeof code !== 'string' || typeof rawState !== 'string') {
      return fail('Google sign-in did not complete. Please try again.');
    }

    const state = decodeState(rawState);
    // The nonce ties this callback to the browser that started the flow.
    if (state.nonce !== (req.cookies?.[GOOGLE_NONCE_COOKIE] as string | undefined)) {
      return fail('That sign-in link has expired. Please try again.');
    }

    const profile = await exchangeCodeForProfile(code);

    const existing =
      (await prisma.user.findUnique({ where: { googleId: profile.googleId } })) ??
      (await prisma.user.findUnique({ where: { email: profile.email } }));

    if (existing) {
      // Link Google to a pre-existing password account on first use, and fill
      // in a photo only when there is not one already — a picture the user
      // uploaded to Atlas should outrank the one on their Google account.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId: profile.googleId,
          avatarUrl: existing.avatarUrl ?? profile.avatarUrl,
        },
      });

      const membership = await prisma.membership.findFirst({
        where: { userId: existing.id, status: 'ACTIVE', deactivatedAt: null },
        orderBy: { createdAt: 'asc' },
      });

      if (!membership) {
        return fail('Your account is not active in any company. Ask an owner to invite you again.');
      }

      clearGoogleCookies(res);
      await issueSession(req, res, existing.id, membership.id);
      return res.redirect('/app');
    }

    // Nobody by that name yet. Google has vouched for them, but they still have
    // to say which company they are — so hand the browser a short-lived grant
    // and let the normal sign-up screens finish the job, prefilled.
    setGoogleGrantCookie(res, encodeGrant(profile));

    if (state.intent === 'join') {
      const query = new URLSearchParams({ google: '1' });
      if (state.inviteCode) query.set('code', state.inviteCode);
      return res.redirect(`/join?${query.toString()}`);
    }
    return res.redirect('/signup/owner?google=1');
  }),
);

/** The profile waiting to be turned into an account, for prefilling the form. */
authRouter.get(
  '/google/grant',
  asyncHandler(async (req, res) => {
    const grant = decodeGrant(req.cookies?.[GOOGLE_GRANT_COOKIE] as string | undefined);
    res.json({ email: grant.email, fullName: grant.fullName, avatarUrl: grant.avatarUrl });
  }),
);

// --------------------------- owner sign-up ---------------------------------

authRouter.post(
  '/owner-signup',
  authLimiter,
  validateBody(ownerSignupSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof ownerSignupSchema>;
    const account = await resolveNewAccount(req, input);
    await assertEmailAvailable(account.email);

    const existing = await prisma.user.findUnique({ where: { email: account.email } });
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
      const user = await tx.user.create({ data: account });

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
      const ranks = await createCompanyRanks(tx, company.id);

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          rankId: ranks.get('owner')!.id,
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
      summary: `${account.fullName} created ${input.companyName} on Atlas`,
      actorId: membershipId,
      targetId: membershipId,
    });

    const user = await prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      select: { userId: true },
    });

    clearGoogleCookies(res);
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
    const account = await resolveNewAccount(req, input);
    await assertEmailAvailable(account.email);

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
      where: { email: account.email },
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
      const user = await tx.user.create({ data: account });

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

      // Whatever the company nominated as its default role. Null is fine —
      // most companies will not have set one up on day one.
      const defaultRole = await tx.role.findFirst({
        where: { companyId: invite.companyId, isDefault: true },
        select: { id: true },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          companyId: invite.companyId,
          rankId: await rankIdForLegacyRole(tx, invite.companyId, invite.role),
          role: invite.role,
          roleId: defaultRole?.id ?? null,
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
        where: { companyId: invite.companyId, email: account.email, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });

      return membership.id;
    });

    await ensureOrganizationNodes(invite.companyId);

    await recordActivity({
      companyId: invite.companyId,
      type: 'MEMBER_JOINED',
      summary: `${account.fullName} joined ${invite.company.name}`,
      actorId: membershipId,
      targetId: membershipId,
      metadata: { via: 'invite-code' },
    });
    await recordActivity({
      companyId: invite.companyId,
      type: 'INVITE_USED',
      summary: `Invitation code ${invite.code} was used by ${account.fullName}`,
      targetId: membershipId,
      visibility: 'MANAGERS',
      metadata: { inviteCodeId: invite.id },
    });

    const leadership = await prisma.membership.findMany({
      where: {
        companyId: invite.companyId,
        role: { in: ['OWNER', 'CO_OWNER', 'MANAGER'] },
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
        title: `${account.fullName} joined the company`,
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

    // An account that only ever signed in with Google has no password to check.
    // Say so plainly — "email or password is not correct" would send someone
    // round in circles resetting a password that does not exist.
    if (user && !user.passwordHash) {
      // No password and no Google link means this was added by hand as a
      // placeholder. Telling them to press the Google button would send them
      // round a loop that cannot succeed.
      if (!user.googleId) {
        throw ApiError.unauthorized(
          'That email or password is not correct.',
          'INVALID_CREDENTIALS',
        );
      }
      throw ApiError.badRequest(
        'This account signs in with Google. Use the “Continue with Google” button.',
        'USE_GOOGLE',
      );
    }

    // Always compare against *something* so the response time does not reveal
    // whether the email exists.
    const passwordOk = await verifyPassword(
      input.password,
      user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinva',
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

/**
 * Deletes the signed-in person's account.
 *
 * What survives is deliberate. Every attribution in the schema — task assignee,
 * comment author, document owner, activity actor — is `onDelete: SetNull`, so
 * the company keeps its work and its history; those records simply stop naming
 * a person. What goes is the account itself: the login, the sessions, and the
 * memberships that made it *this* person's work.
 *
 * The one thing this must never do is strand a company. An owner who is the
 * last owner of a company that still has staff in it is refused, because
 * deleting them would leave a business nobody can administer. If they are the
 * last person in the company altogether, the company goes with them — leaving
 * it behind would only create an unreachable orphan.
 */
authRouter.post(
  '/account/delete',
  authLimiter,
  requireAuth,
  validateBody(
    z.object({
      password: z.string().optional(),
      confirmEmail: z.string().trim().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as { password?: string; confirmEmail?: string };

    if (isPlatformAdmin(auth.email)) {
      throw ApiError.forbidden(
        'The platform administrator account cannot be deleted.',
        'PLATFORM_ADMIN_PROTECTED',
      );
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE', deactivatedAt: null },
          include: { company: { select: { id: true, name: true } } },
        },
      },
    });

    // Prove it is really them. A password account re-enters its password; a
    // Google account has none, so it types its own address instead.
    if (user.passwordHash) {
      if (!input.password || !(await verifyPassword(input.password, user.passwordHash))) {
        throw ApiError.badRequest('That password is not correct.', 'INVALID_CREDENTIALS');
      }
    } else if (input.confirmEmail?.trim().toLowerCase() !== user.email) {
      throw ApiError.badRequest(
        'Type your email address exactly to confirm.',
        'CONFIRMATION_REQUIRED',
      );
    }

    // Companies this person would leave without an owner.
    const companiesToDelete: string[] = [];
    const blocking: string[] = [];

    for (const membership of user.memberships) {
      if (membership.role !== 'OWNER') continue;

      const [otherOwners, otherMembers] = await Promise.all([
        prisma.membership.count({
          where: {
            companyId: membership.companyId,
            role: 'OWNER',
            status: 'ACTIVE',
            deactivatedAt: null,
            id: { not: membership.id },
          },
        }),
        prisma.membership.count({
          where: {
            companyId: membership.companyId,
            status: 'ACTIVE',
            deactivatedAt: null,
            id: { not: membership.id },
          },
        }),
      ]);

      if (otherOwners > 0) continue;
      if (otherMembers > 0) blocking.push(membership.company.name);
      else companiesToDelete.push(membership.companyId);
    }

    if (blocking.length > 0) {
      throw ApiError.conflict(
        `You are the only owner of ${blocking.join(' and ')}. Make someone else an owner first, ` +
          'or your company would be left with nobody who can administer it.',
        'LAST_OWNER',
      );
    }

    // Told before the delete, while the membership still exists to be excluded
    // from the fan-out. Companies about to be deleted are skipped — there is
    // nobody left in them to tell.
    for (const membership of user.memberships) {
      if (companiesToDelete.includes(membership.companyId)) continue;
      await notifyLeadership({
        companyId: membership.companyId,
        except: [membership.id],
        type: 'MEMBER_LEFT',
        title: `${user.fullName} left`,
        body: 'They deleted their Atlas account.',
      });
    }

    await prisma.$transaction(async (tx) => {
      // Deleting the company cascades everything inside it. Do this first so
      // the user's memberships are already gone by the time the user goes.
      for (const companyId of companiesToDelete) {
        await tx.company.delete({ where: { id: companyId } });
      }
      // Permanently reserve the address before removing the account, so nobody
      // can recreate a different account with this email later.
      await tx.deletedEmail.upsert({
        where: { email: user.email },
        update: { deletedAt: new Date() },
        create: { email: user.email },
      });
      // Cascades memberships and refresh tokens; SetNull elsewhere.
      await tx.user.delete({ where: { id: user.id } });
    });

    clearAuthCookies(res);
    clearGoogleCookies(res);
    res.json({ ok: true, companiesDeleted: companiesToDelete.length });
  }),
);

authRouter.patch(
  '/password',
  requireAuth,
  validateBody(
    z.object({
      // Optional: a Google-only account is setting its first password, and has
      // no current one to prove. It is already authenticated by its session.
      currentPassword: z.string().optional(),
      newPassword: password,
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as { currentPassword?: string; newPassword: string };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });

    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw ApiError.badRequest('Enter your current password.', 'MISSING_CREDENTIALS');
      }
      if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
        throw ApiError.badRequest('Your current password is not correct.', 'INVALID_CREDENTIALS');
      }
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
