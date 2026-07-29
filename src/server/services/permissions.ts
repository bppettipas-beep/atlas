import { prisma } from '../prisma';
import type { AuthContext } from '../middleware/authenticate';

/**
 * Every rule here runs on the server. The React app hides buttons a user
 * cannot use, but that is only a courtesy — the API is the actual boundary.
 */

export const isOwner = (auth: AuthContext) =>
  auth.rankKey === 'owner' || auth.rankKey === 'co_owner';
export const isLeadership = (auth: AuthContext) =>
  ['owner', 'co_owner', 'administrator', 'manager'].includes(auth.rankKey);

/** Teams the manager leads or belongs to. */
export async function managedTeamIds(auth: AuthContext): Promise<string[]> {
  if (isOwner(auth)) {
    const teams = await prisma.team.findMany({
      where: { companyId: auth.companyId, archivedAt: null },
      select: { id: true },
    });
    return teams.map((team) => team.id);
  }
  const teams = await prisma.team.findMany({
    where: {
      companyId: auth.companyId,
      archivedAt: null,
      OR: [
        { leadId: auth.membershipId },
        { members: { some: { membershipId: auth.membershipId } } },
      ],
    },
    select: { id: true },
  });
  return teams.map((team) => team.id);
}

/** Membership ids a manager is responsible for (reports + team members). */
export async function managedMembershipIds(auth: AuthContext): Promise<string[]> {
  if (isOwner(auth)) {
    const all = await prisma.membership.findMany({
      where: { companyId: auth.companyId, deactivatedAt: null },
      select: { id: true },
    });
    return all.map((m) => m.id);
  }
  if (auth.rankKey !== 'manager') return [auth.membershipId];

  const teamIds = await managedTeamIds(auth);
  const members = await prisma.membership.findMany({
    where: {
      companyId: auth.companyId,
      deactivatedAt: null,
      OR: [
        { id: auth.membershipId },
        { managerId: auth.membershipId },
        { teamMemberships: { some: { teamId: { in: teamIds } } } },
      ],
    },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

/** Can the caller edit this person's full profile (role, manager, notes…)? */
export async function canManagePerson(auth: AuthContext, targetId: string): Promise<boolean> {
  if (isOwner(auth)) return true;
  if (auth.rankKey !== 'manager') return false;
  if (targetId === auth.membershipId) return true;
  const managed = await managedMembershipIds(auth);
  return managed.includes(targetId);
}

/** Can the caller see manager-only notes and manager-only activity? */
export function canViewPrivateNotes(auth: AuthContext): boolean {
  return isLeadership(auth);
}

/** Can the caller change this task (title, due date, assignee…)? */
export async function canEditTask(
  auth: AuthContext,
  task: { assigneeId: string | null; createdById: string | null; teamId: string | null },
): Promise<boolean> {
  if (isOwner(auth)) return true;
  if (auth.rankKey === 'manager') {
    if (!task.teamId) return true;
    const teamIds = await managedTeamIds(auth);
    return teamIds.includes(task.teamId);
  }
  // Workers may only change tasks that are theirs.
  return task.assigneeId === auth.membershipId || task.createdById === auth.membershipId;
}

/** Can the caller at least read this task? */
export async function canViewTask(
  auth: AuthContext,
  task: { assigneeId: string | null; createdById: string | null; teamId: string | null },
): Promise<boolean> {
  if (isLeadership(auth)) return true;
  if (task.assigneeId === auth.membershipId || task.createdById === auth.membershipId) return true;
  if (!task.teamId) return false;
  const membership = await prisma.teamMembership.findFirst({
    where: { teamId: task.teamId, membershipId: auth.membershipId },
    select: { id: true },
  });
  return Boolean(membership);
}

export function canManageKnowledge(auth: AuthContext): boolean {
  return isLeadership(auth);
}

export function canManageInvites(auth: AuthContext): boolean {
  return isLeadership(auth);
}

export function canManageCompany(auth: AuthContext): boolean {
  return isOwner(auth);
}
