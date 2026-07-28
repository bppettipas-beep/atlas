import { Plus, X } from '@/components/icons';
import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Field,
  InlineError,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { toIsoOrNull } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import {
  TASK_PRIORITIES,
  type KnowledgeDocumentSummary,
  type PersonSummary,
  type TaskDetail,
  type TaskPriority,
  type TeamDto,
} from '@shared/types';

interface TaskComposerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (task: TaskDetail) => void;
  defaultAssigneeId?: string;
  defaultTeamId?: string;
  defaultDocumentId?: string;
}

const emptyForm = {
  title: '',
  description: '',
  priority: 'MEDIUM' as TaskPriority,
  dueAt: '',
  assigneeId: '',
  teamId: '',
  documentId: '',
  location: '',
  requiresApproval: false,
  requiresProofPhoto: false,
};

export function TaskComposer({
  open,
  onClose,
  onCreated,
  defaultAssigneeId,
  defaultTeamId,
  defaultDocumentId,
}: TaskComposerProps) {
  const { isLeadership, session } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const people = useQuery<{ items: PersonSummary[] }>(
    (signal) => (open ? api.get('/people', undefined, signal) : Promise.resolve({ items: [] })),
    [open],
  );
  const teams = useQuery<{ items: TeamDto[] }>(
    (signal) =>
      open ? api.get('/organization/teams', undefined, signal) : Promise.resolve({ items: [] }),
    [open],
  );
  const documents = useQuery<{ items: KnowledgeDocumentSummary[] }>(
    (signal) => (open ? api.get('/knowledge', undefined, signal) : Promise.resolve({ items: [] })),
    [open],
  );

  // Reset every time the composer opens so it never reuses stale input.
  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm,
      assigneeId: defaultAssigneeId ?? (isLeadership ? '' : (session?.membership.id ?? '')),
      teamId: defaultTeamId ?? '',
      documentId: defaultDocumentId ?? '',
    });
    setSubtasks([]);
    setSubtaskDraft('');
    setError(null);
    setFieldErrors({});
  }, [
    open,
    defaultAssigneeId,
    defaultTeamId,
    defaultDocumentId,
    isLeadership,
    session?.membership.id,
  ]);

  // The API enforces this as well. Keeping the composer out of the worker UI
  // makes the boundary clear: workers carry out work; management creates it.
  if (!isLeadership) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const task = await api.post<TaskDetail>('/tasks', {
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        dueAt: toIsoOrNull(form.dueAt),
        assigneeId: form.assigneeId || null,
        teamId: form.teamId || null,
        documentId: form.documentId || null,
        location: form.location || null,
        requiresApproval: form.requiresApproval,
        requiresProofPhoto: form.requiresProofPhoto,
        subtasks,
      });
      onCreated(task);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('We could not create that task. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      description="Everything Atlas needs to make this piece of work unambiguous."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!form.title.trim()}
            onClick={() => void submit()}
          >
            Create task
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}

        <Field label="Title" htmlFor="task-title" error={fieldErrors.title} required>
          <Input
            id="task-title"
            autoFocus
            value={form.title}
            invalid={Boolean(fieldErrors.title)}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Deep clean — Harbourview Clinic reception"
          />
        </Field>

        <Field label="Description" htmlFor="task-description" hint="What does 'done' look like?">
          <Textarea
            id="task-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee" htmlFor="task-assignee">
            <Select
              id="task-assignee"
              value={form.assigneeId}
              disabled={!isLeadership}
              onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}
            >
              <option value="">Unassigned</option>
              {(people.data?.items ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                  {person.jobTitle ? ` — ${person.jobTitle}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Team" htmlFor="task-team">
            <Select
              id="task-team"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due" htmlFor="task-due" error={fieldErrors.dueAt}>
            <Input
              id="task-due"
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
            />
          </Field>

          <Field label="Priority" htmlFor="task-priority">
            <Select
              id="task-priority"
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as TaskPriority })
              }
            >
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0) + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor="task-location" hint="Optional — site or address.">
            <Input
              id="task-location"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Harbourview Clinic"
            />
          </Field>

          <Field
            label="Linked process"
            htmlFor="task-document"
            hint="The document that explains how."
          >
            <Select
              id="task-document"
              value={form.documentId}
              onChange={(event) => setForm({ ...form, documentId: event.target.value })}
            >
              <option value="">None</option>
              {(documents.data?.items ?? []).map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* subtasks */}
        <Field label="Checklist" hint="Break the task into steps. Optional.">
          <div className="space-y-2">
            {subtasks.length > 0 && (
              <ul className="space-y-1.5">
                {subtasks.map((subtask, index) => (
                  <li
                    key={`${subtask}-${index}`}
                    className="flex items-center gap-2 rounded-sm border border-rule px-2.5 py-1.5 text-[13px]"
                  >
                    <span className="flex-1">{subtask}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${subtask}`}
                      onClick={() => setSubtasks(subtasks.filter((_, i) => i !== index))}
                      className="text-ink-4 hover:text-alert"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={subtaskDraft}
                onChange={(event) => setSubtaskDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && subtaskDraft.trim()) {
                    event.preventDefault();
                    setSubtasks([...subtasks, subtaskDraft.trim()]);
                    setSubtaskDraft('');
                  }
                }}
                placeholder="Add a step…"
                aria-label="Add a checklist step"
                className="h-8 text-[13px]"
              />
              <Button
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                disabled={!subtaskDraft.trim()}
                onClick={() => {
                  setSubtasks([...subtasks, subtaskDraft.trim()]);
                  setSubtaskDraft('');
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </Field>

        <div className="space-y-2 rounded-sm bg-paper px-3 py-3">
          <Checkbox
            checked={form.requiresProofPhoto}
            onChange={(event) => setForm({ ...form, requiresProofPhoto: event.target.checked })}
            label="Require a completion photo"
            description="The task cannot be marked done without a photo attached."
          />
          <Checkbox
            checked={form.requiresApproval}
            onChange={(event) => setForm({ ...form, requiresApproval: event.target.checked })}
            label="Require manager approval"
            description="Goes to Awaiting review instead of Done when the worker finishes."
          />
        </div>
      </div>
    </Modal>
  );
}
