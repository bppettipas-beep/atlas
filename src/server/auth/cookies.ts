import type { CookieOptions, Response } from 'express';
import { env } from '../env';

export const ACCESS_COOKIE = 'atlas_access';
export const REFRESH_COOKIE = 'atlas_refresh';
/** Holds a completed Google sign-in for somebody who has no Atlas account yet. */
export const GOOGLE_GRANT_COOKIE = 'atlas_google_grant';
/** Guards the OAuth round trip against cross-site request forgery. */
export const GOOGLE_NONCE_COOKIE = 'atlas_google_nonce';

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

/**
 * The Google round-trip cookies.
 *
 * These use `sameSite: 'lax'` rather than 'strict' on purpose: the browser
 * arrives back at the callback from accounts.google.com, and a strict cookie
 * would not be sent on that navigation, breaking the flow it exists to protect.
 */
export function setGoogleNonceCookie(res: Response, nonce: string) {
  res.cookie(GOOGLE_NONCE_COOKIE, nonce, { ...baseOptions(), maxAge: 10 * 60 * 1000 });
}

export function setGoogleGrantCookie(res: Response, grant: string) {
  res.cookie(GOOGLE_GRANT_COOKIE, grant, { ...baseOptions(), maxAge: 15 * 60 * 1000 });
}

export function clearGoogleCookies(res: Response) {
  res.clearCookie(GOOGLE_NONCE_COOKIE, baseOptions());
  res.clearCookie(GOOGLE_GRANT_COOKIE, baseOptions());
}
