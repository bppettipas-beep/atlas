import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './http/errors';
import { currentAuth } from './middleware/authenticate';

/** The sole platform administrator. This is intentionally not a company role. */
export const PLATFORM_ADMIN_EMAIL = 'bppettipas@gmail.com';

export function isPlatformAdmin(email: string): boolean {
  return email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}

/** Server-side boundary for Atlas-wide administration. */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  const auth = currentAuth(req);
  if (!isPlatformAdmin(auth.email)) {
    next(ApiError.forbidden('This area is restricted to the Atlas platform administrator.'));
    return;
  }
  next();
}
