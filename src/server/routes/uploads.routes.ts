import { Router } from 'express';
import { asyncHandler, ApiError } from '../http/errors';
import { upload } from '../lib/uploads';
import { attachmentUrl } from '../services/serializers';
import { currentAuth, requireAuth } from '../middleware/authenticate';

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth);

/**
 * Generic single-file upload used for avatars and company logos. Task
 * attachments have their own endpoint because they need a task to belong to.
 */
uploadsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    currentAuth(req);
    const file = req.file;
    if (!file) throw ApiError.badRequest('Choose a file to upload.', 'NO_FILE');
    res.status(201).json({
      url: attachmentUrl(file.filename),
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }),
);
