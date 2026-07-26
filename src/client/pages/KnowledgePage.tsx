import { BookOpen, Plus, Search, X } from '@/components/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { DocumentEditor } from '@/components/knowledge/DocumentEditor';
import {
  Avatar,
  Chip,
  Button,
  Sheet,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/useQuery';
import { cn, relativeTime } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { KnowledgeDocumentSummary } from '@shared/types';

interface KnowledgeListResponse {
  items: KnowledgeDocumentSummary[];
  categories: { name: string; count: number }[];
}

export function KnowledgePage() {
  const { isLeadership } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery<KnowledgeListResponse>(
    (signal) => api.get('/knowledge', { search: debouncedSearch, category }, signal),
    [debouncedSearch, category],
  );

  useRealtimeEvent('knowledge:updated', () => query.refetch());

  const documents = query.data?.items ?? [];
  const categories = query.data?.categories ?? [];
  const hasFilters = Boolean(debouncedSearch || category);

  const requiredUnread = documents.filter(
    (document) => document.requiresAcknowledgment && !document.acknowledgedByMe,
  );

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="Knowledge base"
          title="How we do things here"
          description="Procedures, checklists, customer rules and the standards everybody is expected to follow."
          actions={
            isLeadership && (
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setEditorOpen(true)}
              >
                New document
              </Button>
            )
          }
        />

        {requiredUnread.length > 0 && (
          <Sheet className="border-pending/30 bg-pending-wash/60 px-4 py-3.5">
            <p className="text-[13px] font-medium text-pending">
              {requiredUnread.length} document{requiredUnread.length === 1 ? '' : 's'} still need
              your acknowledgment
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {requiredUnread.map((document) => (
                <Link
                  key={document.id}
                  to={`/app/knowledge/${document.id}`}
                  className="rounded-sm border border-pending/40 bg-sheet px-2 py-1 text-xs font-medium text-pending transition-colors hover:bg-pending-wash"
                >
                  {document.title}
                </Link>
              ))}
            </div>
          </Sheet>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, text, tags or owners…"
              aria-label="Search the knowledge base"
              className="h-9 pl-9"
            />
          </div>

          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter by category"
            className="h-9 w-auto min-w-[150px]"
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.count})
              </option>
            ))}
          </Select>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                setSearch('');
                setCategory('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {query.loading && !query.data && <SkeletonRows rows={4} />}
        {query.error && <ErrorState message={query.error} onRetry={query.refetch} />}

        {query.data && documents.length === 0 && (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title={hasFilters ? 'Nothing matches that search' : 'Your knowledge base is empty'}
            description={
              hasFilters
                ? 'Try a different word, or clear the category filter.'
                : 'Start with the thing people ask you about most often — an opening checklist, a customer rule, a safety step.'
            }
            action={
              hasFilters ? (
                <Button
                  onClick={() => {
                    setSearch('');
                    setCategory('');
                  }}
                >
                  Clear filters
                </Button>
              ) : isLeadership ? (
                <Button
                  variant="primary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setEditorOpen(true)}
                >
                  Write your first document
                </Button>
              ) : undefined
            }
          />
        )}

        {documents.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {documents.map((document) => (
              <Link
                key={document.id}
                to={`/app/knowledge/${document.id}`}
                className="sheet flex flex-col rounded-sm p-4 transition-colors hover:border-ink-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="edge-sm">{document.category}</p>
                    <h2 className="mt-1 text-sm font-semibold leading-snug text-ink">
                      {document.title}
                    </h2>
                  </div>
                  {document.status !== 'PUBLISHED' && (
                    <Chip className="shrink-0 border-rule bg-paper-deep text-ink-3">
                      {document.status === 'DRAFT' ? 'Draft' : 'Archived'}
                    </Chip>
                  )}
                </div>

                {document.excerpt && (
                  <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-relaxed text-ink-3">
                    {document.excerpt}
                  </p>
                )}

                {document.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {document.tags.slice(0, 4).map((tag) => (
                      <Chip key={tag}>#{tag}</Chip>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-rule pt-3">
                  {document.owner && (
                    <>
                      <Avatar
                        name={document.owner.fullName}
                        src={document.owner.avatarUrl}
                        size="xs"
                      />
                      <span className="truncate text-xs text-ink-3">{document.owner.fullName}</span>
                    </>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-ink-3">
                    v{document.version} · {relativeTime(document.updatedAt)}
                  </span>
                </div>

                {document.requiresAcknowledgment && (
                  <div
                    className={cn(
                      'mt-2 rounded-sm px-2 py-1 text-edge font-medium',
                      document.acknowledgedByMe
                        ? 'bg-done-wash text-done'
                        : 'bg-pending-wash text-pending',
                    )}
                  >
                    {document.acknowledgedByMe
                      ? 'You have acknowledged this'
                      : 'Required reading — needs your acknowledgment'}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </PageBody>

      <DocumentEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          query.refetch();
          toast.success('Document saved.');
        }}
      />
    </PageTransition>
  );
}
