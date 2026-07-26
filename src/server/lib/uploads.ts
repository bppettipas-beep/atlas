import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../env';
import { ApiError } from '../http/errors';
import { randomFileKey } from './ids';

export function ensureUploadDir() {
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, randomFileKey(file.originalname));
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
