import type { OrgEdgeDto, OrgGraphDto, OrgNodeDto } from '../../shared/types';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { personInclude, serializePerson, serializeTeam } from './serializers';

/**
 * The organization map mixes two kinds of edges:
 *
 *  • **derived** edges are recomputed from the source of truth on every read
 *    (reporting lines, team membership, shared skills, knowledge ownership).
 *    They can never drift out of sync with the data they describe.
 *  • **stored** edges live in `OrganizationRelationship` and are the ones an
 *    owner draws by hand (collaboration, mentoring).
 *
 * Node *positions* are always persisted so a layout an owner arranges survives
 * a refresh, a redeploy and other people's sessions.
 */

const PERSON_COLUMN_WIDTH = 260;
const PERSON_ROW_HEIGHT = 190;
const TEAM_ROW_Y = -220;

/** Creates the OrganizationNode rows that are missing for people and teams. */
export async function ensureOrganizationNodes(companyId: string) {
  const [memberships, teams, existing] = await Promise.all([
    prisma.membership.findMany({
      where: { companyId, deactivatedAt: null },
      select: { id: true, managerId: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.team.findMany({
      where: { companyId, archivedAt: null },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.organizationNode.findMany({ where: { companyId } }),
  ]);

  const existingPeople = new Set(existing.map((node) => node.membershipId).filter(Boolean));
  const existingTeams = new Set(existing.map((node) => node.teamId).filter(Boolean));

  const missingPeople = memberships.filter((m) => !existingPeople.has(m.id));
  const missingTeams = teams.filter((t) => !existingTeams.has(t.id));
  if (missingPeople.length === 0 && missingTeams.length === 0) return;

  // Lay new people out by reporting depth so a fresh map is already readable.
  const managerById = new Map(memberships.map((m) => [m.id, m.managerId]));
  const depthOf = (id: string, guard = 0): number => {
    const managerId = managerById.get(id);
    if (!managerId || guard > 20) return 0;
    return 1 + depthOf(managerId, guard + 1);
  };

  const usedSlots = new Map<number, number>();
  for (const node of existing) {
    if (!node.membershipId) continue;
    const row = Math.round(node.y / PERSON_ROW_HEIGHT);
    usedSlots.set(row, (usedSlots.get(row) ?? 0) + 1);
  }

  const data = [
    ...missingTeams.map((team, index) => ({
      companyId,
      kind: 'TEAM' as const,
      teamId: team.id,
      x: index * PERSON_COLUMN_WIDTH * 1.4,
      y: TEAM_ROW_Y,
    })),
    ...missingPeople.map((membership) => {
      const depth = depthOf(membership.id);
      const column = usedSlots.get(depth) ?? 0;
      usedSlots.set(depth, column + 1);
      return {
        companyId,
        kind: 'PERSON' as const,
        membershipId: membership.id,
        x: column * PERSON_COLUMN_WIDTH,
        y: depth * PERSON_ROW_HEIGHT,
      };
    }),
  ];

  await prisma.organizationNode.createMany({ data, skipDuplicates: true });
}

export interface GraphFilters {
  teamId?: string;
  search?: string;
}

export async function buildOrganizationGraph(
  companyId: string,
  filters: GraphFilters = {},
): Promise<OrgGraphDto> {
  await ensureOrganizationNodes(companyId);

  const [nodes, storedRelationships, memberSkills, documents, taskCounts] = await Promise.all([
    prisma.organizationNode.findMany({
      where: { companyId },
      include: {
        membership: { include: personInclude },
        team: { include: { _count: { select: { members: true } } } },
      },
    }),
    prisma.organizationRelationship.findMany({ where: { companyId } }),
    prisma.memberSkill.findMany({
      where: { membership: { companyId, deactivatedAt: null } },
      include: { skill: true },
    }),
    prisma.knowledgeDocument.findMany({
      where: { companyId, archivedAt: null, ownerId: { not: null } },
      select: { id: true, title: true, ownerId: true, teamId: true },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: { companyId, archivedAt: null },
      _count: { _all: true },
    }),
  ]);

  const liveNodes = nodes.filter(
    (node) =>
      (node.membership && !node.membership.deactivatedAt) || (node.team && !node.team.archivedAt),
  );

  const nodeByMembership = new Map<string, string>();
  const nodeByTeam = new Map<string, string>();
  for (const node of liveNodes) {
    if (node.membershipId) nodeByMembership.set(node.membershipId, node.id);
    if (node.teamId) nodeByTeam.set(node.teamId, node.id);
  }

  const edges: OrgEdgeDto[] = [];
  const pushDerived = (
    id: string,
    source: string | undefined,
    target: string | undefined,
    type: OrgEdgeDto['type'],
    label: string | null,
    strength = 1,
  ) => {
    if (!source || !target || source === target) return;
    edges.push({ id, source, target, type, label, strength, derived: true });
  };

  // 1. Reporting lines (manager → report).
  for (const node of liveNodes) {
    const managerId = node.membership?.managerId;
    if (!managerId) continue;
    pushDerived(
      `d-reports-${managerId}-${node.membershipId}`,
      nodeByMembership.get(managerId),
      node.id,
      'REPORTS_TO',
      null,
      3,
    );
  }

  // 2. Team membership.
  const teamMemberships = await prisma.teamMembership.findMany({
    where: { team: { companyId, archivedAt: null }, membership: { deactivatedAt: null } },
    select: { teamId: true, membershipId: true },
  });
  for (const tm of teamMemberships) {
    pushDerived(
      `d-team-${tm.teamId}-${tm.membershipId}`,
      nodeByTeam.get(tm.teamId),
      nodeByMembership.get(tm.membershipId),
      'TEAM_MEMBER',
      null,
      1,
    );
  }

  // 3. Shared skills — one edge per pair of people sharing a skill.
  const bySkill = new Map<string, { name: string; members: string[] }>();
  for (const memberSkill of memberSkills) {
    const entry = bySkill.get(memberSkill.skillId) ?? {
      name: memberSkill.skill.name,
      members: [],
    };
    entry.members.push(memberSkill.membershipId);
    bySkill.set(memberSkill.skillId, entry);
  }
  const skillPairs = new Map<string, { label: string[]; a: string; b: string }>();
  for (const [, entry] of bySkill) {
    if (entry.members.length < 2 || entry.members.length > 8) continue;
    for (let i = 0; i < entry.members.length; i += 1) {
      for (let j = i + 1; j < entry.members.length; j += 1) {
        const [a, b] = [entry.members[i], entry.members[j]].sort();
        const key = `${a}|${b}`;
        const existing = skillPairs.get(key) ?? { label: [], a, b };
        existing.label.push(entry.name);
        skillPairs.set(key, existing);
      }
    }
  }
  for (const [key, pair] of skillPairs) {
    pushDerived(
      `d-skill-${key}`,
      nodeByMembership.get(pair.a),
      nodeByMembership.get(pair.b),
      'SHARES_SKILL',
      pair.label.slice(0, 2).join(', '),
      pair.label.length,
    );
  }

  // 4. Knowledge ownership — connects a person to the team that relies on the
  //    process they own, which is how "ownership of business areas" shows up.
  for (const document of documents) {
    if (!document.ownerId || !document.teamId) continue;
    pushDerived(
      `d-owns-${document.id}`,
      nodeByMembership.get(document.ownerId),
      nodeByTeam.get(document.teamId),
      'OWNS_AREA',
      document.title,
      2,
    );
  }

  // 5. Hand-drawn relationships.
  const liveNodeIds = new Set(liveNodes.map((node) => node.id));
  for (const relationship of storedRelationships) {
    if (!liveNodeIds.has(relationship.sourceNodeId)) continue;
    if (!liveNodeIds.has(relationship.targetNodeId)) continue;
    edges.push({
      id: relationship.id,
      source: relationship.sourceNodeId,
      target: relationship.targetNodeId,
      type: relationship.type,
      label: relationship.label,
      strength: relationship.strength,
      derived: false,
    });
  }

  // ------------------------------ filtering --------------------------------
  const search = filters.search?.trim().toLowerCase();
  let visible = liveNodes;

  if (filters.teamId) {
    const teamMemberIds = new Set(
      teamMemberships.filter((tm) => tm.teamId === filters.teamId).map((tm) => tm.membershipId),
    );
    visible = visible.filter(
      (node) =>
        (node.membershipId && teamMemberIds.has(node.membershipId)) ||
        node.teamId === filters.teamId,
    );
  }

  if (search) {
    visible = visible.filter((node) => {
      if (node.team) return node.team.name.toLowerCase().includes(search);
      const person = node.membership;
      if (!person) return false;
      return (
        person.user.fullName.toLowerCase().includes(search) ||
        (person.jobTitle ?? '').toLowerCase().includes(search) ||
        (person.profile?.headline ?? '').toLowerCase().includes(search)
      );
    });
  }

  const visibleIds = new Set(visible.map((node) => node.id));
  const dtoNodes: OrgNodeDto[] = visible.map((node) => ({
    id: node.id,
    kind: node.kind,
    x: node.x,
    y: node.y,
    pinned: node.pinned,
    person: node.membership ? serializePerson(node.membership) : undefined,
    team: node.team ? serializeTeam(node.team) : undefined,
  }));

  const statusCounts = new Map(taskCounts.map((row) => [row.status, row._count._all]));
  const unassigned = await prisma.task.count({
    where: { companyId, archivedAt: null, assigneeId: null, status: { not: 'DONE' } },
  });
  const overdue = await prisma.task.count({
    where: {
      companyId,
      archivedAt: null,
      status: { not: 'DONE' },
      dueAt: { lt: new Date() },
    },
  });

  const activeTasks =
    (statusCounts.get('NOT_STARTED') ?? 0) +
    (statusCounts.get('IN_PROGRESS') ?? 0) +
    (statusCounts.get('BLOCKED') ?? 0) +
    (statusCounts.get('AWAITING_REVIEW') ?? 0);

  return {
    nodes: dtoNodes,
    edges: edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    summary: {
      people: liveNodes.filter((node) => node.kind === 'PERSON').length,
      teams: liveNodes.filter((node) => node.kind === 'TEAM').length,
      activeTasks,
      overdueTasks: overdue,
      unassignedTasks: unassigned,
    },
  };
}

export function broadcastOrganizationChange(companyId: string) {
  emitToCompany(companyId, 'organization:updated', {});
}
