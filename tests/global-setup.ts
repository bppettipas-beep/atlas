import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../scripts/embedded-postgres';
import { TEST_DATABASE_URL, TEST_PG_DIR, TEST_PG_PORT, USING_EXTERNAL_DB } from './config';

/**
 * Boots a throwaway PostgreSQL for the test suite and applies the schema.
 *
 * Set TEST_DATABASE_URL to run against your own database instead — useful if
 * you want to inspect what the tests left behind. Otherwise this starts the
 * embedded PostgreSQL on its own port and its own data directory, so it can
 * never touch your development data.
 */
let instance: EmbeddedPostgres | null = null;

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed:\n${output}`)),
    );
  });
}

export async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  if (!USING_EXTERNAL_DB) {
    // A leftover directory from a crashed run would fail to open.
    fs.rmSync(TEST_PG_DIR, { recursive: true, force: true });
    instance = await startEmbeddedPostgres({ port: TEST_PG_PORT, dataDir: TEST_PG_DIR });
  }

  // Plain `db push` on purpose — no `--force-reset`. The embedded database is
  // created empty on every run, so a reset would add nothing, and if somebody
  // points TEST_DATABASE_URL at a database of their own it must not be wiped.
  await run('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
  });
}

export async function teardown() {
  await instance?.stop().catch(() => undefined);
  instance = null;
  if (!USING_EXTERNAL_DB) {
    fs.rmSync(TEST_PG_DIR, { recursive: true, force: true });
  }
}
