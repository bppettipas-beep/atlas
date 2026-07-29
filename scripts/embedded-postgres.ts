/**
 * Embedded PostgreSQL for local development and tests.
 *
 * Atlas uses real PostgreSQL as its source of truth. Installing Postgres (or
 * Docker) just to try the app locally is a lot of friction, so this script
 * boots PGlite — a genuine PostgreSQL build compiled to WebAssembly — and
 * exposes it on a TCP port using the normal Postgres wire protocol. Prisma
 * connects to it exactly as it would to a "real" server.
 *
 * Usage:
 *   npm run dev:db                      # port 5555, data in ./.pgdata
 *   tsx scripts/embedded-postgres.ts --port 5556 --dir ./.pgdata-test
 *
 * For production you should always use a managed PostgreSQL (e.g. the Railway
 * Postgres plugin) and point DATABASE_URL at it instead.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export interface EmbeddedPostgres {
  /** Connection string to hand to Prisma. */
  url: string;
  stop: () => Promise<void>;
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1]) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : undefined;
}

export async function startEmbeddedPostgres(options: {
  port?: number;
  dataDir?: string;
  host?: string;
}): Promise<EmbeddedPostgres> {
  const port = options.port ?? 5555;
  const host = options.host ?? '127.0.0.1';
  const dataDir = options.dataDir ?? './.pgdata';

  let db: PGlite;
  try {
    db = await PGlite.create({ dataDir });
  } catch (error) {
    // The usual cause is a data directory left behind by a hard kill.
    throw new Error(
      `Could not open the embedded database at ${dataDir}.\n` +
        `This normally means it was shut down uncleanly. Delete the folder and start again:\n` +
        `  rm -rf ${dataDir}    (PowerShell: Remove-Item -Recurse -Force ${dataDir})\n` +
        `Then re-run: npm run dev:db && npm run db:push && npm run db:seed\n\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const server = new PGLiteSocketServer({ db, port, host });

  // A client that disappears mid-query (you stop `npm run dev` with Ctrl-C,
  // or your editor restarts the server) makes the bridge emit an error. Without
  // a listener Node treats it as fatal and the database goes down with the app,
  // which is a miserable way to spend an afternoon. Log it and carry on.
  server.addEventListener('error', (event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    console.warn('[embedded-postgres] client connection error (ignored):', detail);
  });
  process.on('uncaughtException', (error) => {
    console.warn('[embedded-postgres] recovered from:', error.message);
  });

  await server.start();

  // PGlite serves a single database called `postgres` and accepts any
  // credentials. Two query parameters matter:
  //   connection_limit=1 — the socket bridge handles one client at a time, so
  //     Prisma must not open a pool.
  //   pgbouncer=true     — tells Prisma to skip named prepared statements. The
  //     bridge does not persist them, and without this every query after the
  //     first fails with `prepared statement "s0" already exists`.
  const url = `postgresql://postgres:postgres@${host}:${port}/postgres?connection_limit=1&pool_timeout=30&pgbouncer=true`;

  return {
    url,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const port = Number(readFlag(argv, 'port') ?? process.env.EMBEDDED_PG_PORT ?? 5555);
  const dataDir = readFlag(argv, 'dir') ?? process.env.EMBEDDED_PG_DIR ?? './.pgdata';

  const instance = await startEmbeddedPostgres({ port, dataDir });

  console.log('');
  console.log('  Embedded PostgreSQL is running.');
  console.log(`  Data directory : ${dataDir}`);
  console.log(`  DATABASE_URL   : ${instance.url}`);
  console.log('');
  console.log('  Leave this running, then in another terminal:');
  console.log('    npm run db:push && npm run db:seed && npm run dev');
  console.log('');

  const shutdown = async () => {
    console.log('\n  Stopping embedded PostgreSQL...');
    await instance.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Only run the CLI when this file is the entry point. `require.main` is not
// available when the module is imported from ESM (the test runner), so the
// check is made against argv instead.
const invokedDirectly = (process.argv[1] ?? '').includes('embedded-postgres');
if (invokedDirectly) {
  main().catch((error) => {
    console.error('Failed to start embedded PostgreSQL:', error);
    process.exit(1);
  });
}
