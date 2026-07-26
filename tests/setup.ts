import { TEST_DATABASE_URL } from './config';

/**
 * Runs inside each test worker, before any application module is imported.
 * `src/server/env.ts` validates the environment the moment it is loaded, so
 * everything it needs has to be in place by the time this file finishes.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-jwt-secret-not-used-anywhere-real-0123456789';
process.env.SESSION_SECRET = 'test-session-secret-not-used-anywhere-real-9876543210';
process.env.COOKIE_SECURE = 'false';
process.env.SCHEDULER_INTERVAL_SECONDS = '0';
process.env.UPLOAD_DIR = './.uploads-test';
process.env.APP_ORIGIN = 'http://localhost:5173';
