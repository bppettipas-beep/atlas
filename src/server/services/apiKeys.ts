import crypto from 'node:crypto';
import { prisma } from '../prisma';

export function hashApiKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createApiKeySecret(): { token: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(32).toString('base64url');
  const token = `atlas_live_${random}`;
  return {
    token,
    hash: hashApiKey(token),
    prefix: token.slice(0, 18),
  };
}

export async function resolveApiKey(token: string) {
  if (!token.startsWith('atlas_live_')) return null;
  const key = await prisma.apiKey.findUnique({
    where: { tokenHash: hashApiKey(token) },
    select: {
      id: true,
      companyId: true,
      membershipId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) {
    return null;
  }
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
