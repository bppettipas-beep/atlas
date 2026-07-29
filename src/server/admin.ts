import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './http/errors';
import { currentAuth } from './middleware/authenticate';
import { prisma } from './prisma';

/** Server-side boundary for Atlas-wide administration. */
export async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  const auth = currentAuth(req);
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { isPlatformAdmin: true },
  });
  if (!user?.isPlatformAdmin) {
    next(ApiError.forbidden('This area is restricted to the Atlas platform administrator.'));
    return;
  }
  next();
}
