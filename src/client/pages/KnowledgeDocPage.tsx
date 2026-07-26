import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Pencil, SealCheck, Trash, Undo } from '@/components/icons';
import { DocumentEditor } from '@/components/knowledge/DocumentEditor';
import { Markdown } from '@/components/knowledge/Markdown';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import {
  Avatar,
  Button,
  Chip,
  ErrorState,
  LoadingState,
  Notice,
  RuledHead,
  Sheet,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { STATUS_META, cn, formatDate, relativeTime } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { KnowledgeDocumentDetail } from '@shared/types';

export function KnowledgeDocPage() {
  const { id } = useParams<{ id: string }>();
  const { isLeadership } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [acking, setAcking] = useState(false);

  const query = useQuery<KnowledgeDocumentDetail>(
    (signal) => api.get(`/knowledge/${id}`, undefined, signal),
    [id],
  );

  useRealtimeEvent('knowledge:updated', () => query.refetch());

  const document = query.data;

  const acknowledge = async () => {
    if (!document) return;
    setAcking(true);
    try {
      await api.post(`/knowledge/${document.id}/acknowledge`);
      query.refetch();
      toast.success('Acknowledged. Your manager can see it.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAcking(false);
    }
  };

  const archive = async () => {
    if (!document) return;
    try {
      await api.delete(`/knowledge/${document.id}`);
      toast.success('Document archived.');
      navigate('/app/knowledge');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const restore = async (revisionId: string, version: number) => {
    if (!document) return;
    try {
      await api.post(`/knowledge/${document.id}/revisions/${revisionId}/restore`);
      query.refetch();
      toast.success(`Restored version ${version}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <PageTransition>
      <PageBody className="max-w-[1080px]">
        <Link
          to="/app/knowledge"
          className="edge-sm inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="text-[12px]" />
          Knowledge base
        </Link>

        {query.loading && !document && <LoadingState label="Opening document" />}
        {query.error && <ErrorState message={query.error} onRetry={query.refetch} />}

        {document && (
          <>
            {/* --------------------------- title block --------------------- */}
            <header className="border-b border-edge pb-6">
              <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                <div className="min-w-0">
                  <p className="edge-sm mb-2">
                    {document.category} · Version {document.version}
                  </p>
                  <h1 className="display text-[26px] leading-[1.08] sm:text-[34px]">
                    {document.title}
                  </h1>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {document.status !== 'PUBLISHED' && (
                      <Chip className="border-pending/35 text-pending">
                        {document.status === 'DRAFT' ? 'Draft' : 'Archived'}
                      </Chip>
                    )}
                    {document.team && <Chip>{document.team.name}</Chip>}
                    {document.tags.map((tag) => (
                      <Chip key={tag}>#{tag}</Chip>
                    ))}
                  </div>
                </div>

                {isLeadership && (
                  <div className="flex shrink-0 gap-2">
                    <Button icon={<Pencil />} onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Trash />}
                      className="text-ink-3 hover:text-alert"
                      onClick={() => void archive()}
                    >
                      Archive
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-ink-3">
                {document.owner && (
                  <span className="inline-flex items-center gap-2">
                    <Avatar
                      name={document.owner.fullName}
                      src={document.owner.avatarUrl}
                      size="xs"
                    />
                    Owned by {document.owner.fullName}
                  </span>
                )}
                <span>Updated {relativeTime(document.updatedAt)}</span>
                {document.requiresAcknowledgment && (
                  <span className="font-mono text-[11px]">
                    {String(document.acknowledgmentCount).padStart(2, '0')} acknowledged
                  </span>
                )}
              </div>
            </header>

            {/* ------------------------ acknowledgment bar ------------------ */}
            {document.requiresAcknowledgment && (
              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 border px-4 py-3',
                  document.acknowledgedByMe
                    ? 'border-done/30 bg-done-wash'
                    : 'border-pending/35 bg-pending-wash',
                )}
              >
                <p className="flex items-center gap-2 text-[13px]">
                  {document.acknowledgedByMe ? (
                    <>
                      <SealCheck className="text-[15px] text-done" />
                      <span className="text-ink-2">
                        You acknowledged this. It is on your record.
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-2">
                      <strong className="font-semibold text-ink">Required reading.</strong> Read it,
                      then confirm you have.
                    </span>
                  )}
                </p>
                {!document.acknowledgedByMe && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Check />}
                    loading={acking}
                    onClick={() => void acknowledge()}
                  >
                    I have read this
                  </Button>
                )}
              </div>
            )}

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
              <article>
                <Markdown source={document.contentMarkdown} className="prose-sheet" />
              </article>

              {/* ----------------------------- margin ---------------------- */}
              <aside className="space-y-8 lg:border-l lg:border-rule lg:pl-6">
                {document.relatedTasks.length > 0 && (
                  <section>
                    <RuledHead title="Work using this" className="mb-3" />
                    <ul className="space-y-1.5">
                      {document.relatedTasks.map((task) => (
                        <li key={task.id}>
                          <Link
                            to={`/app/work?task=${task.id}`}
                            className="flex items-start gap-2 py-1 text-[12.5px] leading-snug text-ink-2 transition-colors hover:text-ink"
                          >
                            <span
                              className={cn(
                                'mt-[6px] h-[5px] w-[5px] shrink-0',
                                STATUS_META[task.status].dot,
                              )}
                            />
                            {task.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {document.people.length > 0 && (
                  <section>
                    <RuledHead title="Who this is for" className="mb-3" />
                    <div className="flex flex-wrap gap-1.5">
                      {document.people.map((person) => (
                        <Chip key={person.id}>{person.fullName}</Chip>
                      ))}
                    </div>
                  </section>
                )}

                {document.requiresAcknowledgment && document.acknowledgments.length > 0 && (
                  <section>
                    <RuledHead
                      title="Acknowledged by"
                      meta={String(document.acknowledgments.length).padStart(2, '0')}
                      className="mb-3"
                    />
                    <ul className="space-y-1.5">
                      {document.acknowledgments.map((ack) => (
                        <li
                          key={ack.id}
                          className="flex items-baseline justify-between gap-2 text-[12.5px]"
                        >
                          <span className="text-ink-2">{ack.fullName}</span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-4">
                            {formatDate(ack.acknowledgedAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <RuledHead title="Edit history" className="mb-3" />
                  <ol className="space-y-3">
                    {document.revisions.map((revision) => (
                      <li key={revision.id} className="text-[12.5px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[11px] text-ink-3">
                            v{revision.version}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-4">
                            {relativeTime(revision.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-ink-2">{revision.changeNote ?? 'Updated'}</p>
                        <p className="text-[11px] text-ink-4">
                          {revision.editedBy?.fullName ?? 'Someone'}
                        </p>
                        {isLeadership && revision.version !== document.version && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Undo />}
                            className="mt-1 h-6 px-1.5"
                            onClick={() => void restore(revision.id, revision.version)}
                          >
                            Restore
                          </Button>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>

                {!isLeadership && (
                  <Notice tone="info">
                    Spotted something out of date? Tell {document.owner?.fullName ?? 'your manager'}{' '}
                    — they own this document.
                  </Notice>
                )}
              </aside>
            </div>

            <Sheet className="px-4 py-3">
              <p className="text-[12px] text-ink-3">
                Created {formatDate(document.createdAt)} · Last updated{' '}
                {formatDate(document.updatedAt)} · Version {document.version}
              </p>
            </Sheet>

            <DocumentEditor
              open={editing}
              document={document}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                query.refetch();
                toast.success('Document saved.');
              }}
            />
          </>
        )}
      </PageBody>
    </PageTransition>
  );
}
