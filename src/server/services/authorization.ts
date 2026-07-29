import { PermissionScope, Prisma, type MembershipStatus } from '@prisma/client';
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

export const PERMISSIONS = {
  COMPANY_MANAGE: 'company.manage',
  RANKS_MANAGE: 'ranks.manage',
  PEOPLE_VIEW: 'people.view',
  PEOPLE_MANAGE: 'people.manage',
  INVITES_MANAGE: 'invites.manage',
  ORGANIZATION_MANAGE: 'organization.manage',
  TASKS_VIEW: 'tasks.view',
  TASKS_CREATE: 'tasks.create',
  TASKS_MANAGE: 'tasks.manage',
  TASKS_DELETE: 'tasks.delete',
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_MANAGE: 'schedule.manage',
  AVAILABILITY_MANAGE: 'availability.manage',
  KNOWLEDGE_VIEW: 'knowledge.view',
  KNOWLEDGE_MANAGE: 'knowledge.manage',
  ACTIVITY_VIEW: 'activity.view',
  METRICS_VIEW: 'metrics.view',
  CHAT_USE: 'chat.use',
  CHAT_COMPANY_READ: 'chat.company.read',
  CHAT_COMPANY_POST: 'chat.company.post',
  ATLASY_USE: 'atlasy.use',
  ATLASY_BRIEFING: 'atlasy.briefing',
} as const;
export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

type RankPreset = {
  key: SystemRankKey;
  name: string;
  position: number;
  protected: boolean;
};

export const SYSTEM_RANK_PRESETS: readonly RankPreset[] = [
  { key: 'owner', name: 'Owner', position: 1, protected: true },
  { key: 'co_owner', name: 'Co-owner', position: 2, protected: true },
  { key: 'administrator', name: 'Administrator', position: 3, protected: true },
  { key: 'manager', name: 'Manager', position: 4, protected: false },
  { key: 'supervisor', name: 'Supervisor', position: 5, protected: false },
  { key: 'team_lead', name: 'Team Lead', position: 6, protected: false },
  { key: 'worker', name: 'Worker', position: 7, protected: false },
  { key: 'contractor', name: 'Contractor', position: 8, protected: false },
  { key: 'guest', name: 'Guest', position: 9, protected: false },
] as const;

const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);
const LEADERSHIP_PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.PEOPLE_VIEW, PERMISSIONS.PEOPLE_MANAGE, PERMISSIONS.INVITES_MANAGE,
  PERMISSIONS.ORGANIZATION_MANAGE, PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_CREATE,
  PERMISSIONS.TASKS_MANAGE, PERMISSIONS.TASKS_DELETE, PERMISSIONS.SCHEDULE_VIEW,
  PERMISSIONS.SCHEDULE_MANAGE, PERMISSIONS.AVAILABILITY_MANAGE, PERMISSIONS.KNOWLEDGE_VIEW,
  PERMISSIONS.KNOWLEDGE_MANAGE, PERMISSIONS.ACTIVITY_VIEW, PERMISSIONS.METRICS_VIEW,
  PERMISSIONS.CHAT_USE, PERMISSIONS.CHAT_COMPANY_READ, PERMISSIONS.CHAT_COMPANY_POST,
  PERMISSIONS.ATLASY_USE, PERMISSIONS.ATLASY_BRIEFING,
];
const WORKER_PERMISSION_KEYS: PermissionKey[] = [
  PERMISSIONS.PEOPLE_VIEW, PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_MANAGE,
  PERMISSIONS.SCHEDULE_VIEW, PERMISSIONS.CHAT_USE, PERMISSIONS.CHAT_COMPANY_READ,
  PERMISSIONS.CHAT_COMPANY_POST, PERMISSIONS.ATLASY_USE,
];

function defaultPermissionKeys(rank: SystemRankKey): readonly PermissionKey[] {
  if (rank === 'owner' || rank === 'co_owner' || rank === 'administrator') return ALL_PERMISSION_KEYS;
  if (rank === 'manager') return LEADERSHIP_PERMISSION_KEYS;
  if (rank === 'supervisor' || rank === 'team_lead') {
    const excluded: readonly PermissionKey[] = [
      PERMISSIONS.INVITES_MANAGE, PERMISSIONS.RANKS_MANAGE, PERMISSIONS.COMPANY_MANAGE,
    ];
    return LEADERSHIP_PERMISSION_KEYS.filter((key) => !excluded.includes(key));
  }
  return WORKER_PERMISSION_KEYS;
}

