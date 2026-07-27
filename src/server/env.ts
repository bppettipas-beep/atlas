import path from 'node:path';
import { z } from 'zod';
import { loadEnvFile } from './lib/loadEnv';

loadEnvFile();

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see .env.example)'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: booleanish.default(false),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),
  // Attempts allowed per IP per 15 minutes on the credential endpoints. Raised
  // by the test suite, where every request arrives from the same address.
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(40),
  // Optional. Leaving these unset simply hides the "Continue with Google"
  // button — the app never shows a sign-in option it cannot honour.
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  // Atlasy, the in-app assistant. The key is the only thing that has to be
  // set; the defaults below point at Groq, which is free and fast and handles
  // the tool list well. Any OpenAI-compatible endpoint works if you override
  // them — Google AI Studio, OpenRouter, Cerebras.
  ASSISTANT_API_KEY: z.string().default(''),
  ASSISTANT_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  ASSISTANT_MODEL: z.string().default('llama-3.3-70b-versatile'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(
    `\nAtlas could not start — the environment is not configured correctly:\n\n${issues}\n\n` +
      `Copy .env.example to .env and fill in the missing values.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  cookieSecure: raw.COOKIE_SECURE || raw.NODE_ENV === 'production',
  uploadDir: path.resolve(process.cwd(), raw.UPLOAD_DIR),
  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
  googleEnabled: raw.GOOGLE_CLIENT_ID.length > 0 && raw.GOOGLE_CLIENT_SECRET.length > 0,
  assistantEnabled: raw.ASSISTANT_API_KEY.length > 0,
  allowedOrigins: Array.from(
    new Set(
      [raw.APP_ORIGIN, ...raw.CORS_ORIGINS.split(',')].map((value) => value.trim()).filter(Boolean),
    ),
  ),
};

export type Env = typeof env;
