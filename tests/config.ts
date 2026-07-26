import path from 'node:path';

/**
 * The test database. Deterministic on purpose: the global setup and the test
 * workers are separate processes, so both need to be able to compute the same
 * connection string without passing anything between them.
 */
export const TEST_PG_PORT = 5556;
export const TEST_PG_DIR = path.resolve(process.cwd(), '.pgdata-test');

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://postgres:postgres@127.0.0.1:${TEST_PG_PORT}/postgres?connection_limit=1&pool_timeout=30&pgbouncer=true`;

/** True when the developer pointed the suite at their own PostgreSQL. */
export const USING_EXTERNAL_DB = Boolean(process.env.TEST_DATABASE_URL);
