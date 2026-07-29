import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, Pencil } from '@/components/icons';
import { Markdown } from './Markdown';
import { Button, Checkbox, Field, InlineError, Input, Select, Textarea, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { cn } from '@/lib/utils';
import type { KnowledgeDocumentDetail, PersonSummary, TeamDto } from '@shared/types';

const CATEGORIES = [
  'Procedures',
  'Checklists',
  'Customer Rules',
  'Safety',
  'Onboarding',
  'Company Values',
  'General',
];

const STARTER = `## When to use this

Say who this is for and when they need it.

## Steps

1. First step.
2. Second step.
3. Third step.

> Anything that must never happen goes in a quote like this.
`;

/** A distraction-free, document-first workspace for creating company knowledge. */
export function DocumentEditor({
  open,
  document: existingDocument,
  onClose,
  onSaved,
}: {
  open: boolean;
  document?: KnowledgeDocumentDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    contentMarkdown: STARTER,
    tags: '',
    status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED',
    requiresAcknowledgment: false,
    ownerId: '',
    teamId: '',
    changeNote: '',
  });

  const people = useQuery<{ items: PersonSummary[] }>(
    (signal) => (open ? api.get('/people', undefined, signal) : Promise.resolve({ items: [] })),
    [open],
  );
  const teams = useQuery<{ items: TeamDto[] }>(
    (signal) => open ? api.get('/organization/teams', undefined, signal) : Promise.resolve({ items: [] }),
    [open],
  );

  useEffect(() => {
    if (!open) return;
    setMode('write');
    setError(null);
    setForm({
      title: existingDocument?.title ?? '',
      category: existingDocument?.category ?? CATEGORIES[0],
      contentMarkdown: existingDocument?.contentMarkdown ?? STARTER,
      tags: existingDocument?.tags.join(', ') ?? '',
      status: (existingDocument?.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED') as 'DRAFT' | 'PUBLISHED',
      requiresAcknowledgment: existingDocument?.requiresAcknowledgment ?? false,
      ownerId: existingDocument?.owner?.id ?? '',
      teamId: existingDocument?.team?.id ?? '',
      changeNote: '',
    });
  }, [open, existingDocument]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      category: form.category,
      contentMarkdown: form.contentMarkdown,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      status: form.status,
      requiresAcknowledgment: form.requiresAcknowledgment,
      ownerId: form.ownerId || null,
      teamId: form.teamId || null,
      changeNote: form.changeNote || undefined,
    };
    try {
      if (existingDocument) await api.patch(`/knowledge/${existingDocument.id}`, payload);
      else await api.post('/knowledge', payload);
      onSaved();
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={existingDocument ? `Edit ${existingDocument.title}` : 'New document'}
      className="fixed inset-0 z-[60] flex flex-col bg-paper"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-sheet px-3 sm:px-5">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onClose}>
          <span className="hidden sm:inline">Knowledge base</span>
        </Button>
        <span className="hidden h-5 w-px bg-rule sm:block" />
        <p className="truncate text-[13px] font-medium text-ink-2">
          {existingDocument ? `Editing version ${existingDocument.version + 1}` : 'New knowledge document'}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-ink-3 md:block">Changes save as a new version</span>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!form.title.trim()} onClick={() => void save()}>
            {existingDocument ? 'Save version' : 'Create document'}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-paper-deep/50">
        <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:py-8">
          <main className="min-w-0 border border-edge bg-sheet shadow-panel">
            <div className="border-b border-rule px-5 py-4 sm:px-10 sm:py-6">
              <Input
                id="doc-title"
                autoFocus
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Untitled document"
                aria-label="Document title"
                className="h-auto border-0 bg-transparent px-0 py-0 text-[25px] font-semibold tracking-tight shadow-none placeholder:text-ink-4 focus:ring-0 sm:text-[34px]"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                <div className="flex rounded-sm border border-edge bg-paper p-0.5">
                  {[
                    { value: 'write' as const, label: 'Write', icon: Pencil },
                    { value: 'preview' as const, label: 'Preview', icon: Eye },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMode(option.value)}
                      aria-pressed={mode === option.value}
                      className={cn(
                        'edge-sm inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors',
                        mode === option.value ? 'bg-ink text-white shadow-sm' : 'text-ink-3 hover:text-ink',
                      )}
                    >
                      <option.icon className="text-[12px]" />
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-3">Markdown supported</p>
              </div>
            </div>

            <div className="px-5 py-5 sm:px-10 sm:py-8">
              {error && <InlineError message={error} className="mb-5" />}
              {mode === 'write' ? (
                <Textarea
                  value={form.contentMarkdown}
                  onChange={(event) => setForm({ ...form, contentMarkdown: event.target.value })}
                  aria-label="Document content, Markdown"
                  className="min-h-[calc(100vh-255px)] resize-none border-0 bg-transparent px-0 py-0 font-mono text-[13px] leading-[1.85] shadow-none focus:ring-0"
                />
              ) : (
                <div className="prose-sheet min-h-[calc(100vh-255px)]">
                  {form.contentMarkdown.trim() ? (
                    <Markdown source={form.contentMarkdown} />
                  ) : (
                    <p className="text-[13px] text-ink-4">Nothing to preview yet.</p>
                  )}
                </div>
              )}
            </div>
          </main>

          <aside className="space-y-4 self-start border border-edge bg-sheet p-4 shadow-sm lg:sticky lg:top-0">
            <div>
              <p className="edge-sm">Document details</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Set where this belongs and who keeps it current.
              </p>
            </div>
            <Field label="Category" htmlFor="doc-category">
              <Select id="doc-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </Select>
            </Field>
            <Field label="Tags" htmlFor="doc-tags" hint="Comma separated.">
              <Input id="doc-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="opening, cleaning, daily" />
            </Field>
            <Field label="Owner" htmlFor="doc-owner" hint="Who keeps this accurate.">
              <Select id="doc-owner" value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}>
                <option value="">Me</option>
                {(people.data?.items ?? []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </Select>
            </Field>
            <Field label="Team" htmlFor="doc-team">
              <Select id="doc-team" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>
                <option value="">No team</option>
                {(teams.data?.items ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </Select>
            </Field>
            {existingDocument && (
              <Field label="What changed" htmlFor="doc-change" hint="Shown in history.">
                <Input id="doc-change" value={form.changeNote} onChange={(event) => setForm({ ...form, changeNote: event.target.value })} placeholder="Added the vent step" />
              </Field>
            )}
            <div className="space-y-3 border-t border-rule pt-4">
              <Checkbox checked={form.status === 'PUBLISHED'} onChange={(event) => setForm({ ...form, status: event.target.checked ? 'PUBLISHED' : 'DRAFT' })} label="Publish to company" description="Drafts are only visible to owners and managers." />
              <Checkbox checked={form.requiresAcknowledgment} onChange={(event) => setForm({ ...form, requiresAcknowledgment: event.target.checked })} label="Require acknowledgment" description="People will re-read it after each edit." />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