function defaultScope(rank: SystemRankKey, permissionKey: PermissionKey): PermissionScope {
  if (rank === 'owner' || rank === 'co_owner' || rank === 'administrator') {
    return PermissionScope.COMPANY_WIDE;
  }
  if (rank === 'manager') return PermissionScope.COMPANY_WIDE;
  if (rank === 'supervisor' || rank === 'team_lead') return PermissionScope.TEAM;
  if (permissionKey === PERMISSIONS.CHAT_USE || permissionKey.startsWith('chat.')) return PermissionScope.COMPANY_WIDE;
  return PermissionScope.OWN;
}

/** Creates the complete authority baseline for a newly-created company. */
export async function createCompanyRanks(tx: Prisma.TransactionClient, companyId: string) {
  const ranks = new Map<SystemRankKey, { id: string }>();
  for (const preset of SYSTEM_RANK_PRESETS) {
    const rank = await tx.rank.create({
      data: {
        companyId,
        key: preset.key,
        name: preset.name,
        position: preset.position,
        isSystem: true,
        isProtected: preset.protected,
      },
      select: { id: true },
    });
    ranks.set(preset.key, rank);
    await tx.rankPermission.createMany({
      data: defaultPermissionKeys(preset.key).map((permissionKey) => ({
        rankId: rank.id,
        permissionKey,
        scope: defaultScope(preset.key, permissionKey),
      })),
    });
  }
  return ranks;
}

export async function rankIdForLegacyRole(
  tx: Prisma.TransactionClient,
  companyId: string,
  role: 'OWNER' | 'CO_OWNER' | 'MANAGER' | 'WORKER',
) {
  const key = { OWNER: 'owner', CO_OWNER: 'co_owner', MANAGER: 'manager', WORKER: 'worker' }[role];
  const rank = await tx.rank.findUnique({ where: { companyId_key: { companyId, key } }, select: { id: true } });
  if (!rank) throw new Error(`Company ${companyId} is missing its ${key} rank`);
  return rank.id;
}

type Grant = { key: string; scope: PermissionScope; selectedTeamIds: string[] };
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
  }).then((permissions) => permissions.map((permission) => ({
    key: permission.permissionKey,
    scope: permission.scope,
    selectedTeamIds: permission.selectedTeamIds,
  })));
}

export async function requirePermission(actor: Actor, permissionKey: string) {
  const grants = await hasPermission(actor, permissionKey);
  if (grants.length === 0) {
    throw ApiError.forbidden(
      'Your rank does not have permission to do that. Ask one of the owners and managers.',
      'PERMISSION_DENIED',
    );
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
  if (grants.some((grant) => grant.scope === PermissionScope.TEAM)) {
    const actorTeams = await prisma.teamMembership.findMany({
      where: { membershipId: actor.membershipId },
      select: { teamId: true },
    });
    const teamIds = new Set(actorTeams.map((membership) => membership.teamId));
    return target.teamMemberships.some((membership) => teamIds.has(membership.teamId));
  }
  const selectedTeamIds = new Set(
    grants
      .filter((grant) => grant.scope === PermissionScope.SELECTED_TEAMS)
      .flatMap((grant) => grant.selectedTeamIds),
  );
  if (selectedTeamIds.size) {
    return target.teamMemberships.some((membership) => selectedTeamIds.has(membership.teamId));
  }
  return false;
}

export async function canAccessTask(
  actor: Actor,
  permissionKey: string,
  task: { assigneeId: string | null; createdById: string | null; teamId: string | null },
): Promise<boolean> {
  const grants = await hasPermission(actor, permissionKey);
  if (!grants.length) return false;
  if (grants.some((grant) => grant.scope === PermissionScope.COMPANY_WIDE)) return true;
  if (
    grants.some((grant) => grant.scope === PermissionScope.OWN || grant.scope === PermissionScope.ASSIGNED) &&
    (task.assigneeId === actor.membershipId || task.createdById === actor.membershipId)
  ) return true;
  if (
    task.assigneeId &&
    grants.some((grant) => grant.scope === PermissionScope.MANAGED_PEOPLE) &&
    await canAccessMembership(actor, permissionKey, task.assigneeId)
  ) return true;
  if (!task.teamId) return false;
  if (grants.some((grant) => grant.scope === PermissionScope.TEAM)) {
    const membership = await prisma.teamMembership.findFirst({
      where: { membershipId: actor.membershipId, teamId: task.teamId },
      select: { id: true },
    });
    if (membership) return true;
  }
  return grants.some(
    (grant) => grant.scope === PermissionScope.SELECTED_TEAMS && grant.selectedTeamIds.includes(task.teamId!),
  );
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
