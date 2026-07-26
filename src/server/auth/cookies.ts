import type { CookieOptions, Response } from 'express';
import { env } from '../env';

export const ACCESS_COOKIE = 'atlas_access';
export const REFRESH_COOKIE = 'atlas_refresh';

/**
 * Cookies are HTTP-only so JavaScript (and therefore XSS) cannot read them.
 * `sameSite: 'lax'` is correct because in production the API and the React app
 * are served from the same Railway domain — no cross-site requests involved.
 */
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    // The access token is short-lived; give the cookie the refresh lifetime so
    // the browser keeps sending it and the API can transparently rotate it.
    expires: refreshExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    expires: refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
