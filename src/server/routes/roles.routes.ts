/**
 * Company roles — named positions with a colour and a hierarchy.
 *
 * Reading is open to anybody in the company: a worker should be able to see
 * that the person they are messaging is the Dispatcher. Writing is owners and
 * managers only, enforced here rather than merely hidden in the interface.
 */
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requirePermission } from '../middleware/authenticate';
import { PERMISSIONS } from '../services/authorization';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { broadcastOrganizationChange } from '../services/organization';
import type { RoleDto } from '../../shared/types';

export const rolesRouter = Router();

/** Hex, three or six digits. Anything else would break the colour swatches. */
const color = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour like #1f6feb');

const roleBodySchema = z.object({
  name: z.string().trim().min(1, 'Give the role a name').max(60),
  color: color.optional(),
  description: z.string().trim().max(400).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  isDefault: z.boolean().optional(),
});

interface RoleRow {
  id: string;
  name: string;
  color: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isDefault: boolean;
  _count: { memberships: number };
}

function serialize(role: RoleRow): RoleDto {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    description: role.description,
    parentId: role.parentId,
    sortOrder: role.sortOrder,
    isDefault: role.isDefault,
    memberCount: role._count.memberships,
  };
}

async function listRoles(companyId: string): Promise<RoleDto[]> {
  const roles = await prisma.role.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { memberships: true } } },
  });
  return roles.map(serialize);
}

/**
 * Rejects a parent that would create a loop.
 *
 * Without this a role could be made its own ancestor, and every renderer that
 * walks the tree — the settings page, the assignment picker — would recurse
 * until the tab dies.
 */
async function assertNoCycle(companyId: string, roleId: string, parentId: string | null) {
  if (!parentId) return;
  if (parentId === roleId) {
    throw ApiError.badRequest('A role cannot report into itself.', 'ROLE_CYCLE');
  }

  const roles = await prisma.role.findMany({
    where: { companyId },
    select: { id: true, parentId: true },
  });
  const parents = new Map(roles.map((role) => [role.id, role.parentId]));

  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === roleId) {
      throw ApiError.badRequest(
        'That would put the role underneath one of its own descendants.',
        'ROLE_CYCLE',
      );
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = parents.get(cursor) ?? null;
  }
}

async function loadRole(id: string, companyId: string) {
  const role = await prisma.role.findFirst({ where: { id, companyId } });
  if (!role) throw ApiError.notFound('That role does not exist.', 'ROLE_NOT_FOUND');
  return role;
}

// -------------------------------- read --------------------------------------

rolesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    res.json({ items: await listRoles(auth.companyId) });
  }),
);

// -------------------------------- write -------------------------------------

rolesRouter.post(
  '/',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(roleBodySchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof roleBodySchema>;

    if (input.parentId) {
      await loadRole(input.parentId, auth.companyId);
    }

    const taken = await prisma.role.findFirst({
      where: { companyId: auth.companyId, name: input.name },
    });
    if (taken) {
      throw ApiError.conflict('A role with that name already exists.', 'ROLE_NAME_TAKEN');
    }

    const siblings = await prisma.role.count({
      where: { companyId: auth.companyId, parentId: input.parentId ?? null },
    });

    const role = await prisma.$transaction(async (tx) => {
      // Only one default per company, so making this one default clears the rest.
      if (input.isDefault) {
        await tx.role.updateMany({
          where: { companyId: auth.companyId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.role.create({
        data: {
          companyId: auth.companyId,
          name: input.name,
          color: input.color ?? '#121211',
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          sortOrder: siblings,
          isDefault: input.isDefault ?? false,
        },
        include: { _count: { select: { memberships: true } } },
      });
    });

    emitToCompany(auth.companyId, 'roles:updated', {});
    res.status(201).json(serialize(role));
  }),
);

rolesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(roleBodySchema.partial()),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await loadRole(req.params.id, auth.companyId);
    const input = req.body as Partial<z.infer<typeof roleBodySchema>>;

    if (input.parentId !== undefined) {
      if (input.parentId) await loadRole(input.parentId, auth.companyId);
      await assertNoCycle(auth.companyId, existing.id, input.parentId);
    }

    if (input.name && input.name !== existing.name) {
      const taken = await prisma.role.findFirst({
        where: { companyId: auth.companyId, name: input.name, id: { not: existing.id } },
      });
      if (taken) {
        throw ApiError.conflict('A role with that name already exists.', 'ROLE_NAME_TAKEN');
      }
    }

    const role = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.role.updateMany({
          where: { companyId: auth.companyId, isDefault: true, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }
      return tx.role.update({
        where: { id: existing.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.color === undefined ? {} : { color: input.color }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
          ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        },
        include: { _count: { select: { memberships: true } } },
      });
    });

    emitToCompany(auth.companyId, 'roles:updated', {});
    emitToCompany(auth.companyId, 'people:updated', {});
    broadcastOrganizationChange(auth.companyId);
    res.json(serialize(role));
  }),
);

/**
 * Reorders siblings. The client sends the ids in their new order, which is far
 * less fragile than sending one index and hoping the rest still agree.
 */
rolesRouter.patch(
  '/reorder/siblings',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(z.object({ ids: z.array(z.string().min(1)).min(1) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const { ids } = req.body as { ids: string[] };

    const owned = await prisma.role.findMany({
      where: { id: { in: ids }, companyId: auth.companyId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      throw ApiError.badRequest('Those roles are not all yours to reorder.', 'ROLE_NOT_FOUND');
    }

    await prisma.$transaction(
      ids.map((id, index) => prisma.role.update({ where: { id }, data: { sortOrder: index } })),
    );

    emitToCompany(auth.companyId, 'roles:updated', {});
    res.json({ items: await listRoles(auth.companyId) });
  }),
);

rolesRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const role = await loadRole(req.params.id, auth.companyId);

    await prisma.$transaction(async (tx) => {
      // Children move up to take the deleted role's place rather than being
      // orphaned at the top of the chart, which is what the database default
      // would otherwise do.
      await tx.role.updateMany({
        where: { companyId: auth.companyId, parentId: role.id },
        data: { parentId: role.parentId },
      });
      // Anybody holding it simply has no role again. Their membership, their
      // work and their history are untouched.
      await tx.membership.updateMany({ where: { roleId: role.id }, data: { roleId: null } });
      await tx.role.delete({ where: { id: role.id } });
    });

    emitToCompany(auth.companyId, 'roles:updated', {});
    emitToCompany(auth.companyId, 'people:updated', {});
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);
