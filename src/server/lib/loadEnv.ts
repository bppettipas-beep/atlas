import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal `.env` loader.
 *
 * Atlas deliberately avoids a dotenv dependency: this is a dozen lines, it
 * never overrides variables the platform already set (Railway injects
 * DATABASE_URL and PORT itself), and it is easy to read.
 */
export function loadEnvFile(file = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
