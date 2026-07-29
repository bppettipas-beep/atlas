import { PermissionScope, type MembershipStatus } from '@prisma/client';
import { ApiError } from '../http/errors';
import { prisma } from '../prisma';

/** Stable identifiers. Display names are never authorization inputs. */
export const SYSTEM_RANKS = [
  'owner',
  'co_owner',
  'administrator',
  'manager',
  'supervisor',
  'team_lead',
  'worker',
  'contractor',
  'guest',
] as const;
export type SystemRankKey = (typeof SYSTEM_RANKS)[number];

export const PROTECTED_RANKS = new Set<SystemRankKey>(['owner', 'co_owner', 'administrator']);

type Grant = { key: string; scope: PermissionScope };
type Actor = { membershipId: string; companyId: string; rankId: string; status: MembershipStatus };

/**
 * The effective authorization boundary. Routes should call this service rather
 * than comparing a rank name or trusting a scope supplied by a browser.
 */
export async function hasPermission(actor: Actor, permissionKey: string): Promise<Grant[]> {
  if (actor.status !== 'ACTIVE') return [];
  return prisma.rankPermission.findMany({
    where: { rankId: actor.rankId, permissionKey },
    select: { permissionKey: true, scope: true, selectedTeamIds: true },
  }).then((permissions) => permissions.map((permission) => ({ key: permission.permissionKey, scope: permission.scope })));
}

export async function requirePermission(actor: Actor, permissionKey: string) {
  const grants = await hasPermission(actor, permissionKey);
  if (grants.length === 0) {
    throw ApiError.forbidden('Your rank does not have permission to do that.', 'PERMISSION_DENIED');
  }
  return grants;
}

/** Resolves scope against database relationships; callers never supply ids. */
export async function canAccessMembership(
  actor: Actor,
  permissionKey: string,
  targetMembershipId: string,
): Promise<boolean> {
  const grants = await hasPermission(actor, permissionKey);
  if (!grants.length) return false;
  if (grants.some((grant) => grant.scope === PermissionScope.COMPANY_WIDE)) return true;
  if (grants.some((grant) => grant.scope === PermissionScope.OWN) && actor.membershipId === targetMembershipId) return true;

  const target = await prisma.membership.findFirst({
    where: { id: targetMembershipId, companyId: actor.companyId },
    select: { managerId: true, teamMemberships: { select: { teamId: true } } },
  });
  if (!target) return false;
  if (grants.some((grant) => grant.scope === PermissionScope.MANAGED_PEOPLE) && target.managerId === actor.membershipId) return true;
  if (grants.some((grant) => grant.scope === PermissionScope.TEAM || grant.scope === PermissionScope.SELECTED_TEAMS)) {
    const actorTeams = await prisma.teamMembership.findMany({
      where: { membershipId: actor.membershipId },
      select: { teamId: true },
    });
    const teamIds = new Set(actorTeams.map((membership) => membership.teamId));
    return target.teamMemberships.some((membership) => teamIds.has(membership.teamId));
  }
  return false;
}

export async function canManageMember(actor: Actor, targetMembershipId: string): Promise<boolean> {
  const actorRank = await prisma.rank.findFirst({
    where: { id: actor.rankId, companyId: actor.companyId },
    select: { position: true, key: true },
  });
  const target = await prisma.membership.findFirst({
    where: { id: targetMembershipId, companyId: actor.companyId },
    include: { rank: { select: { position: true, key: true } } },
  });
  if (!actorRank || !target?.rank || actor.membershipId === targetMembershipId) return false;
  if (actorRank.key !== 'owner' && target.rank.key === 'owner') return false;
  return actorRank.position < target.rank.position;
}

export async function writePermissionAudit(input: {
  companyId: string;
  actorId?: string;
  affectedMembershipId?: string;
  affectedRankId?: string;
  action: string;
  previousValue?: object;
  nextValue?: object;
  requestId?: string;
}) {
  return prisma.permissionAuditLog.create({ data: input });
}
