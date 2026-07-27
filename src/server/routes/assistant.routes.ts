import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { runAssistant, type ChatMessage } from '../assistant';
import { env } from '../env';
import { asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';

export const assistantRouter = Router();

/** Tells the client whether to draw the Atlasy button at all. */
assistantRouter.get('/config', (_req, res) => {
  res.json({ enabled: env.assistantEnabled });
});

assistantRouter.use(requireAuth);

/**
 * Model calls cost the account holder money or quota, and a runaway loop in
 * the client would burn a free tier in minutes. This is per-IP and deliberately
 * tighter than the credential limiter.
 */
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Give Atlasy a moment — that is a lot of questions.' },
  },
});

assistantRouter.post(
  '/chat',
  assistantLimiter,
  validateBody(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(4000),
          }),
        )
        .min(1)
        // The panel keeps the whole thread; only the tail is worth sending.
        .max(40),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { messages } = req.body as { messages: { role: 'user' | 'assistant'; content: string }[] };

    // No provider configured. Answer in Atlasy's own voice rather than with a
    // red error box — from where the user is sitting, the assistant is simply
    // not available, and that is a sentence, not a fault.
    if (!env.assistantEnabled) {
      res.json({ reply: 'Atlasy is down right now, sorry.', actions: [] });
      return;
    }

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: auth.membershipId },
      include: { user: { select: { fullName: true } }, company: { select: { name: true } } },
    });

    const result = await runAssistant({
      history: messages as ChatMessage[],
      // Forwarded so every tool call is made as this person, and refused by the
      // same routes that would refuse them in the interface.
      cookie: req.headers.cookie ?? '',
      context: {
        fullName: membership.user.fullName,
        role: membership.role,
        companyName: membership.company.name,
      },
    });

    res.json(result);
  }),
);
