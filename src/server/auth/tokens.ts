import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../env';

export interface AccessTokenClaims {
  sub: string; // user id
  mid: string; // membership id
  cid: string; // company id
  sid: string; // revocable refresh-session id
  role: 'OWNER' | 'CO_OWNER' | 'MANAGER' | 'WORKER';
}

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'atlas',
  };
  return jwt.sign(claims, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'atlas' });
    if (typeof payload === 'string') return null;
    const { sub, mid, cid, sid, role } = payload as Record<string, unknown>;
    if (
      typeof sub !== 'string' ||
      typeof mid !== 'string' ||
      typeof cid !== 'string' ||
      typeof sid !== 'string'
    ) return null;
    if (role !== 'OWNER' && role !== 'CO_OWNER' && role !== 'MANAGER' && role !== 'WORKER')
      return null;
    return { sub, mid, cid, sid, role };
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are opaque random strings. Only an HMAC of the token is stored
 * so a database leak cannot be replayed against the API.
 */
export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
