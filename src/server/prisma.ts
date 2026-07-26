import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  var __atlasPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__atlasPrisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Reuse the client across `tsx watch` reloads so we do not exhaust connections.
if (!env.isProduction) {
  global.__atlasPrisma = prisma;
}
