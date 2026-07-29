import { Router } from 'express';
import { PermissionScope } from '@prisma/client';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { prisma } from '../prisma';
import {
  canManageMember,
  PERMISSIONS,
  SYSTEM_RANKS,
  writePermissionAudit,
} from '../services/authorization';
import { emitToCompany } from '../realtime/io';

export const ranksRouter = Router();
ranksRouter.use(requireAuth);

const scopeSchema = z.nativeEnum(PermissionScope);
const permissionSchema = z.object({
  key: z.string().trim().min(1).max(100),
  scope: scopeSchema,
  selectedTeamIds: z.array(z.string().min(1)).default([]),
});

async function listRanks(companyId: string) {
  return prisma.rank.findMany({
    where: { companyId },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      permissions: { orderBy: [{ permissionKey: 'asc' }, { scope: 'asc' }] },
      _count: { select: { memberships: true } },
    },
  });
}

ranksRouter.get('/', requirePermission(PERMISSIONS.RANKS_MANAGE), asyncHandler(async (req, res) => {
  const auth = currentAuth(req);
  res.json({
    items: await listRanks(auth.companyId),
    catalog: Object.values(PERMISSIONS),
    scopes: Object.values(PermissionScope),
  });
}));

ranksRouter.post(
  '/',
  requirePermission(PERMISSIONS.RANKS_MANAGE),
  validateBody(z.object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(400).nullable().optional(),
  })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as { name: string; description?: string | null };
    const last = await prisma.rank.findFirst({
      where: { companyId: auth.companyId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const key = `custom_${crypto.randomUUID().replaceAll('-', '')}`;
    const rank = await prisma.rank.create({
      data: {
        companyId: auth.companyId,
        key,
        name: input.name,
        description: input.description ?? null,
        position: (last?.position ?? 0) + 1,
        createdById: auth.membershipId,
        updatedById: auth.membershipId,
      },
    });
    await writePermissionAudit({
      companyId: auth.companyId, actorId: auth.membershipId, affectedRankId: rank.id,
      action: 'RANK_CREATED', nextValue: { key, name: rank.name },
    });
    emitToCompany(auth.companyId, 'ranks:updated', {});
    res.status(201).json(rank);
  }),
);

ranksRouter.patch(
  '/:id/details',
  requirePermission(PERMISSIONS.RANKS_MANAGE),
  validateBody(z.object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(400).nullable().optional(),
  }).refine((input) => input.name !== undefined || input.description !== undefined, {
    message: 'Give at least one rank field to update.',
  })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const rank = await prisma.rank.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!rank) throw ApiError.notFound('That rank does not exist.', 'RANK_NOT_FOUND');
    if (rank.position <= auth.rankPosition) {
      throw ApiError.forbidden('You cannot edit a rank at or above your own.', 'RANK_HIERARCHY');
    }
    const input = req.body as { name?: string; description?: string | null };
    const updated = await prisma.rank.update({
      where: { id: rank.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        updatedById: auth.membershipId,
      },
    });
    await writePermissionAudit({
      companyId: auth.companyId,
      actorId: auth.membershipId,
      affectedRankId: rank.id,
      action: 'RANK_UPDATED',
      previousValue: { name: rank.name, description: rank.description },
      nextValue: { name: updated.name, description: updated.description },
    });
    emitToCompany(auth.companyId, 'ranks:updated', {});
    res.json(updated);
  }),
);

