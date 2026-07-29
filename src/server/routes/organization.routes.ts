import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { parsedQuery, validateBody, validateQuery } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { PERMISSIONS } from '../services/authorization';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify } from '../services/notifications';
import { broadcastOrganizationChange, buildOrganizationGraph } from '../services/organization';
import { isOwner, managedTeamIds } from '../services/permissions';
import { serializeTeam } from '../services/serializers';

export const organizationRouter = Router();

organizationRouter.use(requireAuth, requirePermission(PERMISSIONS.PEOPLE_VIEW));

// --------------------------------- graph -----------------------------------

const graphQuerySchema = z.object({
  teamId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
});

organizationRouter.get(
  '/graph',
  validateQuery(graphQuerySchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const filters = parsedQuery<z.infer<typeof graphQuerySchema>>(res);
    res.json(await buildOrganizationGraph(auth.companyId, filters));
  }),
);

/**
 * Persists a dragged layout. Only owners and managers may rearrange the map —
 * workers get a read-only view, enforced here rather than only in the UI.
 */
organizationRouter.patch(
  '/nodes/positions',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(
    z.object({
      positions: z
        .array(
          z.object({
            id: z.string().min(1),
            x: z.number().finite(),
            y: z.number().finite(),
            pinned: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(500),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { positions } = req.body as {
      positions: { id: string; x: number; y: number; pinned?: boolean }[];
    };

    const owned = await prisma.organizationNode.findMany({
      where: { companyId: auth.companyId, id: { in: positions.map((p) => p.id) } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((node) => node.id));

    await prisma.$transaction(
      positions
        .filter((position) => ownedIds.has(position.id))
        .map((position) =>
          prisma.organizationNode.update({
            where: { id: position.id },
            data: {
              x: position.x,
              y: position.y,
              ...(position.pinned === undefined ? {} : { pinned: position.pinned }),
            },
          }),
        ),
    );

    // Other people looking at the map should see the new layout immediately.
    emitToCompany(auth.companyId, 'organization:layout', { by: auth.membershipId });
    res.json({ ok: true, updated: ownedIds.size });
  }),
);

organizationRouter.post(
  '/relationships',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(
    z.object({
      sourceNodeId: z.string().min(1),
      targetNodeId: z.string().min(1),
      type: z.enum(['COLLABORATES_WITH', 'MENTORS', 'OWNS_AREA']),
      label: z.string().trim().max(80).optional().or(z.literal('')),
      strength: z.coerce.number().int().min(1).max(5).default(1),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as {
      sourceNodeId: string;
      targetNodeId: string;
      type: 'COLLABORATES_WITH' | 'MENTORS' | 'OWNS_AREA';
      label?: string;
      strength: number;
    };

    if (input.sourceNodeId === input.targetNodeId) {
      throw ApiError.badRequest('Pick two different nodes to connect.');
    }

    const nodes = await prisma.organizationNode.findMany({
      where: { companyId: auth.companyId, id: { in: [input.sourceNodeId, input.targetNodeId] } },
    });
    if (nodes.length !== 2) throw ApiError.badRequest('One of those nodes is not in your company.');

    const relationship = await prisma.organizationRelationship.upsert({
      where: {
        sourceNodeId_targetNodeId_type: {
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          type: input.type,
        },
      },
      update: { label: input.label || null, strength: input.strength },
      create: {
        companyId: auth.companyId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        type: input.type,
        label: input.label || null,
        strength: input.strength,
      },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'RELATIONSHIP_CHANGED',
      summary: `${auth.fullName} connected two people on the organization map`,
      actorId: auth.membershipId,
      metadata: { type: input.type },
    });

    broadcastOrganizationChange(auth.companyId);
    res.status(201).json({ id: relationship.id });
  }),
);

organizationRouter.delete(
  '/relationships/:id',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const relationship = await prisma.organizationRelationship.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!relationship) {
      throw ApiError.notFound(
        'That connection is generated automatically from your data, so it cannot be deleted here.',
        'DERIVED_RELATIONSHIP',
      );
    }
    await prisma.organizationRelationship.delete({ where: { id: relationship.id } });
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);

// --------------------------------- teams -----------------------------------

organizationRouter.get(
  '/teams',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const teams = await prisma.team.findMany({
      where: { companyId: auth.companyId, archivedAt: null },
      include: {
        _count: { select: { members: true } },
        members: {
          include: {
            membership: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: teams.map(serializeTeam) });
  }),
);

const teamSchema = z.object({
  name: z.string().trim().min(2, 'Give the team a name').max(60),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1f6feb')
    .nullable()
    .optional(),
  leadId: z.string().min(1).nullable().optional(),
});

organizationRouter.post(
  '/teams',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(teamSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof teamSchema>;

    if (input.leadId) {
      const lead = await prisma.membership.findFirst({
        where: { id: input.leadId, companyId: auth.companyId, deactivatedAt: null },
      });
      if (!lead) throw ApiError.badRequest('That team lead is not in your company.');
    }

    const existing = await prisma.team.findFirst({
      where: { companyId: auth.companyId, name: input.name },
    });
    if (existing) throw ApiError.conflict('A team with that name already exists.');

    const team = await prisma.team.create({
      data: {
        companyId: auth.companyId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? '#1f6feb',
        leadId: input.leadId ?? null,
      },
      include: { _count: { select: { members: true } } },
    });

    if (input.leadId) {
      await prisma.teamMembership.create({
        data: { teamId: team.id, membershipId: input.leadId, roleInTeam: 'Lead' },
      });
    }

    await recordActivity({
      companyId: auth.companyId,
      type: 'TEAM_CREATED',
      summary: `${auth.fullName} created the ${team.name} team`,
      actorId: auth.membershipId,
      teamId: team.id,
    });

    broadcastOrganizationChange(auth.companyId);
    res.status(201).json(serializeTeam(team));
  }),
);

async function assertCanManageTeam(auth: ReturnType<typeof currentAuth>, teamId: string) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, companyId: auth.companyId, archivedAt: null },
  });
  if (!team) throw ApiError.notFound('That team no longer exists.');
  if (isOwner(auth)) return team;
  const teamIds = await managedTeamIds(auth);
  if (!teamIds.includes(team.id)) {
    throw ApiError.forbidden('You can only manage teams you lead or belong to.');
  }
  return team;
}

organizationRouter.patch(
  '/teams/:id',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(teamSchema.partial()),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const team = await assertCanManageTeam(auth, req.params.id);

    const updated = await prisma.team.update({
      where: { id: team.id },
      data: req.body as Record<string, unknown>,
      include: { _count: { select: { members: true } } },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TEAM_UPDATED',
      summary: `${auth.fullName} updated the ${updated.name} team`,
      actorId: auth.membershipId,
      teamId: updated.id,
    });

    broadcastOrganizationChange(auth.companyId);
    res.json(serializeTeam(updated));
  }),
);

