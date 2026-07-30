import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { sendContactEmails } from '../services/email';

export const contactRouter = Router();

contactRouter.post(
  '/',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
  validateBody(
    z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().toLowerCase(),
      subject: z.string().trim().min(3).max(160),
      message: z.string().trim().min(10).max(5000),
      website: z.string().max(0).optional(), // honeypot
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!env.emailEnabled || !env.SUPPORT_EMAIL) {
      throw new ApiError(503, 'CONTACT_UNAVAILABLE', 'Contact email is not configured yet.');
    }
    const delivered = await sendContactEmails(req.body);
    if (!delivered) {
      throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'We could not send that message right now.');
    }
    res.json({ ok: true });
  }),
);
