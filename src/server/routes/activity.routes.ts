import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/errors';
import { parsedQuery, validateQuery } from '../http/validate';
import { currentAuth, requireAuth, requireRole } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { isLeadership } from '../services/permissions';
import { activityInclude, serializeActivity } from '../services/serializers';
import { ACTIVITY_TYPES } from '../../shared/types';

export const activityRouter = Router();

activityRouter.use(requireAuth, requireRole('OWNER', 'MANAGER'));

const querySchema = z.object({
  type: z
    .union([z.enum(ACTIVITY_TYPES), z.array(z.enum(ACTIVITY_TYPES))])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : Array.isArray(value) ? value : [value],
    ),
  actorId: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

activityRouter.get(
  '/',
  validateQuery(querySchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<z.infer<typeof querySchema>>(res);

    const events = await prisma.activityEvent.findMany({
      where: {
        companyId: auth.companyId,
        // Manager-only events (escalations, deactivations…) stay hidden from
        // workers even if they craft the request by hand.
        ...(isLeadership(auth) ? {} : { visibility: 'COMPANY' }),
        ...(query.type ? { type: { in: query.type } } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.personId
          ? { OR: [{ actorId: query.personId }, { targetId: query.personId }] }
          : {}),
        ...(query.teamId ? { teamId: query.teamId } : {}),
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = events.length > query.limit;
    const page = hasMore ? events.slice(0, query.limit) : events;

    res.json({
      items: page.map(serializeActivity),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  }),
);
