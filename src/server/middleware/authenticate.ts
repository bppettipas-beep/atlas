import type { NextFunction, Request, Response } from 'express';
import type { CompanyRole } from '@prisma/client';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../auth/cookies';
import {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from '../auth/tokens';
import { ApiError } from '../http/errors';
import { prisma } from '../prisma';

export interface AuthContext {
  userId: string;
  membershipId: string;
  companyId: string;
  role: CompanyRole;
  fullName: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function currentAuth(req: Request): AuthContext {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth;
}

async function contextFromMembership(membershipId: string): Promise<AuthContext | null> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  if (!membership || membership.status !== 'ACTIVE' || membership.deactivatedAt) return null;
  return {
    userId: membership.userId,
    membershipId: membership.id,
    companyId: membership.companyId,
    role: membership.role,
    fullName: membership.user.fullName,
    email: membership.user.email,
  };
}

/**
 * Reads the access-token cookie. If it has expired but a valid refresh token is
 * present, the pair is silently rotated so the user is never bounced to the
 * sign-in screen mid-session.
 */
async function resolveAuth(req: Request, res: Response): Promise<AuthContext | null> {
  const accessToken = req.cookies?.[ACCESS_COOKIE];
  if (typeof accessToken === 'string' && accessToken.length > 0) {
    const claims = verifyAccessToken(accessToken);
    if (claims) {
      const context = await contextFromMembership(claims.mid);
      if (context) return context;
    }
  }

  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    clearAuthCookies(res);
    return null;
  }

  // Pick the membership the previous access token pointed at when possible,
  // otherwise fall back to the user's first active membership.
  const previousClaims =
    typeof accessToken === 'string'
      ? // The token may be expired, so decode without verifying the expiry.
        verifyAccessToken(accessToken)
      : null;

  const membership = previousClaims
    ? await prisma.membership.findFirst({
        where: { id: previousClaims.mid, userId: stored.userId, status: 'ACTIVE' },
      })
    : await prisma.membership.findFirst({
        where: { userId: stored.userId, status: 'ACTIVE', deactivatedAt: null },
        orderBy: { createdAt: 'asc' },
      });

  const fallback =
    membership ??
    (await prisma.membership.findFirst({
      where: { userId: stored.userId, status: 'ACTIVE', deactivatedAt: null },
      orderBy: { createdAt: 'asc' },
    }));

  if (!fallback) return null;

  const context = await contextFromMembership(fallback.id);
  if (!context) return null;

  // Rotate: revoke the presented refresh token and issue a fresh pair. The
  // conditional update is essential: two concurrent requests carrying a stolen
  // token must not both mint successor sessions after they have passed the
  // lookup above. Exactly one request wins this compare-and-set.
  const next = createRefreshToken();
  const expiresAt = refreshTokenExpiry();
  const rotated = await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (revoked.count !== 1) return false;

    await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: next.tokenHash,
        expiresAt,
        userAgent: req.get('user-agent') ?? null,
        ipAddress: req.ip ?? null,
      },
    });
    return true;
  });

  if (!rotated) {
    clearAuthCookies(res);
    return null;
  }

  setAuthCookies(
    res,
    signAccessToken({
      sub: context.userId,
      mid: context.membershipId,
      cid: context.companyId,
      role: context.role,
    }),
    next.token,
    expiresAt,
  );

  return context;
}

/** Populates `req.auth` when signed in; never rejects. */
export async function attachAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const context = await resolveAuth(req, res);
    if (context) req.auth = context;
    next();
  } catch (error) {
    next(error);
  }
}

/** Rejects the request when there is no signed-in membership. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(ApiError.unauthorized());
    return;
  }
  next();
}

export function requireRole(...roles: CompanyRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    // Co-owners inherit every route guarded for an owner. Keeping that rule at
    // the boundary means new owner-only routes cannot accidentally leave them
    // with a lesser implementation of the same authority.
    const allowed =
      roles.includes(req.auth.role) || (req.auth.role === 'CO_OWNER' && roles.includes('OWNER'));
    if (!allowed) {
      next(
        ApiError.forbidden(
          roles.includes('MANAGER')
            ? 'Only owners and managers can do that.'
            : 'Only the company owner can do that.',
        ),
      );
      return;
    }
    next();
  };
}