organizationRouter.delete(
  '/teams/:id',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const team = await assertCanManageTeam(auth, req.params.id);
    // Archived rather than deleted: tasks and documents keep their history.
    await prisma.team.update({ where: { id: team.id }, data: { archivedAt: new Date() } });
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);

organizationRouter.post(
  '/teams/:id/members',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(
    z.object({
      membershipId: z.string().min(1),
      roleInTeam: z.string().trim().max(60).optional().or(z.literal('')),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const team = await assertCanManageTeam(auth, req.params.id);
    const input = req.body as { membershipId: string; roleInTeam?: string };

    const person = await prisma.membership.findFirst({
      where: { id: input.membershipId, companyId: auth.companyId, deactivatedAt: null },
      include: { user: { select: { fullName: true } } },
    });
    if (!person) throw ApiError.badRequest('That person is not in your company.');

    await prisma.teamMembership.upsert({
      where: { teamId_membershipId: { teamId: team.id, membershipId: person.id } },
      update: { roleInTeam: input.roleInTeam || null },
      create: { teamId: team.id, membershipId: person.id, roleInTeam: input.roleInTeam || null },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TEAM_MEMBER_ADDED',
      summary: `${person.user.fullName} was added to ${team.name}`,
      actorId: auth.membershipId,
      targetId: person.id,
      teamId: team.id,
    });

    await notify({
      companyId: auth.companyId,
      recipientId: person.id,
      actorId: auth.membershipId,
      type: 'TEAM_ADDED',
      title: `You joined the ${team.name} team`,
      body: 'Open the organization map to see who you are working with.',
      entityType: 'team',
      entityId: team.id,
    });

    broadcastOrganizationChange(auth.companyId);
    emitToCompany(auth.companyId, 'people:updated', {});
    res.status(201).json({ ok: true });
  }),
);

organizationRouter.delete(
  '/teams/:id/members/:membershipId',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const team = await assertCanManageTeam(auth, req.params.id);

    const person = await prisma.membership.findFirst({
      where: { id: req.params.membershipId, companyId: auth.companyId },
      include: { user: { select: { fullName: true } } },
    });
    if (!person) throw ApiError.notFound('That person is not in your company.');

    await prisma.teamMembership.deleteMany({
      where: { teamId: team.id, membershipId: person.id },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'TEAM_MEMBER_REMOVED',
      summary: `${person.user.fullName} was removed from ${team.name}`,
      actorId: auth.membershipId,
      targetId: person.id,
      teamId: team.id,
    });

    broadcastOrganizationChange(auth.companyId);
    emitToCompany(auth.companyId, 'people:updated', {});
    res.json({ ok: true });
  }),
);
