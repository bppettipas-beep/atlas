/**
 * The Schedule — a time-based view of work that already exists.
 *
 * Nothing here owns any data. A "scheduled task" is just a Task with a
 * `startAt`, and every block on the Schedule is a projection of one. That is
 * deliberate: the moment scheduling gets its own records, the assignee on the
 * Schedule and the assignee on the task can disagree, and then somebody turns
 * up to the wrong job. Reassigning a task moves it between columns because
 * there is only one place the assignee is stored.
 *
 * Times are handled in the server's local zone, the same convention the rest of
 * the codebase uses (see lib/dates.ts). Working hours are stored as minutes
 * from midnight so they survive daylight saving without shifting.
 */
import { isOverdue } from '../lib/dates';
import { PermissionScope } from '@prisma/client';
import type { AuthContext } from '../middleware/authenticate';
import { prisma } from '../prisma';
import type {
  ScheduleAvailability,
  ScheduleBlock,
  ScheduleResource,
  ScheduleResponse,
  ScheduleWorkload,
  TaskPriority,
  TaskStatus,
} from '../../shared/types';
import { managedMembershipIds, managedTeamIds } from './permissions';
import { hasPermission, PERMISSIONS } from './authorization';

/** Assumed length of a block whose task only ever had a start time. */
export const DEFAULT_BLOCK_MINUTES = 60;
/** Columns shown before anybody picks their own — a big company is unreadable otherwise. */
const DEFAULT_RESOURCE_LIMIT = 8;
/** Widest window the API will build in one request. */
export const MAX_RANGE_DAYS = 45;

const MINUTE = 60_000;

export interface ScheduleScope {
  /** Memberships whose schedule the caller may read. */
  membershipIds: string[];
  /** Teams whose schedule the caller may read. */
  teamIds: string[];
  canScheduleOthers: boolean;
  canManageAvailability: boolean;
}

/**
 * Who this person is allowed to see and change.
 *
 * Owners get the company; managers get their reports and their teams; workers
 * get themselves plus the teams they are in. This is the single place those
 * three sentences are written down, and every schedule route goes through it.
 */
export async function scheduleScope(auth: AuthContext): Promise<ScheduleScope> {
  const [viewGrants, manageGrants, availabilityGrants] = await Promise.all([
    hasPermission(auth, PERMISSIONS.SCHEDULE_VIEW),
    hasPermission(auth, PERMISSIONS.SCHEDULE_MANAGE),
    hasPermission(auth, PERMISSIONS.AVAILABILITY_MANAGE),
  ]);
  const grants = [...viewGrants, ...manageGrants];
  const companyWide = grants.some((grant) => grant.scope === PermissionScope.COMPANY_WIDE);
  const selectedTeamIds = grants
    .filter((grant) => grant.scope === PermissionScope.SELECTED_TEAMS)
    .flatMap((grant) => grant.selectedTeamIds);
  const scopedTeamIds = grants.some((grant) => grant.scope === PermissionScope.TEAM)
    ? await managedTeamIds(auth)
    : [];
  const teamIds = [...new Set([...selectedTeamIds, ...scopedTeamIds])];
  let membershipIds: string[];
  if (companyWide) {
    membershipIds = (
      await prisma.membership.findMany({
        where: { companyId: auth.companyId, status: 'ACTIVE', deactivatedAt: null },
        select: { id: true },
      })
    ).map((membership) => membership.id);
  } else {
    const managed = grants.some((grant) => grant.scope === PermissionScope.MANAGED_PEOPLE)
      ? await managedMembershipIds(auth)
      : [];
    const teamMembers = teamIds.length
      ? await prisma.teamMembership.findMany({
          where: { teamId: { in: teamIds } },
          select: { membershipId: true },
        })
      : [];
    membershipIds = [
      ...new Set([
        auth.membershipId,
        ...managed,
        ...teamMembers.map((membership) => membership.membershipId),
      ]),
    ];
  }
  return {
    membershipIds,
    teamIds,
    canScheduleOthers: manageGrants.some((grant) => grant.scope !== PermissionScope.OWN),
    canManageAvailability: availabilityGrants.some((grant) => grant.scope !== PermissionScope.OWN),
  };
}

