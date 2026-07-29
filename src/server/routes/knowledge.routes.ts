import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../http/errors';
import { parsedQuery, validateBody, validateQuery } from '../http/validate';
import { currentAuth, requireAuth, requirePermission } from '../middleware/authenticate';
import { PERMISSIONS } from '../services/authorization';
import { uniqueSlug } from '../lib/ids';
import { prisma } from '../prisma';
import { emitToCompany } from '../realtime/io';
import { recordActivity } from '../services/activity';
import { notify } from '../services/notifications';
import { broadcastOrganizationChange } from '../services/organization';
import { isLeadership } from '../services/permissions';
import {
  serializeDocumentSummary,
  serializeTaskSummary,
  taskSummaryInclude,
} from '../services/serializers';
import type { KnowledgeDocumentDetail } from '../../shared/types';

export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth, requirePermission(PERMISSIONS.KNOWLEDGE_VIEW));

const summaryInclude = {
  owner: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
  team: { select: { id: true, name: true } },
  acknowledgments: true,
  _count: { select: { acknowledgments: true } },
} as const;

function excerptFrom(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 180);
}

const listQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(60).optional(),
  ownerId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

knowledgeRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const query = parsedQuery<z.infer<typeof listQuerySchema>>(res);

    const documents = await prisma.knowledgeDocument.findMany({
      where: {
        companyId: auth.companyId,
        archivedAt: null,
        // Workers only see published material; leadership also sees drafts.
        ...(isLeadership(auth)
          ? query.status
            ? { status: query.status }
            : {}
          : { status: 'PUBLISHED' }),
        ...(query.category ? { category: query.category } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.teamId ? { teamId: query.teamId } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { contentMarkdown: { contains: query.search, mode: 'insensitive' as const } },
                { excerpt: { contains: query.search, mode: 'insensitive' as const } },
                { tags: { has: query.search.toLowerCase() } },
                {
                  owner: {
                    user: { fullName: { contains: query.search, mode: 'insensitive' as const } },
                  },
                },
              ],
            }
          : {}),
      },
      include: summaryInclude,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const categories = await prisma.knowledgeDocument.groupBy({
      by: ['category'],
      where: { companyId: auth.companyId, archivedAt: null },
      _count: { _all: true },
    });

    res.json({
      items: documents.map((doc) => serializeDocumentSummary(doc, auth.membershipId)),
      categories: categories
        .map((row) => ({ name: row.category, count: row._count._all }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }),
);

knowledgeRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id: req.params.id, companyId: auth.companyId, archivedAt: null },
      include: {
        ...summaryInclude,
        people: {
          include: {
            membership: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
        revisions: {
          include: { editedBy: { include: { user: { select: { fullName: true } } } } },
          orderBy: { version: 'desc' },
          take: 20,
        },
        acknowledgments: {
          include: { membership: { include: { user: { select: { fullName: true } } } } },
        },
      },
    });

    if (!document) throw ApiError.notFound('That document no longer exists.');
    if (document.status !== 'PUBLISHED' && !isLeadership(auth)) {
      throw ApiError.forbidden('That document has not been published yet.');
    }

    const relatedTasks = await prisma.task.findMany({
      where: { documentId: document.id, archivedAt: null },
      include: taskSummaryInclude,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const detail: KnowledgeDocumentDetail = {
      ...serializeDocumentSummary(document, auth.membershipId),
      contentMarkdown: document.contentMarkdown,
      createdAt: document.createdAt.toISOString(),
      people: document.people.map((person) => ({
        id: person.membership.id,
        fullName: person.membership.user.fullName,
        role: person.role,
        avatarUrl: person.membership.user.avatarUrl,
      })),
      relatedTasks: relatedTasks.map(serializeTaskSummary),
      revisions: document.revisions.map((revision) => ({
        id: revision.id,
        version: revision.version,
        title: revision.title,
        changeNote: revision.changeNote,
        createdAt: revision.createdAt.toISOString(),
        editedBy: revision.editedBy
          ? { id: revision.editedBy.id, fullName: revision.editedBy.user.fullName }
          : null,
      })),
      acknowledgments: document.acknowledgments.map((ack) => ({
        id: ack.id,
        membershipId: ack.membershipId,
        fullName: ack.membership.user.fullName,
        acknowledgedAt: ack.acknowledgedAt.toISOString(),
      })),
    };

    res.json(detail);
  }),
);

