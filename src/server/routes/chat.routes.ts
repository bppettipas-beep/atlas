import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { emitToCompany, emitToMember } from '../realtime/io';

export const chatRouter = Router();
chatRouter.use(requireAuth);

const person = { id: true, user: { select: { fullName: true, avatarUrl: true } } } as const;
const conversationInclude = {
  members: { include: { membership: { select: person } } },
  messages: { take: 1, orderBy: { createdAt: 'desc' as const }, include: { sender: { select: person } } },
} as const;

function member(row: { membership: { id: string; user: { fullName: string; avatarUrl: string | null } } }) {
  return { id: row.membership.id, fullName: row.membership.user.fullName, avatarUrl: row.membership.user.avatarUrl };
}

function conversation(row: {
  id: string; kind: 'COMPANY' | 'DIRECT' | 'GROUP'; title: string | null; updatedAt: Date;
  members: { membership: { id: string; user: { fullName: string; avatarUrl: string | null } } }[];
  messages: { body: string; createdAt: Date; sender: { id: string; user: { fullName: string; avatarUrl: string | null } } }[];
}) {
  const latest = row.messages[0];
  return {
    id: row.id, kind: row.kind, title: row.title, updatedAt: row.updatedAt.toISOString(),
    members: row.members.map(member),
    lastMessage: latest ? { body: latest.body, createdAt: latest.createdAt.toISOString(), sender: { id: latest.sender.id, fullName: latest.sender.user.fullName, avatarUrl: latest.sender.user.avatarUrl } } : null,
  };
}

function message(row: { id: string; body: string; createdAt: Date; sender: { id: string; user: { fullName: string; avatarUrl: string | null } } }) {
  return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString(), sender: { id: row.sender.id, fullName: row.sender.user.fullName, avatarUrl: row.sender.user.avatarUrl } };
}

async function ensureCompanyRoom(companyId: string) {
  const existing = await prisma.conversation.findFirst({ where: { companyId, kind: 'COMPANY' }, orderBy: { createdAt: 'asc' } });
  return existing ?? prisma.conversation.create({ data: { companyId, kind: 'COMPANY', title: 'Company chat' } });
}

async function readConversation(id: string, companyId: string, membershipId: string) {
  const row = await prisma.conversation.findFirst({ where: { id, companyId, OR: [{ kind: 'COMPANY' }, { members: { some: { membershipId } } }] } });
  if (!row) throw ApiError.notFound('That conversation is not available.');
  return row;
}

chatRouter.get('/conversations', asyncHandler(async (req, res) => {
  const auth = currentAuth(req);
  await ensureCompanyRoom(auth.companyId);
  const rows = await prisma.conversation.findMany({
    where: { companyId: auth.companyId, OR: [{ kind: 'COMPANY' }, { members: { some: { membershipId: auth.membershipId } } }] },
    include: conversationInclude,
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ items: rows.map(conversation) });
}));

chatRouter.post('/conversations', validateBody(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DIRECT'), memberId: z.string().min(1) }),
  z.object({ kind: z.literal('GROUP'), title: z.string().trim().min(1).max(80), memberIds: z.array(z.string().min(1)).min(2).max(49) }),
])), asyncHandler(async (req, res) => {
  const auth = currentAuth(req);
  const input = req.body as { kind: 'DIRECT'; memberId: string } | { kind: 'GROUP'; title: string; memberIds: string[] };
  const memberIds = [...new Set([auth.membershipId, ...(input.kind === 'DIRECT' ? [input.memberId] : input.memberIds)])];
  if (memberIds.length < 2) throw ApiError.badRequest('Choose at least one other active company member.');
  const active = await prisma.membership.count({ where: { id: { in: memberIds }, companyId: auth.companyId, status: 'ACTIVE', deactivatedAt: null } });
  if (active !== memberIds.length) throw ApiError.badRequest('Everyone in a chat must be an active company member.');

  if (input.kind === 'DIRECT') {
    const candidates = await prisma.conversation.findMany({ where: { companyId: auth.companyId, kind: 'DIRECT', members: { some: { membershipId: auth.membershipId } } }, include: { members: true } });
    const existing = candidates.find((item) => item.members.length === 2 && item.members.some((entry) => entry.membershipId === input.memberId));
    if (existing) {
      const row = await prisma.conversation.findUniqueOrThrow({ where: { id: existing.id }, include: conversationInclude });
      res.json({ conversation: conversation(row) });
      return;
    }
  }

  const row = await prisma.conversation.create({
    data: { companyId: auth.companyId, kind: input.kind, title: input.kind === 'GROUP' ? input.title : null, creatorId: auth.membershipId, members: { create: memberIds.map((membershipId) => ({ membershipId })) } },
    include: conversationInclude,
  });
  for (const membershipId of memberIds) emitToMember(membershipId, 'chat:conversation', { conversationId: row.id });
  res.status(201).json({ conversation: conversation(row) });
}));

chatRouter.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const auth = currentAuth(req);
  await readConversation(req.params.id, auth.companyId, auth.membershipId);
  const rows = await prisma.chatMessage.findMany({ where: { conversationId: req.params.id }, include: { sender: { select: person } }, orderBy: { createdAt: 'asc' }, take: 200 });
  res.json({ items: rows.map(message) });
}));

chatRouter.post('/conversations/:id/messages', validateBody(z.object({ body: z.string().trim().min(1).max(4_000) })), asyncHandler(async (req, res) => {
  const auth = currentAuth(req);
  const room = await readConversation(req.params.id, auth.companyId, auth.membershipId);
  const created = await prisma.chatMessage.create({ data: { conversationId: room.id, senderId: auth.membershipId, body: req.body.body }, include: { sender: { select: person } } });
  await prisma.conversation.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
  const payload = { conversationId: room.id, message: message(created) };
  if (room.kind === 'COMPANY') {
    emitToCompany(auth.companyId, 'chat:message', payload);
  } else {
    const members = await prisma.conversationMember.findMany({ where: { conversationId: room.id }, select: { membershipId: true } });
    for (const member of members) emitToMember(member.membershipId, 'chat:message', payload);
  }
  res.status(201).json({ message: payload.message });
}));
