import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { generateInviteCode } from '../lib/ids';
import { prisma } from '../prisma';
import { recordActivity } from '../services/activity';
import { serializeInviteCode } from '../services/serializers';
import type { CompanyRole, DirectInviteDto } from '../../shared/types';
import { PERMISSIONS } from '../services/authorization';

export const invitesRouter = Router();

// Invitation codes are secrets: only owners and managers may read or write
// them. Workers hitting these routes get a 403 from the server, not just a
// hidden button in the UI.
invitesRouter.use(requireAuth, requirePermission(PERMISSIONS.INVITES_MANAGE));

const createSchema = z.object({
  label: z.string().trim().max(80).optional().or(z.literal('')),
  role: z.enum(['MANAGER', 'WORKER']).default('WORKER'),
  teamId: z.string().min(1).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  maxUses: z.coerce.number().int().min(1).max(500).nullable().optional(),
});

async function assertTeamInCompany(teamId: string | null | undefined, companyId: string) {
  if (!teamId) return null;
  const team = await prisma.team.findFirst({ where: { id: teamId, companyId, archivedAt: null } });
  if (!team) throw ApiError.badRequest('That team does not exist in your company.');
  return team.id;
}

invitesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const codes = await prisma.inviteCode.findMany({
      where: { companyId: auth.companyId },
      include: { team: { select: { name: true } } },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ items: codes.map(serializeInviteCode) });
  }),
);

invitesRouter.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof createSchema>;

    // Managers must not be able to mint owner-level or manager-level access.
    if (auth.rankPosition >= 4 && input.role === 'MANAGER') {
      throw ApiError.forbidden('Only the owner can invite managers.');
    }
    if (input.expiresAt && input.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('Choose an expiry date in the future.');
    }

    const teamId = await assertTeamInCompany(input.teamId, auth.companyId);

    // Extremely unlikely to collide, but retry rather than 500 if it does.
    let code = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await prisma.inviteCode.findUnique({ where: { code } });
      if (!clash) break;
      code = generateInviteCode();
    }

    const invite = await prisma.inviteCode.create({
      data: {
        companyId: auth.companyId,
        code,
        label: input.label || null,
        role: input.role,
        teamId,
        expiresAt: input.expiresAt ?? null,
        maxUses: input.maxUses ?? null,
        createdById: auth.membershipId,
      },
      include: { team: { select: { name: true } } },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'INVITE_CREATED',
      summary: `${auth.fullName} created an invitation code`,
      actorId: auth.membershipId,
      visibility: 'MANAGERS',
      metadata: { inviteCodeId: invite.id, role: invite.role },
    });

    res.status(201).json(serializeInviteCode(invite));
  }),
);

invitesRouter.patch(
  '/:id',
  validateBody(
    z.object({
      active: z.boolean().optional(),
      label: z.string().trim().max(80).nullable().optional(),
      expiresAt: z.coerce.date().nullable().optional(),
      maxUses: z.coerce.number().int().min(1).max(500).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.inviteCode.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!existing) throw ApiError.notFound('That invitation code no longer exists.');

    const invite = await prisma.inviteCode.update({
      where: { id: existing.id },
      data: req.body as Record<string, unknown>,
      include: { team: { select: { name: true } } },
    });
    res.json(serializeInviteCode(invite));
  }),
);

/** Deactivates the old code and issues a replacement with the same settings. */
invitesRouter.post(
  '/:id/regenerate',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.inviteCode.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!existing) throw ApiError.notFound('That invitation code no longer exists.');

    const invite = await prisma.$transaction(async (tx) => {
      await tx.inviteCode.update({ where: { id: existing.id }, data: { active: false } });
      return tx.inviteCode.create({
        data: {
          companyId: existing.companyId,
          code: generateInviteCode(),
          label: existing.label,
          role: existing.role,
          teamId: existing.teamId,
          expiresAt: existing.expiresAt,
          maxUses: existing.maxUses,
          createdById: auth.membershipId,
        },
        include: { team: { select: { name: true } } },
      });
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'INVITE_CREATED',
      summary: `${auth.fullName} regenerated an invitation code`,
      actorId: auth.membershipId,
      visibility: 'MANAGERS',
    });

    res.status(201).json(serializeInviteCode(invite));
  }),
);

invitesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.inviteCode.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!existing) throw ApiError.notFound('That invitation code no longer exists.');
    await prisma.inviteCode.update({ where: { id: existing.id }, data: { active: false } });
    res.json({ ok: true });
  }),
);

// --------------------------- direct invites --------------------------------

function serializeDirectInvite(invite: {
  id: string;
  email: string;
  role: CompanyRole;
  jobTitle: string | null;
  teamId: string | null;
  team: { name: string } | null;
  inviteCode: { code: string } | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): DirectInviteDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    jobTitle: invite.jobTitle,
    teamId: invite.teamId,
    teamName: invite.team?.name ?? null,
    code: invite.inviteCode?.code ?? null,
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

invitesRouter.get(
  '/direct/list',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const invites = await prisma.directInvite.findMany({
      where: { companyId: auth.companyId },
      include: { team: { select: { name: true } }, inviteCode: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: invites.map(serializeDirectInvite) });
  }),
);

invitesRouter.post(
  '/direct',
  validateBody(
    z.object({
      email: z.string().trim().email('Enter a valid email address').toLowerCase(),
      role: z.enum(['MANAGER', 'WORKER']).default('WORKER'),
      jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
      teamId: z.string().min(1).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as {
      email: string;
      role: 'MANAGER' | 'WORKER';
      jobTitle?: string;
      teamId?: string | null;
    };

    if (auth.rankPosition >= 4 && input.role === 'MANAGER') {
      throw ApiError.forbidden('Only the owner can invite managers.');
    }

    const alreadyMember = await prisma.membership.findFirst({
      where: { companyId: auth.companyId, user: { email: input.email }, deactivatedAt: null },
    });
    if (alreadyMember) {
      throw ApiError.conflict('That person is already in your company.', 'ALREADY_MEMBER');
    }

    const teamId = await assertTeamInCompany(input.teamId, auth.companyId);

    // Each direct invite carries its own single-use code, so it can be revoked
    // without affecting anybody else's invitation.
    const code = await prisma.inviteCode.create({
      data: {
        companyId: auth.companyId,
        code: generateInviteCode(),
        label: `Direct invite — ${input.email}`,
        role: input.role,
        teamId,
        maxUses: 1,
        createdById: auth.membershipId,
      },
    });

    const invite = await prisma.directInvite.upsert({
      where: { companyId_email: { companyId: auth.companyId, email: input.email } },
      update: {
        role: input.role,
        jobTitle: input.jobTitle || null,
        teamId,
        inviteCodeId: code.id,
        revokedAt: null,
        acceptedAt: null,
      },
      create: {
        companyId: auth.companyId,
        email: input.email,
        role: input.role,
        jobTitle: input.jobTitle || null,
        teamId,
        inviteCodeId: code.id,
      },
      include: { team: { select: { name: true } }, inviteCode: { select: { code: true } } },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'INVITE_CREATED',
      summary: `${auth.fullName} invited ${input.email}`,
      actorId: auth.membershipId,
      visibility: 'MANAGERS',
    });

    res.status(201).json(serializeDirectInvite(invite));
  }),
);

invitesRouter.delete(
  '/direct/:id',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const invite = await prisma.directInvite.findFirst({
      where: { id: req.params.id, companyId: auth.companyId },
    });
    if (!invite) throw ApiError.notFound('That invitation no longer exists.');

    await prisma.$transaction(async (tx) => {
      await tx.directInvite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
      });
      if (invite.inviteCodeId) {
        await tx.inviteCode.update({
          where: { id: invite.inviteCodeId },
          data: { active: false },
        });
      }
    });

    res.json({ ok: true });
  }),
);
