/**
 * Google sign-in, implemented against Google's OAuth 2.0 endpoints directly.
 *
 * There is no SDK here on purpose: the authorization-code flow is three HTTP
 * calls and a signature, and a dependency that ships its own HTTP client and
 * token cache would be far more code than the thing it replaces.
 *
 * Google never gives us a password. It vouches for the person instead, so an
 * account created this way has `passwordHash = null` until the owner chooses to
 * set one. What Google does give us is the profile the user already maintains —
 * verified email address, display name and photo — which is what makes signing
 * up one click instead of a form.
 */
import crypto from 'node:crypto';
import { env } from '../env';
import { ApiError } from '../http/errors';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** What the caller wanted to do before we sent them to Google. */
export type GoogleIntent = 'signin' | 'signup' | 'join';

export interface GoogleProfile {
  /** Google's stable subject identifier. */
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface GoogleState {
  intent: GoogleIntent;
  /** Invitation code, carried through the round trip for the join flow. */
  inviteCode?: string;
  nonce: string;
}

/** Where Google sends the browser back. Must match the console entry exactly. */
export function googleRedirectUri(): string {
  return `${env.APP_ORIGIN.replace(/\/+$/, '')}/api/auth/google/callback`;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

/**
 * Packs state into a tamper-evident string.
 *
 * The signature matters: `state` survives a round trip through the user's
 * browser, and without it somebody could change `intent=join` into
 * `intent=signup`, or swap in an invitation code that was never issued to them.
 */
export function encodeState(state: GoogleState): string {
  const body = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeState(raw: string): GoogleState {
  const [body, signature] = raw.split('.');
  if (!body || !signature) throw ApiError.badRequest('Malformed sign-in state.', 'BAD_STATE');

  // Constant-time compare so a wrong signature cannot be guessed byte by byte.
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw ApiError.badRequest('That sign-in link is not valid.', 'BAD_STATE');
  }

  return JSON.parse(Buffer.from(body, 'base64url').toString()) as GoogleState;
}

export function buildAuthorizationUrl(state: GoogleState): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: encodeState(state),
    // Ask for the account chooser every time. Silently reusing whichever Google
    // account the browser happens to be signed into is a genuinely bad surprise
    // on a shared or work machine.
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  picture?: string;
  aud?: string;
  iss?: string;
  exp?: number;
}

/**
 * Reads the claims out of an ID token.
 *
 * The signature is deliberately not re-verified. This token did not come from
 * the browser — it came straight back from Google's token endpoint over TLS, in
 * exchange for our client secret, which is exactly the case where Google's own
 * documentation says verification adds nothing. The checks that *do* matter
 * here are the ones below: audience, issuer and expiry.
 */
function readIdToken(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw ApiError.badRequest('Google returned a token we could not read.', 'GOOGLE_BAD_TOKEN');
  }

  let claims: GoogleIdTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as GoogleIdTokenClaims;
  } catch {
    throw ApiError.badRequest('Google returned a token we could not read.', 'GOOGLE_BAD_TOKEN');
  }

  if (claims.aud !== env.GOOGLE_CLIENT_ID) {
    throw ApiError.badRequest('That Google token was issued for a different app.', 'GOOGLE_BAD_AUD');
  }
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') {
    throw ApiError.badRequest('That token did not come from Google.', 'GOOGLE_BAD_ISS');
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) {
    throw ApiError.badRequest('That Google sign-in expired. Please try again.', 'GOOGLE_EXPIRED');
  }

  return claims;
}

/** Trades the one-time code from the callback for the user's profile. */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('[atlas] Google token exchange failed:', response.status, detail);
    throw ApiError.badRequest(
      'Google could not complete that sign-in. Please try again.',
      'GOOGLE_EXCHANGE_FAILED',
    );
  }

  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) {
    throw ApiError.badRequest('Google did not return an identity token.', 'GOOGLE_NO_ID_TOKEN');
  }

  const claims = readIdToken(payload.id_token);

  // An unverified address must never be trusted: anyone can put somebody
  // else's address on an unverified account, and matching on it would hand
  // them that person's Atlas membership.
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (!claims.email || !verified) {
    throw ApiError.badRequest(
      'That Google account does not have a verified email address.',
      'GOOGLE_UNVERIFIED_EMAIL',
    );
  }

  return {
    googleId: claims.sub,
    email: claims.email.toLowerCase(),
    fullName: claims.name?.trim() || claims.given_name?.trim() || claims.email.split('@')[0],
    // Google's default size is tiny; ask for something that survives a retina
    // avatar without us having to store the image ourselves.
    avatarUrl: claims.picture ? claims.picture.replace(/=s\d+-c$/, '=s256-c') : null,
  };
}

// ------------------------- pending sign-up grant ----------------------------

/**
 * A signed, short-lived record of "Google confirmed this person" for somebody
 * who does not have an Atlas account yet.
 *
 * A brand-new Google user still has to say which company they are — create one,
 * or redeem an invitation code. Rather than invent a half-authenticated session
 * for that gap, we hand the browser this grant, prefill the form with the
 * profile, and let the normal sign-up endpoints redeem it in place of a
 * password. Sessions therefore keep their existing invariant: every session
 * belongs to a membership.
 */
const GRANT_TTL_MS = 15 * 60 * 1000;

export interface GoogleGrant extends GoogleProfile {
  exp: number;
}

export function encodeGrant(profile: GoogleProfile): string {
  const grant: GoogleGrant = { ...profile, exp: Date.now() + GRANT_TTL_MS };
  const body = Buffer.from(JSON.stringify(grant)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeGrant(raw: string | undefined): GoogleGrant {
  if (!raw) {
    throw ApiError.badRequest(
      'That Google sign-in has expired. Please start again.',
      'GOOGLE_GRANT_MISSING',
    );
  }

  const [body, signature] = raw.split('.');
  if (!body || !signature) {
    throw ApiError.badRequest('That Google sign-in is not valid.', 'GOOGLE_GRANT_INVALID');
  }

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw ApiError.badRequest('That Google sign-in is not valid.', 'GOOGLE_GRANT_INVALID');
  }

  const grant = JSON.parse(Buffer.from(body, 'base64url').toString()) as GoogleGrant;
  if (grant.exp < Date.now()) {
    throw ApiError.badRequest(
      'That Google sign-in has expired. Please start again.',
      'GOOGLE_GRANT_EXPIRED',
    );
  }
  return grant;
}
