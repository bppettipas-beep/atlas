import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/errors';
import { parsedQuery, validateBody, validateQuery } from '../http/validate';
import { currentAuth, requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { emitToMember } from '../realtime/io';
import { ensureNotificationPreference } from '../services/notifications';
import { serializeNotification } from '../services/serializers';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

interface PreferenceShape {
  taskAssigned: boolean;
  mentions: boolean;
  teamChanges: boolean;
  knowledgeUpdates: boolean;
  dueDateChanges: boolean;
  announcements: boolean;
  taskComments: boolean;
  companyActivity: boolean;
}

/** The switches, and only the switches — never the row id or membership id. */
function toPreferences(row: PreferenceShape): PreferenceShape {
  return {
    taskAssigned: row.taskAssigned,
    mentions: row.mentions,
    teamChanges: row.teamChanges,
    knowledgeUpdates: row.knowledgeUpdates,
    dueDateChanges: row.dueDateChanges,
    announcements: row.announcements,
    taskComments: row.taskComments,
    companyActivity: row.companyActivity,
  };
}

notificationsRouter.get(
  '/',
  validateQuery(
    z.object({
      unreadOnly: z.coerce.boolean().default(false),
      limit: z.coerce.number().int().min(1).max(100).default(40),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<{ unreadOnly: boolean; limit: number }>(res);

    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: {
          recipientId: auth.membershipId,
          ...(query.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      prisma.notification.count({ where: { recipientId: auth.membershipId, readAt: null } }),
    ]);

    res.json({ items: items.map(serializeNotification), unread });
  }),
);

notificationsRouter.post(
  '/read',
  validateBody(z.object({ ids: z.array(z.string().min(1)).max(200).optional() })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { ids } = req.body as { ids?: string[] };

    await prisma.notification.updateMany({
      where: {
        recipientId: auth.membershipId,
        readAt: null,
        ...(ids && ids.length ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    const unread = await prisma.notification.count({
      where: { recipientId: auth.membershipId, readAt: null },
    });
    emitToMember(auth.membershipId, 'notification:read', { unread });
    res.json({ ok: true, unread });
  }),
);

notificationsRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    await prisma.notification.deleteMany({
      where: { recipientId: auth.membershipId, readAt: { not: null } },
    });
    res.json({ ok: true });
  }),
);

notificationsRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const preference = await ensureNotificationPreference(auth.membershipId);
    res.json(toPreferences(preference));
  }),
);

notificationsRouter.patch(
  '/preferences',
  validateBody(
    z.object({
      taskAssigned: z.boolean().optional(),
      mentions: z.boolean().optional(),
      teamChanges: z.boolean().optional(),
      knowledgeUpdates: z.boolean().optional(),
      dueDateChanges: z.boolean().optional(),
      announcements: z.boolean().optional(),
      taskComments: z.boolean().optional(),
      companyActivity: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    await ensureNotificationPreference(auth.membershipId);
    const preference = await prisma.notificationPreference.update({
      where: { membershipId: auth.membershipId },
      data: req.body as Record<string, boolean>,
    });
    res.json(toPreferences(preference));
  }),
);
