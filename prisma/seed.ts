/**
 * Development seed — builds the "Northstar Facilities" demo company.
 *
 * Run with:  npm run db:seed
 *
 * This is destructive for the demo company only: it deletes and recreates the
 * `northstar-facilities` company so you can re-run it as often as you like.
 * Any other company in the database is left untouched.
 *
 * The login details are listed in README.md under "Demo accounts". They are
 * obviously-fake example.com addresses with a throwaway password — never use
 * this script against a production database.
 */
import { PrismaClient, type CompanyRole, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { loadEnvFile } from '../src/server/lib/loadEnv';

loadEnvFile();

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'AtlasDemo123!';
const COMPANY_SLUG = 'northstar-facilities';

const hours = (n: number) => n * 60 * 60 * 1000;
const days = (n: number) => n * 24 * hours(1);
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

interface PersonSpec {
  key: string;
  fullName: string;
  email: string;
  role: CompanyRole;
  jobTitle: string;
  headline: string;
  bio: string;
  phone: string;
  location: string;
  availability: 'AVAILABLE' | 'BUSY' | 'FOCUSED' | 'OFF_SHIFT' | 'ON_LEAVE';
  skills: [string, number][];
  managerKey?: string;
  teamKeys: string[];
  startedDaysAgo: number;
  /** Which seeded company role this person holds. */
  roleKey?: string;
}

/**
 * The company's own roles, as a small hierarchy. These are positions, not
 * permissions — the CompanyRole on each person still decides access.
 */
const ROLES: {
  key: string;
  name: string;
  color: string;
  description: string;
  parentKey?: string;
  isDefault?: boolean;
}[] = [
  {
    key: 'founder',
    name: 'Founder',
    color: '#121211',
    description: 'Owns the direction of the business and its client relationships.',
  },
  {
    key: 'ops-manager',
    name: 'Operations Manager',
    color: '#1f6feb',
    description: 'Runs the daily schedule and the cleaning crew.',
    parentKey: 'founder',
  },
  {
    key: 'maint-manager',
    name: 'Maintenance Manager',
    color: '#0f7b6c',
    description: 'Owns preventative maintenance and the on-call rota.',
    parentKey: 'founder',
  },
  {
    key: 'scheduler',
    name: 'Scheduling Coordinator',
    color: '#5b3fa8',
    description: 'Keeps the shift board and customer bookings straight.',
    parentKey: 'ops-manager',
  },
  {
    key: 'lead-tech',
    name: 'Lead Technician',
    color: '#a4560f',
    description: 'Runs a route and signs off the work on it.',
    parentKey: 'ops-manager',
  },
  {
    key: 'cleaner',
    name: 'Cleaning Technician',
    color: '#6b6a63',
    description: 'Works a route of client sites.',
    parentKey: 'lead-tech',
    isDefault: true,
  },
  {
    key: 'maint-tech',
    name: 'Maintenance Technician',
    color: '#0e6b8a',
    description: 'Handles repairs, plumbing and HVAC call-outs.',
    parentKey: 'maint-manager',
  },
];

const PEOPLE: PersonSpec[] = [
  {
    key: 'ada',
    fullName: 'Ada Whitfield',
    email: 'owner@northstar.example.com',
    role: 'OWNER',
    jobTitle: 'Founder & Owner',
    headline: 'Owns client relationships, pricing and hiring',
    bio: 'Started Northstar in 2016 after fifteen years running facilities for a hospital group.',
    phone: '+1 555 0100',
    location: 'Portland, OR',
    availability: 'AVAILABLE',
    skills: [
      ['Client Relationships', 5],
      ['Contract Pricing', 5],
      ['Hiring', 4],
    ],
    teamKeys: ['leadership'],
    startedDaysAgo: 2900,
    roleKey: 'founder',
  },
  {
    key: 'marcus',
    fullName: 'Marcus Ellery',
    email: 'marcus@northstar.example.com',
    role: 'MANAGER',
    jobTitle: 'Operations Manager',
    headline: 'Owns daily scheduling and the cleaning crews',
    bio: 'Runs the day-to-day route board and handles anything a crew cannot solve on site.',
    phone: '+1 555 0111',
    location: 'Portland, OR',
    availability: 'BUSY',
    skills: [
      ['Scheduling', 5],
      ['Crew Leadership', 4],
      ['Safety Compliance', 4],
      ['Client Relationships', 3],
    ],
    managerKey: 'ada',
    teamKeys: ['leadership', 'operations'],
    startedDaysAgo: 1800,
    roleKey: 'ops-manager',
  },
  {
    key: 'priya',
    fullName: 'Priya Raghunathan',
    email: 'priya@northstar.example.com',
    role: 'MANAGER',
    jobTitle: 'Maintenance Manager',
    headline: 'Owns preventative maintenance and equipment',
    bio: 'Licensed HVAC technician. Keeps the equipment register and the maintenance calendar.',
    phone: '+1 555 0112',
    location: 'Beaverton, OR',
    availability: 'AVAILABLE',
    skills: [
      ['HVAC', 5],
      ['Preventative Maintenance', 5],
      ['Safety Compliance', 4],
      ['Vendor Management', 3],
    ],
    managerKey: 'ada',
    teamKeys: ['leadership', 'maintenance'],
    startedDaysAgo: 1200,
    roleKey: 'maint-manager',
  },
  {
    key: 'jonah',
    fullName: 'Jonah Rivera',
    email: 'jonah@northstar.example.com',
    role: 'WORKER',
    jobTitle: 'Lead Cleaning Technician',
    headline: 'Owns the downtown office route',
    bio: 'Five years on the downtown route. Trains every new cleaning technician.',
    phone: '+1 555 0121',
    location: 'Portland, OR',
    availability: 'BUSY',
    skills: [
      ['Floor Care', 5],
      ['Crew Leadership', 4],
      ['Safety Compliance', 3],
    ],
    managerKey: 'marcus',
    teamKeys: ['operations'],
    startedDaysAgo: 1600,
    roleKey: 'lead-tech',
  },
  {
    key: 'lena',
    fullName: 'Lena Ostrowski',
    email: 'lena@northstar.example.com',
    role: 'WORKER',
    jobTitle: 'Cleaning Technician',
    headline: 'Covers the medical clinic contracts',
    bio: 'Certified in bloodborne pathogen handling. Prefers early shifts.',
    phone: '+1 555 0122',
    location: 'Portland, OR',
    availability: 'AVAILABLE',
    skills: [
      ['Floor Care', 3],
      ['Medical Cleaning', 5],
      ['Safety Compliance', 4],
    ],
    managerKey: 'marcus',
    teamKeys: ['operations'],
    startedDaysAgo: 700,
    roleKey: 'cleaner',
  },
  {
    key: 'theo',
    fullName: 'Theo Banda',
    email: 'theo@northstar.example.com',
    role: 'WORKER',
    jobTitle: 'Cleaning Technician',
    headline: 'Night crew — retail contracts',
    bio: 'Joined from a retail janitorial contractor. Works the 10pm to 6am shift.',
    phone: '+1 555 0123',
    location: 'Gresham, OR',
    availability: 'OFF_SHIFT',
    skills: [
      ['Floor Care', 4],
      ['Window Care', 3],
    ],
    managerKey: 'marcus',
    teamKeys: ['operations'],
    startedDaysAgo: 210,
    roleKey: 'cleaner',
  },
  {
    key: 'sofia',
    fullName: 'Sofia Marchetti',
    email: 'sofia@northstar.example.com',
    role: 'WORKER',
    jobTitle: 'Maintenance Technician',
    headline: 'Owns HVAC filter changes across all sites',
    bio: 'Second-year apprentice working toward her HVAC certification.',
    phone: '+1 555 0124',
    location: 'Beaverton, OR',
    availability: 'FOCUSED',
    skills: [
      ['HVAC', 3],
      ['Preventative Maintenance', 4],
      ['Electrical Basics', 3],
    ],
    managerKey: 'priya',
    teamKeys: ['maintenance'],
    startedDaysAgo: 480,
    roleKey: 'maint-tech',
  },
  {
    key: 'dmitri',
    fullName: 'Dmitri Volkov',
    email: 'dmitri@northstar.example.com',
    role: 'WORKER',
    jobTitle: 'Maintenance Technician',
    headline: 'Owns plumbing call-outs and the parts inventory',
    bio: 'Handles emergency call-outs. Keeps the van stocked.',
    phone: '+1 555 0125',
    location: 'Portland, OR',
    availability: 'AVAILABLE',
    skills: [
      ['Plumbing', 5],
      ['Preventative Maintenance', 3],
      ['Vendor Management', 3],
    ],
    managerKey: 'priya',
    teamKeys: ['maintenance'],
    startedDaysAgo: 950,
    roleKey: 'maint-tech',
  },
  {
    key: 'rosa',
    fullName: 'Rosa Delgado',
    email: 'rosa@northstar.example.com',
    role: 'WORKER',
    jobTitle: 'Scheduling Coordinator',
    headline: 'Owns the shift board and customer call-ins',
    bio: 'First point of contact for clients. Builds the weekly schedule with Marcus.',
    phone: '+1 555 0126',
    location: 'Portland, OR',
    availability: 'AVAILABLE',
    skills: [
      ['Scheduling', 4],
      ['Client Relationships', 4],
    ],
    managerKey: 'marcus',
    teamKeys: ['operations'],
    startedDaysAgo: 380,
    roleKey: 'scheduler',
  },
];

const TEAMS = [
  {
    key: 'leadership',
    name: 'Leadership',
    description: 'Owners and managers who set direction for the company.',
    color: '#1f6feb',
    leadKey: 'ada',
  },
  {
    key: 'operations',
    name: 'Operations',
    description: 'Cleaning crews, route scheduling and day-to-day client work.',
    color: '#0f766e',
    leadKey: 'marcus',
  },
  {
    key: 'maintenance',
    name: 'Maintenance',
    description: 'Preventative maintenance, repairs and equipment.',
    color: '#a16207',
    leadKey: 'priya',
  },
];

async function main() {
  console.log('Seeding the Northstar Facilities demo company...');

  const existing = await prisma.company.findUnique({ where: { slug: COMPANY_SLUG } });
  if (existing) {
    // Cascades remove memberships, tasks, documents and events.
    const emails = PEOPLE.map((person) => person.email);
    await prisma.company.delete({ where: { id: existing.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    console.log('  • removed the previous demo company');
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const company = await prisma.company.create({
    data: {
      name: 'Northstar Facilities',
      slug: COMPANY_SLUG,
      industry: 'Facilities & Cleaning Services',
      sizeRange: '10-25',
      location: 'Portland, Oregon',
      timezone: 'America/Los_Angeles',
    },
  });

  // ------------------------------- roles -----------------------------------
  const roleByKey = new Map<string, string>();
  for (const spec of ROLES) {
    const created = await prisma.role.create({
      data: {
        companyId: company.id,
        name: spec.name,
        color: spec.color,
        description: spec.description,
        parentId: spec.parentKey ? (roleByKey.get(spec.parentKey) ?? null) : null,
        sortOrder: ROLES.indexOf(spec),
        isDefault: spec.isDefault ?? false,
      },
    });
    roleByKey.set(spec.key, created.id);
  }

  // ------------------------------- people ----------------------------------
  const membershipByKey = new Map<string, string>();

  for (const person of PEOPLE) {
    const user = await prisma.user.create({
      data: { email: person.email, fullName: person.fullName, passwordHash },
    });

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: person.role,
        roleId: person.roleKey ? (roleByKey.get(person.roleKey) ?? null) : null,
        jobTitle: person.jobTitle,
        joinedAt: ago(days(person.startedDaysAgo)),
        profile: {
          create: {
            headline: person.headline,
            bio: person.bio,
            phone: person.phone,
            workEmail: person.email,
            location: person.location,
            timezone: 'America/Los_Angeles',
            startDate: ago(days(person.startedDaysAgo)),
            availability: person.availability,
            weeklyHoursTarget: person.role === 'WORKER' ? 40 : 45,
          },
        },
        notificationPreference: { create: {} },
      },
    });

    membershipByKey.set(person.key, membership.id);
  }

  // Reporting lines (second pass so every manager exists first).
  for (const person of PEOPLE) {
    if (!person.managerKey) continue;
    await prisma.membership.update({
      where: { id: membershipByKey.get(person.key)! },
      data: { managerId: membershipByKey.get(person.managerKey)! },
    });
  }

  // -------------------------------- skills ---------------------------------
  const skillIdByName = new Map<string, string>();
  for (const person of PEOPLE) {
    for (const [name, level] of person.skills) {
      let skillId = skillIdByName.get(name);
      if (!skillId) {
        const skill = await prisma.skill.create({ data: { companyId: company.id, name } });
        skillId = skill.id;
        skillIdByName.set(name, skillId);
      }
      await prisma.memberSkill.create({
        data: { membershipId: membershipByKey.get(person.key)!, skillId, level },
      });
    }
  }

  await prisma.certification.createMany({
    data: [
      {
        membershipId: membershipByKey.get('priya')!,
        name: 'EPA 608 Universal',
        issuer: 'EPA',
        issuedAt: ago(days(1400)),
      },
      {
        membershipId: membershipByKey.get('lena')!,
        name: 'Bloodborne Pathogens',
        issuer: 'OSHA',
        issuedAt: ago(days(200)),
        expiresAt: ahead(days(165)),
      },
      {
        membershipId: membershipByKey.get('dmitri')!,
        name: 'Journeyman Plumber',
        issuer: 'State of Oregon',
        issuedAt: ago(days(1100)),
      },
    ],
  });

  // -------------------------------- teams ----------------------------------
  const teamIdByKey = new Map<string, string>();
  for (const team of TEAMS) {
    const created = await prisma.team.create({
      data: {
        companyId: company.id,
        name: team.name,
        description: team.description,
        color: team.color,
        leadId: membershipByKey.get(team.leadKey)!,
      },
    });
    teamIdByKey.set(team.key, created.id);
  }

  for (const person of PEOPLE) {
    for (const teamKey of person.teamKeys) {
      await prisma.teamMembership.create({
        data: {
          teamId: teamIdByKey.get(teamKey)!,
          membershipId: membershipByKey.get(person.key)!,
          roleInTeam:
            TEAMS.find((team) => team.key === teamKey)?.leadKey === person.key ? 'Lead' : null,
        },
      });
    }
  }

  // ---------------------------- organization map ---------------------------
  const nodeIdByKey = new Map<string, string>();

  for (const [index, team] of TEAMS.entries()) {
    const node = await prisma.organizationNode.create({
      data: {
        companyId: company.id,
        kind: 'TEAM',
        teamId: teamIdByKey.get(team.key)!,
        x: -120 + index * 380,
        y: -240,
      },
    });
    nodeIdByKey.set(`team:${team.key}`, node.id);
  }

  const LAYOUT: Record<string, { x: number; y: number }> = {
    ada: { x: 260, y: 0 },
    marcus: { x: 20, y: 200 },
    priya: { x: 520, y: 200 },
    jonah: { x: -160, y: 410 },
    lena: { x: 40, y: 410 },
    theo: { x: 240, y: 410 },
    rosa: { x: -260, y: 210 },
    sofia: { x: 460, y: 410 },
    dmitri: { x: 660, y: 410 },
  };

  for (const person of PEOPLE) {
    const node = await prisma.organizationNode.create({
      data: {
        companyId: company.id,
        kind: 'PERSON',
        membershipId: membershipByKey.get(person.key)!,
        x: LAYOUT[person.key]?.x ?? 0,
        y: LAYOUT[person.key]?.y ?? 0,
      },
    });
    nodeIdByKey.set(`person:${person.key}`, node.id);
  }

  // A couple of hand-drawn relationships on top of the derived ones.
  await prisma.organizationRelationship.createMany({
    data: [
      {
        companyId: company.id,
        sourceNodeId: nodeIdByKey.get('person:jonah')!,
        targetNodeId: nodeIdByKey.get('person:theo')!,
        type: 'MENTORS',
        label: 'Onboarding buddy',
        strength: 3,
      },
      {
        companyId: company.id,
        sourceNodeId: nodeIdByKey.get('person:rosa')!,
        targetNodeId: nodeIdByKey.get('person:priya')!,
        type: 'COLLABORATES_WITH',
        label: 'Maintenance scheduling',
        strength: 2,
      },
      {
        companyId: company.id,
        sourceNodeId: nodeIdByKey.get('person:marcus')!,
        targetNodeId: nodeIdByKey.get('person:priya')!,
        type: 'COLLABORATES_WITH',
        label: 'Weekly ops sync',
        strength: 2,
      },
    ],
  });

  // ------------------------------ knowledge --------------------------------
  const DOCUMENTS = [
    {
      title: 'Opening checklist — office contracts',
      category: 'Checklists',
      ownerKey: 'jonah',
      teamKey: 'operations',
      requiresAcknowledgment: true,
      status: 'PUBLISHED' as const,
      tags: ['opening', 'cleaning', 'daily'],
      content: `# Opening checklist — office contracts

Run this every morning before the client's staff arrive. It should take about 35 minutes.

## Before you enter
1. Check the route board in Atlas for any overnight notes.
2. Confirm the alarm code for the site is the one on the shift card.
3. Photograph anything already damaged **before** you touch it.

## Inside
1. Lights on, thermostat to 21°C.
2. Empty all bins and replace liners.
3. Wipe reception desk, door handles and lift buttons.
4. Restock washrooms — soap, paper, sanitiser.
5. Spot-mop entrances; full mop on Mondays and Thursdays.

## Before you leave
- Log the visit in Atlas and mark the task complete.
- Anything you could not finish goes in the task comments, not a text message.
- If something is broken, mark the task **Blocked** and say what is wrong.`,
    },
    {
      title: 'Closing checklist — retail contracts',
      category: 'Checklists',
      ownerKey: 'theo',
      teamKey: 'operations',
      requiresAcknowledgment: false,
      status: 'PUBLISHED' as const,
      tags: ['closing', 'retail', 'night'],
      content: `# Closing checklist — retail contracts

The night crew owns this. Work back-of-house first, sales floor last.

1. Back-of-house: sweep, mop, break down cardboard.
2. Sales floor: vacuum all runs, spot-clean glass.
3. Fitting rooms: mirrors, benches, floor.
4. Washrooms: full clean and restock.
5. Set the alarm and confirm the door pull.

> If the alarm does not set, call Marcus before you leave the site. Do not
> leave a store unsecured.`,
    },
    {
      title: 'How we handle a customer complaint',
      category: 'Customer Rules',
      ownerKey: 'ada',
      teamKey: 'leadership',
      requiresAcknowledgment: true,
      status: 'PUBLISHED' as const,
      tags: ['customers', 'escalation', 'values'],
      content: `# How we handle a customer complaint

A complaint is information, not an attack. We fix it fast and we tell the truth.

## Within one hour
- Acknowledge it. "Thank you for telling us, I'm looking at it now."
- Never blame a colleague in front of a client.

## Within one working day
- Put the fix on the schedule and tell the client the date and time.
- Create a task in Atlas, assigned to a named person, with the site as the
  location.

## Within one week
- Ada calls the client personally for anything involving a missed visit,
  damage, or a safety issue.

## What we never do
- Argue about the contract in the first conversation.
- Promise a discount before Ada has seen the account.`,
    },
    {
      title: 'Preventative maintenance standard',
      category: 'Procedures',
      ownerKey: 'priya',
      teamKey: 'maintenance',
      requiresAcknowledgment: true,
      status: 'PUBLISHED' as const,
      tags: ['hvac', 'maintenance', 'safety'],
      content: `# Preventative maintenance standard

Every site has a PM schedule in Atlas. Work the schedule, do not work from
memory.

## HVAC
- Filters: quarterly, or monthly on the two clinic sites.
- Record the filter size you actually fitted in the task comments.
- Photograph the unit label if the size does not match the register.

## Plumbing
- Traps and drains: twice yearly.
- Anything leaking gets an emergency task, not a scheduled one.

## Safety
- Lock-out / tag-out before any panel comes off. No exceptions.
- If you are working alone after hours, message the Maintenance team channel
  when you arrive and when you leave.`,
    },
    {
      title: 'Safety: lock-out / tag-out',
      category: 'Safety',
      ownerKey: 'priya',
      teamKey: 'maintenance',
      requiresAcknowledgment: true,
      status: 'PUBLISHED' as const,
      tags: ['safety', 'osha', 'required'],
      content: `# Lock-out / tag-out

This one is not negotiable. Read it, then acknowledge it in Atlas.

1. Identify every energy source for the equipment.
2. Notify anyone working nearby.
3. Shut down using the normal stopping procedure.
4. Isolate, then apply **your own** lock and tag.
5. Verify zero energy before you put a hand anywhere.

Only the person who applied a lock removes it. If you find a lock with no
name on it, stop and call Priya.`,
    },
    {
      title: 'What Northstar stands for',
      category: 'Company Values',
      ownerKey: 'ada',
      teamKey: 'leadership',
      requiresAcknowledgment: false,
      status: 'PUBLISHED' as const,
      tags: ['values', 'onboarding'],
      content: `# What Northstar stands for

We clean and maintain buildings other people rely on. Three things matter.

**Show up.** A site we said we would visit gets visited. If something goes
wrong, the client hears it from us first.

**Leave it better.** Not "acceptable". Better than we found it.

**Say the hard thing early.** A blocked task on Monday is a problem. A blocked
task nobody mentioned until Friday is a crisis.`,
    },
    {
      title: 'New technician — first two weeks',
      category: 'Onboarding',
      ownerKey: 'marcus',
      teamKey: 'operations',
      requiresAcknowledgment: false,
      status: 'DRAFT' as const,
      tags: ['onboarding', 'training'],
      content: `# New technician — first two weeks

*(Draft — Marcus is still writing this one.)*

## Week 1
- Day 1: paperwork, safety induction, site tour with your buddy.
- Days 2-4: shadow the downtown route with Jonah.
- Day 5: run one site yourself with your buddy watching.

## Week 2
- Solo on two sites, buddy on call.
- Read and acknowledge every document tagged *required* in the knowledge base.`,
    },
  ];

  const documentIdByTitle = new Map<string, string>();
  for (const doc of DOCUMENTS) {
    const created = await prisma.knowledgeDocument.create({
      data: {
        companyId: company.id,
        title: doc.title,
        slug: doc.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
        category: doc.category,
        contentMarkdown: doc.content,
        excerpt: doc.content
          .split('\n')
          .slice(2, 4)
          .join(' ')
          .replace(/[#*>]/g, '')
          .trim()
          .slice(0, 180),
        tags: doc.tags,
        status: doc.status,
        requiresAcknowledgment: doc.requiresAcknowledgment,
        ownerId: membershipByKey.get(doc.ownerKey)!,
        teamId: teamIdByKey.get(doc.teamKey)!,
        revisions: {
          create: {
            version: 1,
            title: doc.title,
            contentMarkdown: doc.content,
            changeNote: 'Created',
            editedById: membershipByKey.get(doc.ownerKey)!,
          },
        },
      },
    });
    documentIdByTitle.set(doc.title, created.id);
  }

  // Some people have already acknowledged the required reading; others have not
  // — that is what makes the knowledge base screen interesting on first load.
  await prisma.knowledgeAcknowledgment.createMany({
    data: [
      {
        documentId: documentIdByTitle.get('Safety: lock-out / tag-out')!,
        membershipId: membershipByKey.get('sofia')!,
        acknowledgedAt: ago(days(12)),
      },
      {
        documentId: documentIdByTitle.get('Safety: lock-out / tag-out')!,
        membershipId: membershipByKey.get('dmitri')!,
        acknowledgedAt: ago(days(30)),
      },
      {
        documentId: documentIdByTitle.get('Opening checklist — office contracts')!,
        membershipId: membershipByKey.get('lena')!,
        acknowledgedAt: ago(days(5)),
      },
      {
        documentId: documentIdByTitle.get('How we handle a customer complaint')!,
        membershipId: membershipByKey.get('marcus')!,
        acknowledgedAt: ago(days(60)),
      },
    ],
  });

  await prisma.trainingRecord.createMany({
    data: [
      {
        membershipId: membershipByKey.get('theo')!,
        title: 'Safety induction',
        completedAt: ago(days(205)),
      },
      {
        membershipId: membershipByKey.get('theo')!,
        title: 'Shadow the downtown route',
        completedAt: ago(days(198)),
      },
      {
        membershipId: membershipByKey.get('theo')!,
        title: 'Solo shift sign-off',
        documentId: documentIdByTitle.get('Closing checklist — retail contracts')!,
        completedAt: null,
      },
      {
        membershipId: membershipByKey.get('sofia')!,
        title: 'HVAC apprentice module 3',
        completedAt: null,
      },
    ],
  });

  // --------------------------------- work ----------------------------------
  interface TaskSpec {
    title: string;
    description: string;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'AWAITING_REVIEW' | 'DONE';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    assigneeKey: string | null;
    creatorKey: string;
    teamKey: string;
    dueAt: Date | null;
    location?: string;
    documentTitle?: string;
    blockedReason?: string;
    completionPercent?: number;
    requiresApproval?: boolean;
    requiresProofPhoto?: boolean;
    completedAt?: Date;
    subtasks?: { title: string; done: boolean }[];
  }

  const TASKS: TaskSpec[] = [
    {
      title: 'Deep clean — Harbourview Clinic reception',
      description:
        'Quarterly deep clean. Client asked specifically about the skirting boards and the vents behind reception.',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assigneeKey: 'lena',
      creatorKey: 'marcus',
      teamKey: 'operations',
      dueAt: ahead(hours(6)),
      location: 'Harbourview Clinic, 214 Marine Dr',
      documentTitle: 'Opening checklist — office contracts',
      completionPercent: 60,
      requiresProofPhoto: true,
      subtasks: [
        { title: 'Vents and returns', done: true },
        { title: 'Skirting boards', done: true },
        { title: 'Chairs and upholstery', done: false },
        { title: 'Floor buff', done: false },
      ],
    },
    {
      title: 'Replace HVAC filters — Building C',
      description: 'Quarterly filter change. Register says 20x25x1 but check the unit label.',
      status: 'BLOCKED',
      priority: 'URGENT',
      assigneeKey: 'sofia',
      creatorKey: 'priya',
      teamKey: 'maintenance',
      dueAt: ago(days(1)),
      location: 'Riverside Business Park, Building C',
      documentTitle: 'Preventative maintenance standard',
      blockedReason:
        'The filter sizes in the store room do not match the units — we need 20x25x4, we only have 20x25x1.',
      completionPercent: 25,
    },
    {
      title: 'Night sweep — Eastgate Retail',
      description: 'Standard closing routine. New signage display near the entrance needs care.',
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      assigneeKey: 'theo',
      creatorKey: 'marcus',
      teamKey: 'operations',
      dueAt: ahead(hours(14)),
      location: 'Eastgate Retail Park',
      documentTitle: 'Closing checklist — retail contracts',
    },
    {
      title: 'Fix leaking trap — Northbank Offices, 3rd floor washroom',
      description: 'Reported by the client this morning. Water on the floor, bucket in place.',
      status: 'AWAITING_REVIEW',
      priority: 'HIGH',
      assigneeKey: 'dmitri',
      creatorKey: 'priya',
      teamKey: 'maintenance',
      dueAt: ago(hours(3)),
      location: 'Northbank Offices',
      requiresApproval: true,
      completionPercent: 100,
    },
    {
      title: 'Rebuild next week’s route board',
      description: 'Theo is off Thursday and Friday. Cover the retail sites.',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assigneeKey: 'rosa',
      creatorKey: 'marcus',
      teamKey: 'operations',
      dueAt: ahead(days(2)),
      completionPercent: 40,
    },
    {
      title: 'Quote the Meridian Tower contract',
      description: 'Three floors, five nights a week. Walk the site before quoting.',
      status: 'NOT_STARTED',
      priority: 'HIGH',
      assigneeKey: 'ada',
      creatorKey: 'ada',
      teamKey: 'leadership',
      dueAt: ahead(days(5)),
    },
    {
      title: 'Order replacement mop heads and liners',
      description: 'Running low across all three vans.',
      status: 'NOT_STARTED',
      priority: 'LOW',
      assigneeKey: null,
      creatorKey: 'marcus',
      teamKey: 'operations',
      dueAt: ahead(days(4)),
    },
    {
      title: 'Annual fire extinguisher inspection — all sites',
      description: 'Vendor booked. Someone needs to walk them round each site.',
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      assigneeKey: null,
      creatorKey: 'priya',
      teamKey: 'maintenance',
      dueAt: ahead(days(11)),
    },
    {
      title: 'Downtown route — Tuesday',
      description: 'Standard route. Four sites.',
      status: 'DONE',
      priority: 'MEDIUM',
      assigneeKey: 'jonah',
      creatorKey: 'marcus',
      teamKey: 'operations',
      dueAt: ago(days(1)),
      completedAt: ago(days(1) - hours(2)),
      completionPercent: 100,
    },
    {
      title: 'Replace lobby light ballast — Northbank',
      description: 'Flickering since last week.',
      status: 'DONE',
      priority: 'MEDIUM',
      assigneeKey: 'dmitri',
      creatorKey: 'priya',
      teamKey: 'maintenance',
      dueAt: ago(days(3)),
      completedAt: ago(days(3)),
      completionPercent: 100,
    },
    {
      title: 'Onboard Theo — solo shift sign-off',
      description: 'Jonah to watch one full closing shift and sign it off.',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assigneeKey: 'jonah',
      creatorKey: 'marcus',
      teamKey: 'operations',
      dueAt: ahead(days(3)),
      completionPercent: 50,
      requiresApproval: true,
    },
    {
      title: 'Medical cleaning refresher for the clinic crew',
      description: 'Lena to run a 30-minute refresher for anyone covering clinic sites.',
      status: 'NOT_STARTED',
      priority: 'LOW',
      assigneeKey: 'lena',
      creatorKey: 'ada',
      teamKey: 'operations',
      dueAt: ahead(days(9)),
    },
  ];

  const taskIdByTitle = new Map<string, string>();
  for (const spec of TASKS) {
    const task = await prisma.task.create({
      data: {
        companyId: company.id,
        title: spec.title,
        description: spec.description,
        status: spec.status,
        priority: spec.priority,
        dueAt: spec.dueAt,
        location: spec.location ?? null,
        assigneeId: spec.assigneeKey ? membershipByKey.get(spec.assigneeKey)! : null,
        createdById: membershipByKey.get(spec.creatorKey)!,
        teamId: teamIdByKey.get(spec.teamKey)!,
        documentId: spec.documentTitle ? documentIdByTitle.get(spec.documentTitle)! : null,
        blockedReason: spec.blockedReason ?? null,
        blockedAt: spec.status === 'BLOCKED' ? ago(hours(20)) : null,
        completionPercent: spec.completionPercent ?? 0,
        requiresApproval: spec.requiresApproval ?? false,
        requiresProofPhoto: spec.requiresProofPhoto ?? false,
        completedAt: spec.completedAt ?? null,
        subtasks: spec.subtasks
          ? {
              create: spec.subtasks.map((subtask, index) => ({
                title: subtask.title,
                done: subtask.done,
                position: index,
              })),
            }
          : undefined,
      },
    });
    taskIdByTitle.set(spec.title, task.id);
  }

  // A conversation with a mention, so the comment UI has something real in it.
  const blockedTaskId = taskIdByTitle.get('Replace HVAC filters — Building C')!;
  const sofiaComment = await prisma.taskComment.create({
    data: {
      taskId: blockedTaskId,
      authorId: membershipByKey.get('sofia')!,
      body: 'Units are all 4-inch depth. The register is wrong. @Priya Raghunathan can I order a case of 20x25x4?',
      createdAt: ago(hours(19)),
      mentions: { create: [{ membershipId: membershipByKey.get('priya')! }] },
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: blockedTaskId,
      authorId: membershipByKey.get('priya')!,
      body: 'Ordering now — should land tomorrow morning. Leave the units as they are, do not run them without a filter.',
      createdAt: ago(hours(17)),
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: taskIdByTitle.get('Fix leaking trap — Northbank Offices, 3rd floor washroom')!,
      authorId: membershipByKey.get('dmitri')!,
      body: 'Replaced the trap and the tailpiece. Ran it for ten minutes, dry. Ready for sign-off.',
      createdAt: ago(hours(3)),
    },
  });

  // ------------------------------ invitations ------------------------------
  await prisma.inviteCode.create({
    data: {
      companyId: company.id,
      code: 'NORTHSTAR',
      label: 'Spring hiring — cleaning technicians',
      role: 'WORKER',
      teamId: teamIdByKey.get('operations')!,
      maxUses: 25,
      useCount: 3,
      active: true,
      createdById: membershipByKey.get('ada')!,
    },
  });

  await prisma.inviteCode.create({
    data: {
      companyId: company.id,
      code: 'MAINTCREW',
      label: 'Maintenance apprentices',
      role: 'WORKER',
      teamId: teamIdByKey.get('maintenance')!,
      maxUses: 5,
      useCount: 1,
      expiresAt: ahead(days(30)),
      active: true,
      createdById: membershipByKey.get('priya')!,
    },
  });

  // ----------------------------- announcements -----------------------------
  await prisma.announcement.createMany({
    data: [
      {
        companyId: company.id,
        authorId: membershipByKey.get('ada')!,
        title: 'We signed Meridian Tower',
        body: 'Three floors, five nights a week, starting the first of next month. This is our largest contract to date. Marcus and Rosa will build the route; expect the schedule to shift.',
        pinned: true,
        createdAt: ago(days(2)),
      },
      {
        companyId: company.id,
        authorId: membershipByKey.get('priya')!,
        title: 'Lock-out / tag-out is now required reading',
        body: 'Everyone on the maintenance team needs to read and acknowledge the lock-out / tag-out document in the knowledge base by Friday.',
        pinned: false,
        createdAt: ago(days(6)),
      },
    ],
  });

  // -------------------------- recurring templates --------------------------
  await prisma.taskTemplate.create({
    data: {
      companyId: company.id,
      name: 'Weekly deep clean — clinic sites',
      titleTemplate: 'Weekly deep clean — clinic sites',
      description:
        'Full deep clean of both clinic contracts. Follow the medical cleaning standard.',
      priority: 'HIGH',
      frequency: 'WEEKLY',
      interval: 1,
      weekdays: [1],
      timeOfDay: '07:00',
      defaultAssigneeId: membershipByKey.get('lena')!,
      teamId: teamIdByKey.get('operations')!,
      requiresProofPhoto: true,
      nextRunAt: ahead(days(3)),
    },
  });

  await prisma.taskTemplate.create({
    data: {
      companyId: company.id,
      name: 'Monthly HVAC filter round',
      titleTemplate: 'Monthly HVAC filter round',
      description: 'Clinic sites only. Quarterly sites are on the separate schedule.',
      priority: 'MEDIUM',
      frequency: 'MONTHLY',
      interval: 1,
      dayOfMonth: 1,
      timeOfDay: '08:00',
      defaultAssigneeId: membershipByKey.get('sofia')!,
      teamId: teamIdByKey.get('maintenance')!,
      nextRunAt: ahead(days(9)),
    },
  });

  // ------------------------------- activity --------------------------------
  const events: Prisma.ActivityEventCreateManyInput[] = [
    {
      companyId: company.id,
      type: 'MEMBER_JOINED',
      summary: 'Ada Whitfield created Northstar Facilities on Atlas',
      actorId: membershipByKey.get('ada')!,
      targetId: membershipByKey.get('ada')!,
      createdAt: ago(days(90)),
    },
    {
      companyId: company.id,
      type: 'TEAM_CREATED',
      summary: 'Ada Whitfield created the Operations team',
      actorId: membershipByKey.get('ada')!,
      teamId: teamIdByKey.get('operations')!,
      createdAt: ago(days(89)),
    },
    {
      companyId: company.id,
      type: 'TEAM_CREATED',
      summary: 'Ada Whitfield created the Maintenance team',
      actorId: membershipByKey.get('ada')!,
      teamId: teamIdByKey.get('maintenance')!,
      createdAt: ago(days(89)),
    },
    {
      companyId: company.id,
      type: 'MEMBER_JOINED',
      summary: 'Theo Banda joined Northstar Facilities',
      actorId: membershipByKey.get('theo')!,
      targetId: membershipByKey.get('theo')!,
      createdAt: ago(days(30)),
      metadata: { via: 'invite-code' },
    },
    {
      companyId: company.id,
      type: 'INVITE_USED',
      summary: 'Invitation code NORTHSTAR was used by Theo Banda',
      targetId: membershipByKey.get('theo')!,
      visibility: 'MANAGERS',
      createdAt: ago(days(30)),
    },
    {
      companyId: company.id,
      type: 'DOCUMENT_CREATED',
      summary: 'Priya Raghunathan created the "Safety: lock-out / tag-out" document',
      actorId: membershipByKey.get('priya')!,
      documentId: documentIdByTitle.get('Safety: lock-out / tag-out')!,
      createdAt: ago(days(21)),
    },
    {
      companyId: company.id,
      type: 'TEAM_MEMBER_ADDED',
      summary: 'Rosa Delgado was added to Operations',
      actorId: membershipByKey.get('marcus')!,
      targetId: membershipByKey.get('rosa')!,
      teamId: teamIdByKey.get('operations')!,
      createdAt: ago(days(18)),
    },
    {
      companyId: company.id,
      type: 'TASK_CREATED',
      summary: 'Priya Raghunathan created "Replace HVAC filters — Building C"',
      actorId: membershipByKey.get('priya')!,
      targetId: membershipByKey.get('sofia')!,
      taskId: blockedTaskId,
      createdAt: ago(days(4)),
    },
    {
      companyId: company.id,
      type: 'TASK_BLOCKED',
      summary: 'Sofia Marchetti reported "Replace HVAC filters — Building C" as blocked',
      actorId: membershipByKey.get('sofia')!,
      targetId: membershipByKey.get('sofia')!,
      taskId: blockedTaskId,
      createdAt: ago(hours(20)),
    },
    {
      companyId: company.id,
      type: 'TASK_ESCALATED',
      summary: '"Replace HVAC filters — Building C" was escalated (blocked)',
      targetId: membershipByKey.get('sofia')!,
      taskId: blockedTaskId,
      visibility: 'MANAGERS',
      createdAt: ago(hours(20)),
      metadata: { reason: 'BLOCKED' },
    },
    {
      companyId: company.id,
      type: 'TASK_COMMENTED',
      summary: 'Sofia Marchetti commented on "Replace HVAC filters — Building C"',
      actorId: membershipByKey.get('sofia')!,
      taskId: blockedTaskId,
      createdAt: ago(hours(19)),
      metadata: { commentId: sofiaComment.id },
    },
    {
      companyId: company.id,
      type: 'TASK_COMPLETED',
      summary: 'Jonah Rivera completed "Downtown route — Tuesday"',
      actorId: membershipByKey.get('jonah')!,
      targetId: membershipByKey.get('jonah')!,
      taskId: taskIdByTitle.get('Downtown route — Tuesday')!,
      createdAt: ago(days(1)),
    },
    {
      companyId: company.id,
      type: 'TASK_COMPLETED',
      summary: 'Dmitri Volkov completed "Replace lobby light ballast — Northbank"',
      actorId: membershipByKey.get('dmitri')!,
      targetId: membershipByKey.get('dmitri')!,
      taskId: taskIdByTitle.get('Replace lobby light ballast — Northbank')!,
      createdAt: ago(days(3)),
    },
    {
      companyId: company.id,
      type: 'DOCUMENT_ACKNOWLEDGED',
      summary: 'Sofia Marchetti acknowledged "Safety: lock-out / tag-out"',
      actorId: membershipByKey.get('sofia')!,
      documentId: documentIdByTitle.get('Safety: lock-out / tag-out')!,
      createdAt: ago(days(12)),
    },
    {
      companyId: company.id,
      type: 'ANNOUNCEMENT_POSTED',
      summary: 'Ada Whitfield posted an announcement: "We signed Meridian Tower"',
      actorId: membershipByKey.get('ada')!,
      createdAt: ago(days(2)),
    },
  ];
  await prisma.activityEvent.createMany({ data: events });

  // ----------------------------- notifications -----------------------------
  await prisma.notification.createMany({
    data: [
      {
        companyId: company.id,
        recipientId: membershipByKey.get('priya')!,
        actorId: membershipByKey.get('sofia')!,
        type: 'TASK_MENTIONED',
        title: 'Sofia Marchetti mentioned you',
        body: 'On "Replace HVAC filters — Building C": Units are all 4-inch depth.',
        entityType: 'task',
        entityId: blockedTaskId,
        taskId: blockedTaskId,
        createdAt: ago(hours(19)),
      },
      {
        companyId: company.id,
        recipientId: membershipByKey.get('ada')!,
        actorId: membershipByKey.get('sofia')!,
        type: 'TASK_BLOCKED',
        title: 'Blocked: Replace HVAC filters — Building C',
        body: 'Sofia Marchetti reported a blocker: the filter sizes do not match the units.',
        entityType: 'task',
        entityId: blockedTaskId,
        taskId: blockedTaskId,
        createdAt: ago(hours(20)),
      },
      {
        companyId: company.id,
        recipientId: membershipByKey.get('priya')!,
        actorId: membershipByKey.get('dmitri')!,
        type: 'TASK_STATUS_CHANGED',
        title: 'Ready for review: Fix leaking trap — Northbank Offices, 3rd floor washroom',
        body: 'Dmitri Volkov finished this and is waiting for approval.',
        entityType: 'task',
        entityId: taskIdByTitle.get('Fix leaking trap — Northbank Offices, 3rd floor washroom')!,
        taskId: taskIdByTitle.get('Fix leaking trap — Northbank Offices, 3rd floor washroom')!,
        createdAt: ago(hours(3)),
      },
      {
        companyId: company.id,
        recipientId: membershipByKey.get('lena')!,
        actorId: membershipByKey.get('marcus')!,
        type: 'TASK_ASSIGNED',
        title: 'New task: Deep clean — Harbourview Clinic reception',
        body: 'Due today.',
        entityType: 'task',
        entityId: taskIdByTitle.get('Deep clean — Harbourview Clinic reception')!,
        taskId: taskIdByTitle.get('Deep clean — Harbourview Clinic reception')!,
        createdAt: ago(days(1)),
      },
    ],
  });

  console.log('');
  console.log('  Northstar Facilities is ready.');
  console.log(
    `    ${PEOPLE.length} people · ${TEAMS.length} teams · ${TASKS.length} tasks · ${DOCUMENTS.length} documents`,
  );
  console.log('');
  console.log('  Sign in with any of these (see README for the full list):');
  console.log(`    Owner   : ${PEOPLE[0].email}  /  ${DEMO_PASSWORD}`);
  console.log(`    Manager : ${PEOPLE[1].email}  /  ${DEMO_PASSWORD}`);
  console.log(`    Worker  : ${PEOPLE[3].email}  /  ${DEMO_PASSWORD}`);
  console.log('');
  console.log('  Active invitation code: NORTHSTAR');
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
