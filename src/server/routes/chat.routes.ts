import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { validateBody } from '../http/validate';
import { currentAuth, requireAuth } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { emitToCompany, emitToMember } from '../realtime/io';

export const chatRouter = Router();
chatRouter.use(requireAuth);

const memberSelect = {
  id: true,
  user: { select: { fullName: true, avatarUrl: true } },
} as const;

const conversationInclude = {
  members: { include: { membership: { select: memberSelect } } },
  messages: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    include: { sender: { select: memberSelect } },
  },
} as const;

function serializeMember(member: { membership: { id: string; user: { fullName: string; avatarUrl: string | null } } }) {
  return { id: member.membership.id, fullName: member.membership.user.fullName, avatarUrl: member.membership.user.avatarUrl };
}

function serializeConversation(conversation: {
  id: string;
  kind: 'COMPANY' | 'DIRECT' | 'GROUP';
  title: string | null;
  updatedAt: Date;
  members: { membership: { id: string; user: { fullName: string; avatarUrl: string | null } } }[];
  messages: { body: string; createdAt: Date; sender: { id: string; user: { fullName: string; avatarUrl: string | null } } }[];
}) {
  const last = conversation.messages[0];
  return {
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    members: conversation.members.map(serializeMember),
    lastMessage: last
      ? {
          body: last.body,
          createdAt: last.createdAt.toISOString(),
          sender: { id: last.sender.id, fullName: last.sender.user.fullName, avatarUrl: last.sender.user.avatarUrl },
        }
      : null,
  };
}

function serializeMessage(message: {
  id: string;
  body: string;
  createdAt: Date;
  sender: { id: string; user: { fullName: string; avatarUrl: string | null } };
}) {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    sender: { id: message.sender.id, fullName: message.sender.user.fullName, avatarUrl: message.sender.user.avatarUrl },
  };
}

async function companyConversation(companyId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { companyId, kind: 'COMPANY' },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { companyId, kind: 'COMPANY', title: 'Company chat' } });
}

async function accessibleConversation(id: string, membershipId: string, companyId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id,
      companyId,
      OR: [{ kind: 'COMPANY' }, { members: { some: { membershipId } } }],
    },
  });
  if (!conversation) throw ApiError.notFound('That conversation is not available.');
  return conversation;
}

chatRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    await companyConversation(auth.companyId);
    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: auth.companyId,
        OR: [{ kind: 'COMPANY' }, { members: { some: { membershipId: auth.membershipId } } }],
      },
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ items: conversations.map(serializeConversation) });
  }),
);

chatRouter.post(
  '/conversations',
  validateBody(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('DIRECT'), memberId: z.string().min(1) }),
      z.object({ kind: z.literal('GROUP'), title: z.string().trim().min(1).max(80), memberIds: z.array(z.string().min(1)).min(2).max(49) }),
    ]),
  ),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as
      | { kind: 'DIRECT'; memberId: string }
      | { kind: 'GROUP'; title: string; memberIds: string[] };
    const ids = [...new Set([auth.membershipId, ...(input.kind === 'DIRECT' ? [input.memberId] : input.memberIds)])];
    if (ids.length < 2) throw ApiError.badRequest('Choose at least one other person.');

    const active = await prisma.membership.findMany({
      where: { id: { in: ids }, companyId: auth.companyId, status: 'ACTIVE', deactivatedAt: null },
      select: { id: true },
    });
    if (active.length !== ids.length) throw ApiError.badRequest('Everyone in a chat must be an active company member.');

    if (input.kind === 'DIRECT') {
      const candidates = await prisma.conversation.findMany({
        where: { companyId: auth.companyId, kind: 'DIRECT', members: { some: { membershipId: auth.membershipId } } },
        include: { members: true },
      });
      const existing = candidates.find(
        (conversation) => conversation.members.length === 2 && conversation.members.some((member) => member.membershipId === input.memberId),
      );
      if (existing) {
        const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: existing.id }, include: conversationInclude });
        res.json({ conversation: serializeConversation(conversation) });
        return;
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        companyId: auth.companyId,
        kind: input.kind,
        title: input.kind === 'GROUP' ? input.title : null,
        creatorId: auth.membershipId,
        members: { create: ids.map((membershipId) => ({ membershipId })) },
      },
      include: conversationInclude,
    });
    for (const membershipId of ids) emitToMember(membershipId, 'chat:conversation', { conversationId: conversation.id });
    res.status(201).json({ conversation: serializeConversation(conversation) });
  }),
);

chatRouter.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    await accessibleConversation(req.params.id, auth.membershipId, auth.companyId);
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: req.params.id },
      include: { sender: { select: memberSelect } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json({ items: messages.map(serializeMessage) });
  }),
);

chatRouter.post(
  '/conversations/:id/messages',
  validateBody(z.object({ body: z.string().trim().min(1).max(4_000) })),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const conversation = await accessibleConversation(req.params.id, auth.membershipId, auth.companyId);
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: { conversationId: conversation.id, senderId: auth.membershipId, body: req.body.body },
        include: { sender: { select: memberSelect } },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      await tx.conversationMember.updateMany({
        where: { conversationId: conversation.id, membershipId: auth.membershipId },
        data: { lastReadAt: new Date() },
      });
      return created;
    });
    const payload = { conversationId: conversation.id, message: serializeMessage(message) };
    if (conversation.kind === 'COMPANY') emitToCompany(auth.companyId, 'chat:message', payload);
    else {
      const members = await prisma.conversationMember.findMany({ where: { conversationId: conversation.id }, select: { membershipId: true } });
      for (const member of members) emitToMember(member.membershipId, 'chat:message', payload);
    }
    res.status(201).json({ message: payload.message });
  }),
);
