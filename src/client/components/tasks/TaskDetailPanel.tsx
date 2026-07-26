import {
  BookOpen,
  Check,
  Clock,
  MapPin,
  PaperPlane,
  Paperclip,
  ShieldCheck,
  Trash,
  Warning,
  X,
} from '@/components/icons';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Chip,
  Button,
  Drawer,
  Field,
  InlineError,
  Input,
  LoadingState,
  Modal,
  Meter,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import {
  ACTIVITY_LABELS,
  PRIORITY_META,
  STATUS_META,
  cn,
  dueLabel,
  formatBytes,
  formatDateTime,
  relativeTime,
  toDateTimeLocal,
  toIsoOrNull,
} from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type PersonSummary,
  type TaskDetail,
  type TaskPriority,
  type TaskStatus,
} from '@shared/types';

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
  people?: PersonSummary[];
}

export function TaskDetailPanel({ taskId, onClose, onChanged, people = [] }: TaskDetailPanelProps) {
  const { session, isLeadership } = useAuth();
  const toast = useToast();
  const [blockOpen, setBlockOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data, loading, error, refetch } = useQuery<TaskDetail | null>(
    (signal) =>
      taskId ? api.get<TaskDetail>(`/tasks/${taskId}`, undefined, signal) : Promise.resolve(null),
    [taskId],
  );

  useRealtimeEvent(['task:updated', 'task:comment'], () => {
    if (taskId) refetch();
  });

  const reload = () => {
    refetch();
    onChanged();
  };

  const isAssignee = data?.assignee?.id === session?.membership.id;
  const canAct = isAssignee || isLeadership;

  const setStatus = async (status: TaskStatus, extra?: Record<string, unknown>) => {
    if (!data) return;
    if (status === 'BLOCKED') {
      setBlockOpen(true);
      return;
    }
    try {
      await api.patch(`/tasks/${data.id}/status`, { status, ...extra });
      reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  return (
    <Drawer
      open={Boolean(taskId)}
      onClose={onClose}
      labelledBy="task-panel-title"
      width="max-w-2xl"
    >
      {loading && <LoadingState label="Loading task…" />}

      {error && (
        <div className="p-5">
          <InlineError message={error} />
          <Button className="mt-3" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <>
          <header className="shrink-0 border-b border-rule px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Chip
                    className={STATUS_META[data.status].chip}
                    dot={STATUS_META[data.status].dot}
                  >
                    {STATUS_META[data.status].label}
                  </Chip>
                  <Chip className={PRIORITY_META[data.priority].chip}>
                    {PRIORITY_META[data.priority].label}
                  </Chip>
                  {data.team && <Chip>{data.team.name}</Chip>}
                  {data.requiresApproval && (
                    <Chip className="border-rule text-ink-3">Needs approval</Chip>
                  )}
                </div>
                <h2
                  id="task-panel-title"
                  className="text-lg font-semibold leading-snug tracking-tight text-ink"
                >
                  {data.title}
                </h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close task">
                <X aria-hidden className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <Clock aria-hidden className="h-3.5 w-3.5" />
                <span className={cn(data.isOverdue && 'font-medium text-alert')}>
                  {dueLabel(data.dueAt, data.status)}
                </span>
              </span>
              {data.assignee ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={data.assignee.fullName} src={data.assignee.avatarUrl} size="xs" />
                  {data.assignee.fullName}
                </span>
              ) : (
                <span className="text-pending">Unassigned</span>
              )}
              {data.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden className="h-3.5 w-3.5" />
                  {data.location}
                </span>
              )}
            </div>

            {/* ---------------------------- actions --------------------------- */}
            {canAct && (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.status !== 'DONE' && (
                  <>
                    {data.status === 'NOT_STARTED' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void setStatus('IN_PROGRESS')}
                      >
                        Start
                      </Button>
                    )}
                    {data.status !== 'AWAITING_REVIEW' && (
                      <Button
                        size="sm"
                        variant="mark"
                        icon={<Check className="h-3.5 w-3.5" />}
                        onClick={() => void setStatus('DONE')}
                      >
                        {data.requiresApproval && !isLeadership
                          ? 'Submit for review'
                          : 'Mark complete'}
                      </Button>
                    )}
                    {data.status !== 'BLOCKED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Warning className="h-3.5 w-3.5" />}
                        onClick={() => setBlockOpen(true)}
                      >
                        I&apos;m blocked
                      </Button>
                    )}
                  </>
                )}

                {data.status === 'AWAITING_REVIEW' && isLeadership && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                    onClick={async () => {
                      try {
                        await api.post(`/tasks/${data.id}/approve`);
                        toast.success('Approved.');
                        reload();
                      } catch (caught) {
                        toast.error(errorMessage(caught));
                      }
                    }}
                  >
                    Approve
                  </Button>
                )}

                {data.status === 'DONE' && (
                  <Button size="sm" variant="ghost" onClick={() => void setStatus('IN_PROGRESS')}>
                    Reopen
                  </Button>
                )}

                {isLeadership && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )}
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {data.status === 'BLOCKED' && data.blockedReason && (
              <div className="rounded-sm border border-alert/30 bg-alert-wash px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-edge font-semibold uppercase tracking-wider text-alert">
                  <Warning aria-hidden className="h-3 w-3" />
                  Blocked {data.blockedAt && `· ${relativeTime(data.blockedAt)}`}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-alert">
                  {data.blockedReason}
                </p>
              </div>
            )}

            {data.description && (
              <section>
                <h3 className="edge-sm mb-2">Description</h3>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                  {data.description}
                </p>
              </section>
            )}

            {data.document && (
              <section>
                <h3 className="edge-sm mb-2">How we do this</h3>
                <Link
                  to={`/app/knowledge/${data.document.id}`}
                  className="flex items-center gap-2.5 rounded-sm border border-rule px-3 py-2.5 transition-colors hover:border-edge hover:bg-paper"
                >
                  <BookOpen aria-hidden className="h-4 w-4 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">
                      {data.document.title}
                    </span>
                    <span className="text-xs text-ink-3">{data.document.category}</span>
                  </span>
                </Link>
              </section>
            )}

            <Subtasks task={data} canEdit={canAct} onChanged={reload} />
            <Attachments task={data} canEdit={canAct} onChanged={reload} />
            <Comments task={data} people={people} onChanged={reload} />

            <section>
              <h3 className="edge-sm mb-2.5">History</h3>
              {data.history.length === 0 ? (
                <p className="text-[13px] text-ink-3">Nothing recorded yet.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-rule pl-5">
                  {data.history.map((event) => (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[1.44rem] top-1.5 h-1.5 w-1.5 rounded-none bg-edge ring-4 ring-sheet" />
                      <p className="text-[13px] leading-relaxed text-ink-2">{event.summary}</p>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {ACTIVITY_LABELS[event.type] ?? event.type} ·{' '}
                        {relativeTime(event.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <p className="border-t border-rule pt-4 text-xs text-ink-3">
              Created by {data.createdBy?.fullName ?? 'someone'} on {formatDateTime(data.createdAt)}
              {data.approvedBy && ` · Approved by ${data.approvedBy.fullName}`}
            </p>
          </div>

          <BlockedModal
            open={blockOpen}
            onClose={() => setBlockOpen(false)}
            onSubmit={async (reason) => {
              try {
                await api.patch(`/tasks/${data.id}/status`, {
                  status: 'BLOCKED',
                  blockedReason: reason,
                });
                setBlockOpen(false);
                toast.info('Your manager has been notified.');
                reload();
              } catch (caught) {
                toast.error(errorMessage(caught));
              }
            }}
          />

          <EditTaskModal
            open={editing}
            task={data}
            people={people}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        </>
      )}
    </Drawer>
  );
}

// -------------------------------- subtasks ----------------------------------

function Subtasks({
  task,
  canEdit,
  onChanged,
}: {
  task: TaskDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState('');

  const toggle = async (subtaskId: string, done: boolean) => {
    try {
      await api.patch(`/tasks/${task.id}/subtasks/${subtaskId}`, { done });
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const add = async () => {
    if (!draft.trim()) return;
    try {
      await api.post(`/tasks/${task.id}/subtasks`, { title: draft.trim() });
      setDraft('');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const done = task.subtasks.filter((subtask) => subtask.done).length;

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="edge-sm">Checklist</h3>
        {task.subtasks.length > 0 && (
          <span className="text-xs tabular-nums text-ink-3">
            {done} of {task.subtasks.length}
          </span>
        )}
      </div>

      {task.subtasks.length > 0 && (
        <>
          <Meter value={task.completionPercent} className="mb-3" />
          <ul className="space-y-1.5">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => void toggle(subtask.id, !subtask.done)}
                  aria-label={subtask.done ? `Uncheck ${subtask.title}` : `Check ${subtask.title}`}
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    subtask.done
                      ? 'border-neutral-900 bg-ink text-white'
                      : 'hover:border-neutral-500 border-edge',
                    !canEdit && 'cursor-not-allowed opacity-60',
                  )}
                >
                  {subtask.done && <Check aria-hidden className="h-3 w-3" />}
                </button>
                <span
                  className={cn(
                    'text-[13px]',
                    subtask.done ? 'text-ink-3 line-through' : 'text-ink-2',
                  )}
                >
                  {subtask.title}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {task.subtasks.length === 0 && !canEdit && (
        <p className="text-[13px] text-ink-3">No checklist on this task.</p>
      )}

      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void add();
              }
            }}
            placeholder="Add a step…"
            aria-label="Add a checklist step"
            className="h-8 text-[13px]"
          />
          <Button size="sm" onClick={() => void add()} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      )}
    </section>
  );
}

// ------------------------------- attachments --------------------------------

function Attachments({
  task,
  canEdit,
  onChanged,
}: {
  task: TaskDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | undefined, proof: boolean) => {
    if (!file) return;
    setUploading(true);
    try {
      await api.upload(`/tasks/${task.id}/attachments`, file, {
        kind: proof ? 'COMPLETION_PROOF' : 'GENERAL',
      });
      onChanged();
      toast.success('File attached.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="edge-sm">Files</h3>
        {task.requiresProofPhoto && (
          <span className="text-xs text-ink-3">A completion photo is required</span>
        )}
      </div>

      {task.attachments.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nothing attached yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {task.attachments.map((attachment) => (
            <li key={attachment.id}>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-sm border border-rule px-3 py-2.5 transition-colors hover:border-edge hover:bg-paper"
              >
                {attachment.mimeType.startsWith('image/') ? (
                  <img
                    src={attachment.url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded object-cover"
                  />
                ) : (
                  <Paperclip aria-hidden className="h-4 w-4 shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{attachment.fileName}</span>
                  <span className="text-xs text-ink-3">
                    {formatBytes(attachment.sizeBytes)}
                    {attachment.kind === 'COMPLETION_PROOF' && ' · completion proof'}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(event) => void upload(event.target.files?.[0], false)}
          />
          <Button
            size="sm"
            loading={uploading}
            icon={<Paperclip className="h-3.5 w-3.5" />}
            onClick={() => fileRef.current?.click()}
          >
            Attach a file
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => void upload(event.target.files?.[0], true)}
            />
            <span className="inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-sm border border-[theme(colors.edgeStrong)] bg-sheet px-3 text-[13px] font-medium text-ink transition-colors hover:bg-paper">
              <Check aria-hidden className="h-3.5 w-3.5" />
              Completion photo
            </span>
          </label>
        </div>
      )}
    </section>
  );
}

// --------------------------------- comments ---------------------------------

function Comments({
  task,
  people,
  onChanged,
}: {
  task: TaskDetail;
  people: PersonSummary[];
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/tasks/${task.id}/comments`, { body: body.trim(), mentionIds });
      setBody('');
      setMentionIds([]);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const mentionable = people.filter((person) => person.id !== session?.membership.id);

  return (
    <section>
      <h3 className="edge-sm mb-2.5">Comments</h3>

      {task.comments.length === 0 ? (
        <p className="text-[13px] text-ink-3">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {task.comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar
                name={comment.author?.fullName ?? 'Unknown'}
                src={comment.author?.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-ink">
                    {comment.author?.fullName ?? 'Removed user'}
                  </span>
                  <span className="text-xs text-ink-3">{relativeTime(comment.createdAt)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                  {comment.body}
                </p>
                {comment.mentions.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {comment.mentions.map((mention) => (
                      <Chip key={mention.id} className="border-mark/20 bg-mark/10 text-mark">
                        @{mention.fullName}
                      </Chip>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          className="min-h-[72px] text-[13px]"
        />

        {mentionable.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-3">Notify:</span>
            {mentionable.slice(0, 8).map((person) => {
              const active = mentionIds.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setMentionIds((current) =>
                      active ? current.filter((id) => id !== person.id) : [...current, person.id],
                    )
                  }
                  className={cn(
                    'rounded-sm border px-1.5 py-0.5 text-edge transition-colors',
                    active
                      ? 'border-mark/30 bg-mark/10 text-mark'
                      : 'border-rule text-ink-3 hover:border-edge',
                  )}
                >
                  @{person.fullName.split(' ')[0]}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="primary"
            icon={<PaperPlane className="h-3.5 w-3.5" />}
            loading={sending}
            disabled={!body.trim()}
            onClick={() => void send()}
          >
            Comment
          </Button>
        </div>
      </div>
    </section>
  );
}

// --------------------------------- modals -----------------------------------

function BlockedModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What is blocking you?"
      description="Your manager and the owner are notified straight away."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={saving}
            disabled={!reason.trim()}
            onClick={async () => {
              setSaving(true);
              await onSubmit(reason.trim());
              setSaving(false);
              setReason('');
            }}
          >
            Report blocker
          </Button>
        </>
      }
    >
      <Field label="Explain the blocker" htmlFor="block-reason" required>
        <Textarea
          id="block-reason"
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The filter sizes in the store room do not match the units…"
        />
      </Field>
    </Modal>
  );
}

function EditTaskModal({
  open,
  task,
  people,
  onClose,
  onSaved,
}: {
  open: boolean;
  task: TaskDetail;
  people: PersonSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    dueAt: toDateTimeLocal(task.dueAt),
    assigneeId: task.assignee?.id ?? '',
    location: task.location ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TaskStatus>(task.status);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        dueAt: toIsoOrNull(form.dueAt),
        assigneeId: form.assigneeId || null,
        location: form.location || null,
      });
      if (status !== task.status) {
        await api.patch(`/tasks/${task.id}/status`, {
          status,
          ...(status === 'BLOCKED' ? { blockedReason: task.blockedReason ?? 'Blocked' } : {}),
        });
      }
      toast.success('Task updated.');
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success('Task deleted.');
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit task"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-alert hover:bg-alert-wash"
            icon={<Trash className="h-3.5 w-3.5" />}
            onClick={() => void remove()}
          >
            Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="edit-task-title" required>
          <Input
            id="edit-task-title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>

        <Field label="Description" htmlFor="edit-task-description">
          <Textarea
            id="edit-task-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee" htmlFor="edit-task-assignee">
            <Select
              id="edit-task-assignee"
              value={form.assigneeId}
              onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}
            >
              <option value="">Unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="edit-task-status">
            <Select
              id="edit-task-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due" htmlFor="edit-task-due">
            <Input
              id="edit-task-due"
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
            />
          </Field>

          <Field label="Priority" htmlFor="edit-task-priority">
            <Select
              id="edit-task-priority"
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as TaskPriority })
              }
            >
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_META[priority].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Location" htmlFor="edit-task-location">
          <Input
            id="edit-task-location"
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
