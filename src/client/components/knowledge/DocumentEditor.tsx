import { useEffect, useState } from 'react';
import { Eye, Pencil } from '@/components/icons';
import { Markdown } from './Markdown';
import {
  Button,
  Checkbox,
  Field,
  InlineError,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
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

/**
 * Write and edit a knowledge document.
 *
 * Editing is a modal rather than a page because it is a short, protected task
 * that people start from a list and expect to return from. Write and Preview
 * are tabs on the same field, not a split pane — a split pane halves the
 * writing measure on a laptop for a benefit nobody asked for.
 */
export function DocumentEditor({
  open,
  document,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Pass a document to edit it; omit to create a new one. */
  document?: KnowledgeDocumentDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    (signal) =>
      open ? api.get('/organization/teams', undefined, signal) : Promise.resolve({ items: [] }),
    [open],
  );

  useEffect(() => {
    if (!open) return;
    setMode('write');
    setError(null);
    setFieldErrors({});
    setForm({
      title: document?.title ?? '',
      category: document?.category ?? CATEGORIES[0],
      contentMarkdown: document?.contentMarkdown ?? STARTER,
      tags: document?.tags.join(', ') ?? '',
      status: (document?.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED') as 'DRAFT' | 'PUBLISHED',
      requiresAcknowledgment: document?.requiresAcknowledgment ?? false,
      ownerId: document?.owner?.id ?? '',
      teamId: document?.team?.id ?? '',
      changeNote: '',
    });
  }, [open, document]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const payload = {
      title: form.title,
      category: form.category,
      contentMarkdown: form.contentMarkdown,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: form.status,
      requiresAcknowledgment: form.requiresAcknowledgment,
      ownerId: form.ownerId || null,
      teamId: form.teamId || null,
      changeNote: form.changeNote || undefined,
    };
    try {
      if (document) await api.patch(`/knowledge/${document.id}`, payload);
      else await api.post('/knowledge', payload);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={document ? `Edit "${document.title}"` : 'New document'}
      description={
        document
          ? `Saving creates version ${document.version + 1}. The previous version is kept.`
          : 'Write down something people keep asking you about.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!form.title.trim()}
            onClick={() => void save()}
          >
            {document ? 'Save version' : 'Create document'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <InlineError message={error} />}

        <Field label="Title" htmlFor="doc-title" error={fieldErrors.title} required>
          <Input
            id="doc-title"
            autoFocus
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Opening checklist — office contracts"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="doc-category">
            <Select
              id="doc-category"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </Select>
          </Field>

          <Field label="Tags" htmlFor="doc-tags" hint="Comma separated.">
            <Input
              id="doc-tags"
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              placeholder="opening, cleaning, daily"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner" htmlFor="doc-owner" hint="Who keeps this accurate.">
            <Select
              id="doc-owner"
              value={form.ownerId}
              onChange={(event) => setForm({ ...form, ownerId: event.target.value })}
            >
              <option value="">Me</option>
              {(people.data?.items ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Team" htmlFor="doc-team" hint="Draws an ownership line on the map.">
            <Select
              id="doc-team"
              value={form.teamId}
              onChange={(event) => setForm({ ...form, teamId: event.target.value })}
            >
              <option value="">No team</option>
              {(teams.data?.items ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ------------------------------ the body ------------------------- */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="edge">Content</span>
            <div className="flex border border-edge">
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
                    'edge-sm inline-flex items-center gap-1.5 px-2.5 py-1 transition-colors',
                    mode === option.value ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink',
                  )}
                >
                  <option.icon className="text-[12px]" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'write' ? (
            <Textarea
              value={form.contentMarkdown}
              onChange={(event) => setForm({ ...form, contentMarkdown: event.target.value })}
              aria-label="Document content, Markdown"
              className="min-h-[320px] font-mono text-[12.5px] leading-[1.7]"
            />
          ) : (
            <div className="min-h-[320px] border border-rule bg-sheet px-5 py-4">
              {form.contentMarkdown.trim() ? (
                <Markdown source={form.contentMarkdown} />
              ) : (
                <p className="text-[13px] text-ink-4">Nothing to preview yet.</p>
              )}
            </div>
          )}
          <p className="mt-1.5 text-[12px] text-ink-3">
            Markdown: <code className="font-mono">#</code> headings,{' '}
            <code className="font-mono">-</code> lists, <code className="font-mono">**bold**</code>,{' '}
            <code className="font-mono">&gt;</code> for a warning.
          </p>
        </div>

        {document && (
          <Field label="What changed" htmlFor="doc-change" hint="Shown in the version history.">
            <Input
              id="doc-change"
              value={form.changeNote}
              onChange={(event) => setForm({ ...form, changeNote: event.target.value })}
              placeholder="Added the vent step"
            />
          </Field>
        )}

        <div className="space-y-3 border border-rule bg-paper px-3.5 py-3">
          <Checkbox
            checked={form.status === 'PUBLISHED'}
            onChange={(event) =>
              setForm({ ...form, status: event.target.checked ? 'PUBLISHED' : 'DRAFT' })
            }
            label="Publish to the whole company"
            description="Unpublished documents are only visible to owners and managers."
          />
          <Checkbox
            checked={form.requiresAcknowledgment}
            onChange={(event) => setForm({ ...form, requiresAcknowledgment: event.target.checked })}
            label="Require everyone to acknowledge it"
            description="Editing the content later clears the acknowledgments so people re-read it."
          />
        </div>
      </div>
    </Modal>
  );
}
