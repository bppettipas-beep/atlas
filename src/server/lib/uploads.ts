import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../env';
import { ApiError } from '../http/errors';

/**
 * Never preserve an upload's user-provided extension. Express static derives
 * the response Content-Type from the stored filename, so preserving `.html`
 * would let a client claim an allowed MIME type and still publish active HTML
 * from the Atlas origin. The server chooses a non-executable extension instead.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

export function ensureUploadDir() {
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }
}

const ALLOWED_MIME = new Set([
  ...Object.keys(EXTENSION_BY_MIME),
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const extension = EXTENSION_BY_MIME[file.mimetype];
    // fileFilter runs first, but keep this defensive fallback so a future
    // change cannot accidentally restore an attacker-controlled extension.
    if (!extension) {
      cb(ApiError.badRequest('That file type is not allowed.', 'UNSUPPORTED_FILE_TYPE'), '');
      return;
    }
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(16).toString('hex')}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(
        ApiError.badRequest(
          `Files of type "${file.mimetype}" are not allowed. Upload an image, PDF or document.`,
          'UNSUPPORTED_FILE_TYPE',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

export function deleteUploadedFile(storageKey: string) {
  const target = path.join(env.uploadDir, path.basename(storageKey));
  fs.promises.unlink(target).catch(() => {
    /* the file may already be gone — nothing to do */
  });
}