ranksRouter.put(
  '/:id/permissions',
  requirePermission(PERMISSIONS.RANKS_MANAGE),
  validateBody(z.object({ permissions: z.array(permissionSchema).max(200) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const rank = await prisma.rank.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
      include: { permissions: true },
    });
    if (!rank) throw ApiError.notFound('That rank does not exist.', 'RANK_NOT_FOUND');
    if (rank.key === 'owner') {
      throw ApiError.forbidden('Owner permissions cannot be reduced.', 'PROTECTED_RANK');
    }
    if (rank.position <= auth.rankPosition) {
      throw ApiError.forbidden('You cannot edit a rank at or above your own.', 'RANK_HIERARCHY');
    }
    const input = req.body as { permissions: z.infer<typeof permissionSchema>[] };
    const known = new Set(Object.values(PERMISSIONS));
    if (input.permissions.some((permission) => !known.has(permission.key as never))) {
      throw ApiError.badRequest('One or more permission keys are not supported.', 'UNKNOWN_PERMISSION');
    }
    const identities = input.permissions.map((permission) => `${permission.key}:${permission.scope}`);
    if (new Set(identities).size !== identities.length) {
      throw ApiError.badRequest('A permission scope can only be granted once per rank.', 'DUPLICATE_PERMISSION');
    }
    const selectedIds = [...new Set(input.permissions.flatMap((permission) => permission.selectedTeamIds))];
    if (selectedIds.length) {
      const count = await prisma.team.count({ where: { id: { in: selectedIds }, companyId: auth.companyId } });
      if (count !== selectedIds.length) {
        throw ApiError.badRequest('One or more selected teams do not belong to this company.', 'INVALID_TEAM_SCOPE');
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.rankPermission.deleteMany({ where: { rankId: rank.id } });
      if (input.permissions.length) {
        await tx.rankPermission.createMany({
          data: input.permissions.map((permission) => ({
            rankId: rank.id,
            permissionKey: permission.key,
            scope: permission.scope,
            selectedTeamIds: permission.scope === 'SELECTED_TEAMS' ? permission.selectedTeamIds : [],
          })),
        });
      }
      await tx.permissionAuditLog.create({
        data: {
          companyId: auth.companyId, actorId: auth.membershipId, affectedRankId: rank.id,
          action: 'RANK_PERMISSIONS_REPLACED',
          previousValue: rank.permissions,
          nextValue: input.permissions,
        },
      });
    });
    emitToCompany(auth.companyId, 'ranks:updated', {});
    res.json({ items: await listRanks(auth.companyId) });
  }),
);

ranksRouter.patch(
  '/members/:membershipId',
  requirePermission(PERMISSIONS.RANKS_MANAGE),
  validateBody(z.object({ rankId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const target = await prisma.membership.findFirst({
      where: { id: req.params.membershipId, companyId: auth.companyId },
      include: { rank: true },
    });
    const nextRank = await prisma.rank.findFirst({ where: { id: req.body.rankId, companyId: auth.companyId } });
    if (!target || !nextRank) throw ApiError.notFound('That person or rank does not exist.', 'RANK_NOT_FOUND');
    if (!(await canManageMember(auth, target.id))) {
      throw ApiError.forbidden('You cannot change that person’s rank.', 'RANK_HIERARCHY');
    }
    if (nextRank.position <= auth.rankPosition) {
      throw ApiError.forbidden('You cannot assign a rank at or above your own.', 'RANK_HIERARCHY');
    }
    const legacyRole =
      nextRank.key === 'owner'
        ? 'OWNER'
        : nextRank.key === 'co_owner'
          ? 'CO_OWNER'
          : ['administrator', 'manager', 'supervisor', 'team_lead'].includes(nextRank.key)
            ? 'MANAGER'
            : 'WORKER';
    await prisma.$transaction([
      prisma.membership.update({
        where: { id: target.id },
        data: { rankId: nextRank.id, role: legacyRole },
      }),
      prisma.permissionAuditLog.create({
        data: {
          companyId: auth.companyId, actorId: auth.membershipId, affectedMembershipId: target.id,
          affectedRankId: nextRank.id, action: 'MEMBER_RANK_CHANGED',
          previousValue: { rankId: target.rankId, rankKey: target.rank.key },
          nextValue: { rankId: nextRank.id, rankKey: nextRank.key },
        },
      }),
    ]);
    emitToCompany(auth.companyId, 'people:updated', {});
    emitToCompany(auth.companyId, 'ranks:updated', {});
    res.json({ ok: true });
  }),
);

ranksRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.RANKS_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const rank = await prisma.rank.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!rank) throw ApiError.notFound('That rank does not exist.', 'RANK_NOT_FOUND');
    if (rank.isSystem || SYSTEM_RANKS.includes(rank.key as never)) {
      throw ApiError.forbidden('System ranks cannot be deleted.', 'PROTECTED_RANK');
    }
    if (rank._count.memberships) {
      throw ApiError.conflict('Move everyone out of this rank before deleting it.', 'RANK_IN_USE');
    }
    await prisma.rank.delete({ where: { id: rank.id } });
    await writePermissionAudit({
      companyId: auth.companyId, actorId: auth.membershipId,
      action: 'RANK_DELETED', previousValue: { id: rank.id, key: rank.key, name: rank.name },
    });
    emitToCompany(auth.companyId, 'ranks:updated', {});
    res.json({ ok: true });
  }),
);
