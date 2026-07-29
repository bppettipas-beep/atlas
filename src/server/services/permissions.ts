import { prisma } from '../prisma';
import type { AuthContext } from '../middleware/authenticate';
import { canAccessMembership, canAccessTask, PERMISSIONS } from './authorization';

/**
 * Every rule here runs on the server. The React app hides buttons a user
 * cannot use, but that is only a courtesy — the API is the actual boundary.
 */

export const isOwner = (auth: AuthContext) =>
  auth.permissionKeys.includes(PERMISSIONS.COMPANY_MANAGE);
export const isLeadership = (auth: AuthContext) =>
  [
    PERMISSIONS.ACTIVITY_VIEW,
    PERMISSIONS.PEOPLE_MANAGE,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.SCHEDULE_MANAGE,
    PERMISSIONS.KNOWLEDGE_MANAGE,
  ].some((permission) => auth.permissionKeys.includes(permission));

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
  return canAccessMembership(auth, PERMISSIONS.PEOPLE_MANAGE, targetId);
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
  return canAccessTask(auth, PERMISSIONS.TASKS_MANAGE, task);
}

/** Can the caller at least read this task? */
export async function canViewTask(
  auth: AuthContext,
  task: { assigneeId: string | null; createdById: string | null; teamId: string | null },
): Promise<boolean> {
  return canAccessTask(auth, PERMISSIONS.TASKS_VIEW, task);
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