const documentSchema = z.object({
  title: z.string().trim().min(2, 'Give the document a title').max(160),
  category: z.string().trim().min(1).max(80).default('General'),
  contentMarkdown: z.string().max(100_000).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  requiresAcknowledgment: z.boolean().default(false),
  ownerId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  peopleIds: z.array(z.string().min(1)).max(50).default([]),
  changeNote: z.string().trim().max(200).optional(),
});

knowledgeRouter.post(
  '/',
  requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE),
  validateBody(documentSchema),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const input = req.body as z.infer<typeof documentSchema>;

    const slug = await uniqueSlug(input.title, async (candidate) =>
      Boolean(
        await prisma.knowledgeDocument.findFirst({
          where: { companyId: auth.companyId, slug: candidate },
        }),
      ),
    );

    const document = await prisma.knowledgeDocument.create({
      data: {
        companyId: auth.companyId,
        title: input.title,
        slug,
        category: input.category,
        contentMarkdown: input.contentMarkdown,
        excerpt: excerptFrom(input.contentMarkdown),
        tags: input.tags.map((tag) => tag.toLowerCase()),
        status: input.status,
        requiresAcknowledgment: input.requiresAcknowledgment,
        ownerId: input.ownerId ?? auth.membershipId,
        teamId: input.teamId ?? null,
        revisions: {
          create: {
            version: 1,
            title: input.title,
            contentMarkdown: input.contentMarkdown,
            changeNote: input.changeNote ?? 'Created',
            editedById: auth.membershipId,
          },
        },
        people: {
          create: input.peopleIds.map((membershipId) => ({ membershipId, role: 'AUDIENCE' })),
        },
      },
      include: summaryInclude,
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'DOCUMENT_CREATED',
      summary: `${auth.fullName} created the "${document.title}" document`,
      actorId: auth.membershipId,
      documentId: document.id,
      teamId: document.teamId,
    });

    if (document.status === 'PUBLISHED') {
      await announceDocument(auth, document.id, document.title, document.requiresAcknowledgment);
    }

    emitToCompany(auth.companyId, 'knowledge:updated', { documentId: document.id });
    broadcastOrganizationChange(auth.companyId);
    res.status(201).json(serializeDocumentSummary(document, auth.membershipId));
  }),
);

async function announceDocument(
  auth: ReturnType<typeof currentAuth>,
  documentId: string,
  title: string,
  requiresAck: boolean,
) {
  const audience = await prisma.membership.findMany({
    where: { companyId: auth.companyId, deactivatedAt: null, id: { not: auth.membershipId } },
    select: { id: true },
  });
  for (const member of audience) {
    await notify({
      companyId: auth.companyId,
      recipientId: member.id,
      actorId: auth.membershipId,
      type: requiresAck ? 'DOCUMENT_ACK_REQUESTED' : 'DOCUMENT_PUBLISHED',
      title: requiresAck ? `Please read: ${title}` : `New in the knowledge base: ${title}`,
      body: requiresAck ? 'This document needs your acknowledgment.' : null,
      entityType: 'document',
      entityId: documentId,
    });
  }
}

knowledgeRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE),
  validateBody(documentSchema.partial()),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { id: req.params.id, companyId: auth.companyId, archivedAt: null },
    });
    if (!existing) throw ApiError.notFound('That document no longer exists.');

    const input = req.body as Partial<z.infer<typeof documentSchema>>;
    const contentChanged =
      input.contentMarkdown !== undefined && input.contentMarkdown !== existing.contentMarkdown;
    const titleChanged = input.title !== undefined && input.title !== existing.title;
    const nowPublished = input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

    const document = await prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.contentMarkdown !== undefined
          ? { contentMarkdown: input.contentMarkdown, excerpt: excerptFrom(input.contentMarkdown) }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags.map((tag) => tag.toLowerCase()) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.requiresAcknowledgment !== undefined
          ? { requiresAcknowledgment: input.requiresAcknowledgment }
          : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        // Every content change bumps the version and records a revision.
        ...(contentChanged || titleChanged ? { version: { increment: 1 } } : {}),
      },
      include: summaryInclude,
    });

    if (contentChanged || titleChanged) {
      await prisma.knowledgeRevision.create({
        data: {
          documentId: document.id,
          version: document.version,
          title: document.title,
          contentMarkdown: document.contentMarkdown,
          changeNote: input.changeNote ?? 'Updated',
          editedById: auth.membershipId,
        },
      });
      // A new version means old acknowledgments are stale.
      if (document.requiresAcknowledgment) {
        await prisma.knowledgeAcknowledgment.deleteMany({ where: { documentId: document.id } });
      }
    }

    if (input.peopleIds) {
      await prisma.knowledgeDocumentPerson.deleteMany({ where: { documentId: document.id } });
      await prisma.knowledgeDocumentPerson.createMany({
        data: input.peopleIds.map((membershipId) => ({
          documentId: document.id,
          membershipId,
          role: 'AUDIENCE' as const,
        })),
        skipDuplicates: true,
      });
    }

    await recordActivity({
      companyId: auth.companyId,
      type: 'DOCUMENT_UPDATED',
      summary: `${auth.fullName} updated "${document.title}"`,
      actorId: auth.membershipId,
      documentId: document.id,
      metadata: { version: document.version },
    });

    if (nowPublished) {
      await announceDocument(auth, document.id, document.title, document.requiresAcknowledgment);
    }

    emitToCompany(auth.companyId, 'knowledge:updated', { documentId: document.id });
    broadcastOrganizationChange(auth.companyId);
    res.json(serializeDocumentSummary(document, auth.membershipId));
  }),
);

knowledgeRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { id: req.params.id, companyId: auth.companyId, archivedAt: null },
    });
    if (!existing) throw ApiError.notFound('That document no longer exists.');
    await prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: { archivedAt: new Date(), status: 'ARCHIVED' },
    });
    emitToCompany(auth.companyId, 'knowledge:updated', {});
    broadcastOrganizationChange(auth.companyId);
    res.json({ ok: true });
  }),
);

knowledgeRouter.post(
  '/:id/acknowledge',
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const document = await prisma.knowledgeDocument.findFirst({
      where: {
        id: req.params.id,
        companyId: auth.companyId,
        archivedAt: null,
        status: 'PUBLISHED',
      },
    });
    if (!document) throw ApiError.notFound('That document is not available.');

    await prisma.knowledgeAcknowledgment.upsert({
      where: {
        documentId_membershipId: { documentId: document.id, membershipId: auth.membershipId },
      },
      update: { acknowledgedAt: new Date(), version: document.version },
      create: {
        documentId: document.id,
        membershipId: auth.membershipId,
        version: document.version,
      },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'DOCUMENT_ACKNOWLEDGED',
      summary: `${auth.fullName} acknowledged "${document.title}"`,
      actorId: auth.membershipId,
      documentId: document.id,
    });

    emitToCompany(auth.companyId, 'knowledge:updated', { documentId: document.id });
    res.json({ ok: true });
  }),
);

/** Restores an older revision as a new version. */
knowledgeRouter.post(
  '/:id/revisions/:revisionId/restore',
  requirePermission(PERMISSIONS.KNOWLEDGE_MANAGE),
  asyncHandler(async (req, res) => {
    const auth = currentAuth(req);
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id: req.params.id, companyId: auth.companyId, archivedAt: null },
    });
    if (!document) throw ApiError.notFound('That document no longer exists.');

    const revision = await prisma.knowledgeRevision.findFirst({
      where: { id: req.params.revisionId, documentId: document.id },
    });
    if (!revision) throw ApiError.notFound('That version no longer exists.');

    const updated = await prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: {
        title: revision.title,
        contentMarkdown: revision.contentMarkdown,
        excerpt: excerptFrom(revision.contentMarkdown),
        version: { increment: 1 },
      },
    });

    await prisma.knowledgeRevision.create({
      data: {
        documentId: document.id,
        version: updated.version,
        title: updated.title,
        contentMarkdown: updated.contentMarkdown,
        changeNote: `Restored version ${revision.version}`,
        editedById: auth.membershipId,
      },
    });

    await recordActivity({
      companyId: auth.companyId,
      type: 'DOCUMENT_UPDATED',
      summary: `${auth.fullName} restored version ${revision.version} of "${updated.title}"`,
      actorId: auth.membershipId,
      documentId: document.id,
    });

    emitToCompany(auth.companyId, 'knowledge:updated', { documentId: document.id });
    res.json({ ok: true, version: updated.version });
  }),
);