/** Whether a scheduled task is one this caller may see at all. */
function canSeeTask(
  scope: ScheduleScope,
  auth: AuthContext,
  task: { assigneeId: string | null; createdById: string | null; teamId: string | null },
): boolean {
  if (task.assigneeId && scope.membershipIds.includes(task.assigneeId)) return true;
  if (task.teamId && scope.teamIds.includes(task.teamId)) return true;
  if (task.createdById === auth.membershipId) return true;
  // Work nobody owns yet is a leadership concern; a worker has no reason to see
  // every unassigned job in the company on their own schedule.
  if (!task.assigneeId && !task.teamId) return scope.canScheduleOthers;
  return false;
}

function blockEnd(startAt: Date, endAt: Date | null): Date {
  if (endAt && endAt.getTime() > startAt.getTime()) return endAt;
  return new Date(startAt.getTime() + DEFAULT_BLOCK_MINUTES * MINUTE);
}

function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Minutes of two ranges that coincide. */
function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? Math.round((end - start) / MINUTE) : 0;
}

interface AvailabilityIndex {
  /** weekday -> working window, for one person. */
  hours: Map<number, { startMinute: number; endMinute: number }>;
  timeOff: { startAt: Date; endAt: Date }[];
  /** False when nobody has ever set this person's hours, so nothing is "outside". */
  hasHours: boolean;
}

/**
 * Is this block outside what we know of somebody's availability?
 *
 * A person with no working hours recorded is never "outside" them — an empty
 * table means unknown, not unavailable, and flagging everything would train
 * people to ignore the flag.
 */
function isOutsideAvailability(start: Date, end: Date, index: AvailabilityIndex | undefined) {
  if (!index) return false;
  if (index.timeOff.some((period) => overlaps(start, end, period.startAt, period.endAt))) {
    return true;
  }
  if (!index.hasHours) return false;

  const window = index.hours.get(start.getDay());
  if (!window) return true;
  const from = minutesFromMidnight(start);
  // A block ending exactly at midnight reads as minute 0 of the next day.
  const to = minutesFromMidnight(end) === 0 ? 24 * 60 : minutesFromMidnight(end);
  return from < window.startMinute || to > window.endMinute;
}

