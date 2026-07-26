/**
 * One-command local stack.
 *
 *   npm run dev:all           # start everything, keep existing data
 *   npm run dev:all -- --fresh  # wipe the database and re-seed the demo company
 *
 * Runs the embedded PostgreSQL, applies the Prisma schema, optionally seeds,
 * and then boots the Atlas API — all inside a single Node process.
 *
 * Why one process: the embedded database bridge serves one client connection at
 * a time, and a client that is killed abruptly can leave it wedged. Keeping the
 * database and the API in the same process means one Ctrl-C shuts both down
 * cleanly, which removes that whole class of "why can't it reach the database"
 * confusion. Use `npm run dev` with your own PostgreSQL when you outgrow it.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startEmbeddedPostgres } from './embedded-postgres';

const DATA_DIR = path.resolve(process.cwd(), '.pgdata');

/**
 * Runs a child process without blocking the event loop.
 *
 * This must be async: the embedded database is served from *this* process, so a
 * synchronous spawn would freeze the socket server and every child would fail
 * with "can't reach database server".
 */
function run(label: string, command: string, args: string[]): Promise<void> {
  process.stdout.write(`  ${label}… `);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      shell: process.platform === 'win32',
    });

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        console.log('done');
        resolve();
        return;
      }
      console.log('failed\n');
      console.error(output);
      reject(new Error(`${label} failed`));
    });
  });
}

async function main() {
  const fresh = process.argv.includes('--fresh');

  if (fresh && fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('  wiped the previous database');
  }

  const isNew = !fs.existsSync(DATA_DIR);

  console.log('\n  Starting Atlas locally\n');
  const pg = await startEmbeddedPostgres({ port: 5555, dataDir: DATA_DIR });
  process.env.DATABASE_URL = pg.url;
  console.log('  embedded postgres… done');

  await run('applying schema', 'npx', [
    'prisma',
    'db',
    'push',
    '--skip-generate',
    '--accept-data-loss',
  ]);
  if (fresh || isNew) await run('seeding demo data', 'npx', ['tsx', 'prisma/seed.ts']);

  process.env.PORT ??= '4000';
  process.env.NODE_ENV ??= 'development';

  const shutdown = async () => {
    console.log('\n  Shutting down…');
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  console.log('');
  await import('../src/server/index');
}

main().catch((error) => {
  console.error('\nCould not start the local stack:\n', error);
  process.exit(1);
});
