import http from 'node:http';
import { createApp } from './app';
import { env } from './env';
import { prisma } from './prisma';
import { closeRealtime, initRealtime } from './realtime/io';
import { startScheduler, stopScheduler } from './services/scheduler';

async function main() {
  // Fail fast with a readable message instead of a stack trace on every query.
  try {
    await prisma.$connect();
  } catch (error) {
    console.error(
      '\nAtlas could not connect to PostgreSQL.\n' +
        'Check that DATABASE_URL in your .env points at a running database.\n' +
        `Details: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  startScheduler();

  server.listen(env.PORT, () => {
    console.log('');
    console.log(`  Atlas API  →  http://localhost:${env.PORT}`);
    console.log(`  Health       →  http://localhost:${env.PORT}/api/health`);
    console.log(`  Environment  →  ${env.NODE_ENV}`);
    if (!env.isProduction) {
      console.log(`  React app    →  ${env.APP_ORIGIN}  (npm run dev:client)`);
    }
    console.log('');
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[atlas] ${signal} received — shutting down.`);
    stopScheduler();
    await closeRealtime();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