/** Working minutes a person has in the window, less any time off. */
function availableMinutesIn(from: Date, to: Date, index: AvailabilityIndex | undefined): number {
  if (!index || !index.hasHours) return 0;
  let total = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < to.getTime()) {
    const window = index.hours.get(cursor.getDay());
    if (window) {
      const dayStart = new Date(cursor);
      dayStart.setMinutes(window.startMinute);
      const dayEnd = new Date(cursor);
      dayEnd.setMinutes(window.endMinute);

      let minutes = overlapMinutes(from, to, dayStart, dayEnd);
      for (const period of index.timeOff) {
        minutes -= overlapMinutes(dayStart, dayEnd, period.startAt, period.endAt);
      }
      total += Math.max(minutes, 0);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

export interface ScheduleQuery {
  from: Date;
  to: Date;
  /** Membership and team ids to show as columns. Empty means "choose for me". */
  resourceIds?: string[];
  status?: TaskStatus[];
  priority?: TaskPriority[];
  location?: string;
}

export async function buildSchedule(
  auth: AuthContext,
  query: ScheduleQuery,
): Promise<ScheduleResponse> {
  const scope = await scheduleScope(auth);

  const scheduled = await prisma.task.findMany({
    where: {
      companyId: auth.companyId,
      archivedAt: null,
      startAt: { not: null, lt: query.to },
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.priority?.length ? { priority: { in: query.priority } } : {}),
      ...(query.location ? { location: { contains: query.location, mode: 'insensitive' } } : {}),
    },
    include: {
      assignee: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      team: { select: { id: true, name: true, color: true } },
    },
    orderBy: { startAt: 'asc' },
  });

  // Filtered by end time here rather than in SQL: a task with no endAt has an
  // implied one, which the database cannot know about.
  const inWindow = scheduled.filter((task) => {
    const start = task.startAt as Date;
    return blockEnd(start, task.endAt).getTime() > query.from.getTime();
  });

  const visible = inWindow.filter((task) => canSeeTask(scope, auth, task));
  const hiddenCount = inWindow.length - visible.length;

  // ------------------------------ availability -----------------------------
  const [hoursRows, timeOffRows] = await Promise.all([
    prisma.workingHours.findMany({
      where: { companyId: auth.companyId, membershipId: { in: scope.membershipIds } },
    }),
    prisma.timeOff.findMany({
      where: {
        companyId: auth.companyId,
        membershipId: { in: scope.membershipIds },
        startAt: { lt: query.to },
        endAt: { gt: query.from },
      },
      include: { createdBy: { include: { user: { select: { fullName: true } } } } },
      orderBy: { startAt: 'asc' },
    }),
  ]);

  const index = new Map<string, AvailabilityIndex>();
  const indexFor = (membershipId: string) => {
    let entry = index.get(membershipId);
    if (!entry) {
      entry = { hours: new Map(), timeOff: [], hasHours: false };
      index.set(membershipId, entry);
    }
    return entry;
  };
  for (const row of hoursRows) {
    const entry = indexFor(row.membershipId);
    entry.hours.set(row.weekday, { startMinute: row.startMinute, endMinute: row.endMinute });
    entry.hasHours = true;
  }
  for (const row of timeOffRows) {
    indexFor(row.membershipId).timeOff.push({ startAt: row.startAt, endAt: row.endAt });
  }

  // -------------------------------- blocks ---------------------------------
  const blocks: ScheduleBlock[] = visible.map((task) => {
    const start = task.startAt as Date;
    const end = blockEnd(start, task.endAt);
    const resourceIds: string[] = [];
    if (task.assigneeId) resourceIds.push(task.assigneeId);
    if (task.teamId) resourceIds.push(task.teamId);

    return {
      taskId: task.id,
      title: task.title,
      status: task.status as TaskStatus,
      priority: task.priority as TaskPriority,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      location: task.location,
      isOverdue: isOverdue(task.dueAt, task.status),
      completionPercent: task.completionPercent,
      assignee: task.assignee
        ? {
            id: task.assignee.id,
            fullName: task.assignee.user.fullName,
            avatarUrl: task.assignee.user.avatarUrl,
          }
        : null,
      team: task.team,
      resourceIds,
      conflictsWith: [],
      outsideAvailability: task.assigneeId
        ? isOutsideAvailability(start, end, index.get(task.assigneeId))
        : false,
    };
  });

  // ------------------------------- conflicts -------------------------------
  // Only a person can be double-booked. A team column showing two jobs at once
  // is normal — that is two people working, not a clash.
  const byPerson = new Map<string, ScheduleBlock[]>();
  for (const block of blocks) {
    if (!block.assignee) continue;
    const list = byPerson.get(block.assignee.id) ?? [];
    list.push(block);
    byPerson.set(block.assignee.id, list);
  }
  for (const list of byPerson.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        // Finished work cannot clash with anything; it already happened.
        if (a.status === 'DONE' || b.status === 'DONE') continue;
        if (
          overlaps(new Date(a.startAt), new Date(a.endAt), new Date(b.startAt), new Date(b.endAt))
        ) {
          a.conflictsWith.push(b.taskId);
          b.conflictsWith.push(a.taskId);
        }
      }
    }
  }

  // ------------------------------- resources -------------------------------
  const resources = await resolveResources(auth, scope, query.resourceIds ?? []);

  // -------------------------------- workload -------------------------------
  const workload: ScheduleWorkload[] = resources
    .filter((resource) => resource.kind === 'PERSON')
    .map((resource) => {
      const own = byPerson.get(resource.id) ?? [];
      const scheduledMinutes = own.reduce(
        (total, block) =>
          total + Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / MINUTE),
        0,
      );
      return {
        membershipId: resource.id,
        scheduledMinutes,
        availableMinutes: availableMinutesIn(query.from, query.to, index.get(resource.id)),
        blockCount: own.length,
        conflictCount: own.filter((block) => block.conflictsWith.length > 0).length,
        outsideAvailabilityCount: own.filter((block) => block.outsideAvailability).length,
      };
    });

  const availability: ScheduleAvailability[] = resources
    .filter((resource) => resource.kind === 'PERSON')
    .map((resource) => ({
      membershipId: resource.id,
      workingHours: hoursRows
        .filter((row) => row.membershipId === resource.id)
        .map((row) => ({
          weekday: row.weekday,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
      timeOff: timeOffRows
        .filter((row) => row.membershipId === resource.id)
        .map((row) => ({
          id: row.id,
          membershipId: row.membershipId,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          note: row.note,
          createdBy: row.createdBy
            ? { id: row.createdBy.id, fullName: row.createdBy.user.fullName }
            : null,
        })),
    }));

  return {
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    resources,
    blocks,
    availability,
    workload,
    hiddenCount,
  };
}

/**
 * Turns requested column ids into resources, refusing anything out of scope.
 *
 * An unrecognised or forbidden id is dropped rather than rejected: a stale
 * bookmark pointing at somebody who has left should show the rest of the
 * schedule, not an error page.
 */
export async function resolveResources(
  auth: AuthContext,
  scope: ScheduleScope,
  requested: string[],
): Promise<ScheduleResource[]> {
  const wantedPeople = requested.filter((id) => scope.membershipIds.includes(id));
  const wantedTeams = requested.filter((id) => scope.teamIds.includes(id));

  const usingDefaults = wantedPeople.length === 0 && wantedTeams.length === 0;

  const people = await prisma.membership.findMany({
    where: {
      companyId: auth.companyId,
      deactivatedAt: null,
      status: 'ACTIVE',
      id: usingDefaults
        ? { in: scope.membershipIds.slice(0, DEFAULT_RESOURCE_LIMIT) }
        : { in: wantedPeople },
    },
    include: { user: { select: { fullName: true, avatarUrl: true } } },
    orderBy: { user: { fullName: 'asc' } },
    ...(usingDefaults ? { take: DEFAULT_RESOURCE_LIMIT } : {}),
  });

  const teams = wantedTeams.length
    ? await prisma.team.findMany({
        where: { companyId: auth.companyId, archivedAt: null, id: { in: wantedTeams } },
        include: { _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
      })
    : [];

  const personResources: ScheduleResource[] = people.map((person) => ({
    id: person.id,
    kind: 'PERSON',
    name: person.user.fullName,
    subtitle: person.jobTitle,
    avatarUrl: person.user.avatarUrl,
    color: null,
  }));

  const teamResources: ScheduleResource[] = teams.map((team) => ({
    id: team.id,
    kind: 'TEAM',
    name: team.name,
    subtitle: `${team._count.members} ${team._count.members === 1 ? 'person' : 'people'}`,
    avatarUrl: null,
    color: team.color,
  }));

  // The caller first when the columns were chosen for them: your own day is the
  // thing you came to look at.
  if (usingDefaults) {
    personResources.sort((a, b) => {
      if (a.id === auth.membershipId) return -1;
      if (b.id === auth.membershipId) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return [...personResources, ...teamResources];
}

/**
 * Everything that would make a proposed booking worth a second look.
 *
 * Returned rather than thrown. A double-booking is often deliberate — two
 * people on one van, a job that overruns on purpose — so the server explains
 * and lets whoever has permission decide.
 */
export async function describeConflicts(options: {
  companyId: string;
  membershipId: string | null;
  startAt: Date;
  endAt: Date;
  ignoreTaskId?: string;
}): Promise<{ conflicts: { taskId: string; title: string; startAt: string; endAt: string }[]; unavailable: string | null }> {
  if (!options.membershipId) return { conflicts: [], unavailable: null };

  const [candidates, hours, timeOff] = await Promise.all([
    prisma.task.findMany({
      where: {
        companyId: options.companyId,
        archivedAt: null,
        assigneeId: options.membershipId,
        status: { not: 'DONE' },
        startAt: { not: null, lt: options.endAt },
        ...(options.ignoreTaskId ? { id: { not: options.ignoreTaskId } } : {}),
      },
      select: { id: true, title: true, startAt: true, endAt: true },
    }),
    prisma.workingHours.findMany({ where: { membershipId: options.membershipId } }),
    prisma.timeOff.findMany({
      where: {
        membershipId: options.membershipId,
        startAt: { lt: options.endAt },
        endAt: { gt: options.startAt },
      },
    }),
  ]);

  const conflicts = candidates
    .map((task) => ({ task, start: task.startAt as Date, end: blockEnd(task.startAt as Date, task.endAt) }))
    .filter((entry) => overlaps(options.startAt, options.endAt, entry.start, entry.end))
    .map((entry) => ({
      taskId: entry.task.id,
      title: entry.task.title,
      startAt: entry.start.toISOString(),
      endAt: entry.end.toISOString(),
    }));

  const index: AvailabilityIndex = {
    hours: new Map(hours.map((row) => [row.weekday, row])),
    timeOff: timeOff.map((row) => ({ startAt: row.startAt, endAt: row.endAt })),
    hasHours: hours.length > 0,
  };

  const unavailable = isOutsideAvailability(options.startAt, options.endAt, index)
    ? timeOff.length > 0
      ? 'They have time off booked then.'
      : 'That is outside their normal working hours.'
    : null;

  return { conflicts, unavailable };
}
