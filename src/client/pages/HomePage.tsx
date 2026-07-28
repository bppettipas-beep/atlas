import {
  Activity as ActivityIcon,
  ArrowRight,
  Copy,
  Megaphone,
  Plus,
  TreeStructure,
  UserPlus,
  Warning,
} from '@/components/icons';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import {
  Avatar,
  Chip,
  Button,
  Sheet,
  EmptyState,
  Field,
  InlineError,
  Input,
  Modal,
  PageHeader,
  RuledHead,
  SkeletonRows,
  Figure,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { ACTIVITY_LABELS, STATUS_META, cn, dueLabel, relativeTime } from '@/lib/utils';
import { useAuth, useSession } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type {
  ActivityEventDto,
  AnnouncementDto,
  CompanyMetricsDto,
  DailyBriefingDto,
  HomeSummaryDto,
  InviteCodeDto,
  TaskSummary,
} from '@shared/types';

export function HomePage() {
  const session = useSession();
  const { isLeadership } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [composerOpen, setComposerOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const summary = useQuery<HomeSummaryDto>(
    (signal) => api.get('/companies/current/summary', undefined, signal),
    [],
  );
  const overdue = useQuery<{ items: TaskSummary[] }>(
    (signal) => api.get('/tasks', { scope: 'overdue', limit: 8 }, signal),
    [],
  );
  const unassigned = useQuery<{ items: TaskSummary[] }>(
    (signal) =>
      isLeadership
        ? api.get('/tasks', { scope: 'unassigned', limit: 6 }, signal)
        : Promise.resolve({ items: [] }),
    [isLeadership],
  );
  const activity = useQuery<{ items: ActivityEventDto[] }>(
    (signal) =>
      isLeadership ? api.get('/activity', { limit: 10 }, signal) : Promise.resolve({ items: [] }),
    [isLeadership],
  );
  const metrics = useQuery<CompanyMetricsDto | null>(
    (signal) =>
      isLeadership ? api.get('/companies/current/metrics', undefined, signal) : Promise.resolve(null),
    [isLeadership],
  );
  const briefing = useQuery<DailyBriefingDto | null>(
    (signal) =>
      isLeadership ? api.get('/companies/current/briefing', undefined, signal) : Promise.resolve(null),
    [isLeadership],
  );
  const announcements = useQuery<{ items: AnnouncementDto[] }>(
    (signal) => api.get('/companies/current/announcements', undefined, signal),
    [],
  );
  const invites = useQuery<{ items: InviteCodeDto[] }>(
    (signal) =>
      isLeadership ? api.get('/invites', undefined, signal) : Promise.resolve({ items: [] }),
    [isLeadership],
  );

  useRealtimeEvent(['task:created', 'task:updated', 'task:deleted'], () => {
    summary.refetch();
    overdue.refetch();
    unassigned.refetch();
    metrics.refetch();
    briefing.refetch();
  });
  useRealtimeEvent('activity:new', () => {
    activity.refetch();
    metrics.refetch();
    briefing.refetch();
  });
  useRealtimeEvent('chat:message', () => {
    metrics.refetch();
    briefing.refetch();
  });
  useRealtimeEvent('announcement:new', () => announcements.refetch());
  useRealtimeEvent('people:updated', () => summary.refetch());

  const activeInvite = invites.data?.items.find((invite) => invite.isUsable) ?? null;
  const stats = summary.data;
  const brandNew = stats && stats.people <= 1 && stats.tasksByStatus.NOT_STARTED === 0;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Invitation code copied.');
    } catch {
      toast.error('Your browser blocked the clipboard. Select the code and copy it manually.');
    }
  };

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={session.company.name}
          title={`Good to see you, ${session.user.fullName.split(' ')[0]}`}
          description="A quick read on what your business is doing right now."
          actions={
            <>
              {isLeadership && (
                <Button
                  icon={<Megaphone className="h-4 w-4" />}
                  onClick={() => setAnnounceOpen(true)}
                >
                  Announce
                </Button>
              )}
              {isLeadership && (
                <Button
                  variant="primary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setComposerOpen(true)}
                >
                  New task
                </Button>
              )}
            </>
          }
        />

        {/* ----------------------------- new company ------------------------- */}
        {brandNew && isLeadership && (
          <Sheet className="border-mark/25 bg-mark/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-lg">
                <h2 className="title text-[15px]">Three things to get Atlas working for you</h2>
                <ol className="mt-3 space-y-2 text-[13px] text-ink-2">
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-none bg-ink text-[10px] font-bold text-white">
                      1
                    </span>
                    Invite your team so the organization map has people on it.
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-none bg-ink text-[10px] font-bold text-white">
                      2
                    </span>
                    Write down one process everybody asks you about.
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-none bg-ink text-[10px] font-bold text-white">
                      3
                    </span>
                    Assign the first real task and watch it move.
                  </li>
                </ol>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => navigate('/app/invitations')}
                >
                  Invite your team
                </Button>
                <Button
                  icon={<TreeStructure className="h-4 w-4" />}
                  onClick={() => navigate('/app/organization')}
                >
                  Open the map
                </Button>
              </div>
            </div>
          </Sheet>
        )}

        {/* ------------------------------- stats ----------------------------- */}
        {summary.loading && !stats && <SkeletonRows rows={2} />}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Figure label="People" value={stats.people} onClick={() => navigate('/app/people')} />
            <Figure
              label="Due today"
              value={stats.dueToday}
              tone="mark"
              onClick={() => navigate('/app/work?scope=today')}
            />
            <Figure
              label="Overdue"
              value={stats.overdue}
              tone={stats.overdue > 0 ? 'alert' : 'ink'}
              onClick={() => navigate('/app/work?scope=overdue')}
            />
            <Figure
              label="Blocked"
              value={stats.tasksByStatus.BLOCKED}
              tone={stats.tasksByStatus.BLOCKED > 0 ? 'alert' : 'ink'}
              onClick={() => navigate('/app/work?scope=all')}
            />
            <Figure
              label="Done this week"
              value={stats.completedThisWeek}
              tone="done"
              hint="Since Monday"
            />
          </div>
        )}

        {isLeadership && (briefing.data || metrics.data) && (
          <div className="grid gap-5 xl:grid-cols-5">
            {briefing.data && (
              <Sheet className="border-mark/30 bg-mark/[0.035] p-4 xl:col-span-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-mark/30 bg-paper p-1.5">
                    <img src="/brand/atlasy-symbol.png" alt="" aria-hidden className="h-full w-full object-contain" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <RuledHead title="Atlasy’s daily briefing" description="A live read of the company right now." />
                    <p className="mt-3 text-[14px] font-medium text-ink">{briefing.data.headline}</p>
                    {briefing.data.priorities.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {briefing.data.priorities.map((priority) => (
                          <button
                            key={priority.text}
                            type="button"
                            onClick={() => navigate(priority.href)}
                            className={cn(
                              'rounded-sm border px-3 py-2 text-left text-[13px] transition-colors hover:bg-paper',
                              priority.tone === 'alert' && 'border-alert/25 text-alert',
                              priority.tone === 'pending' && 'border-pending/30 text-pending',
                              priority.tone === 'mark' && 'border-mark/30 text-mark',
                            )}
                          >
                            {priority.text}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] text-ink-2">No overdue, blocked, or unassigned work is waiting.</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                      {briefing.data.highlights.map((highlight) => (
                        <span key={highlight}>{highlight}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </Sheet>
            )}

            {metrics.data && (
              <Sheet className="p-4 xl:col-span-2">
                <RuledHead title="Company metrics" description="This week, at a glance." />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Figure label="Completion" value={`${metrics.data.completionRate}%`} tone="done" hint="Done vs. active" />
                  <Figure label="Created" value={metrics.data.createdThisWeek} hint="Since Monday" />
                  <Figure label="Scheduled" value={metrics.data.scheduledToday} tone="mark" hint="Today" />
                  <Figure label="Chat activity" value={metrics.data.messagesLast24Hours} hint="Last 24 hours" />
                </div>
                {metrics.data.workload.length > 0 && (
                  <div className="mt-4 border-t border-rule pt-3">
                    <p className="edge-sm">Most assigned work</p>
                    <div className="mt-2 space-y-1.5">
                      {metrics.data.workload.slice(0, 3).map((person) => (
                        <div key={person.membershipId} className="flex items-center gap-2 text-[13px]">
                          <Avatar name={person.fullName} src={person.avatarUrl} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-ink-2">{person.fullName}</span>
                          <span className="tabular-nums text-ink-3">{person.activeTasks}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Sheet>
            )}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {/* ---------------------------- main column ------------------------ */}
          <div className="space-y-5 lg:col-span-2">
            <section className="space-y-3">
              <RuledHead
                title="Needs attention"
                description="Overdue work, newest first."
                action={
                  <Link
                    to="/app/work?scope=overdue"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"
                  >
                    View all
                    <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {overdue.loading && !overdue.data && <SkeletonRows rows={3} />}
              {overdue.data && overdue.data.items.length === 0 && (
                <EmptyState
                  className="py-10"
                  icon={<Warning className="h-5 w-5" />}
                  title="Nothing is overdue"
                  description="Everything with a deadline is still on track."
                />
              )}
              {overdue.data && overdue.data.items.length > 0 && (
                <Sheet className="divide-y divide-rule overflow-hidden">
                  {overdue.data.items.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setOpenTaskId(task.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper"
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-none',
                          STATUS_META[task.status].dot,
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {task.title}
                        </span>
                        <span className="text-xs text-ink-3">
                          {task.assignee?.fullName ?? 'Unassigned'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-alert">
                        {dueLabel(task.dueAt, task.status)}
                      </span>
                    </button>
                  ))}
                </Sheet>
              )}
            </section>

            {isLeadership && unassigned.data && unassigned.data.items.length > 0 && (
              <section className="space-y-3">
                <RuledHead
                  title="Waiting for an owner"
                  description="Work nobody has picked up yet."
                />
                <Sheet className="divide-y divide-rule overflow-hidden">
                  {unassigned.data.items.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setOpenTaskId(task.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {task.title}
                      </span>
                      <Chip className="border-pending/30 bg-pending-wash text-pending">
                        Unassigned
                      </Chip>
                    </button>
                  ))}
                </Sheet>
              </section>
            )}

            {isLeadership && (
              <section className="space-y-3">
              <RuledHead
                title="Recent activity"
                description="What has changed inside the company."
                action={
                  <Link
                    to="/app/activity"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"
                  >
                    Full timeline
                    <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {activity.loading && !activity.data && <SkeletonRows rows={4} />}
              {activity.data && activity.data.items.length === 0 && (
                <EmptyState
                  className="py-10"
                  icon={<ActivityIcon className="h-5 w-5" />}
                  title="Nothing has happened yet"
                  description="Assignments, completions and changes will show up here."
                />
              )}
              {activity.data && activity.data.items.length > 0 && (
                <Sheet className="divide-y divide-rule overflow-hidden">
                  {activity.data.items.map((event) => (
                    <div key={event.id} className="flex items-start gap-2.5 px-4 py-3">
                      {event.actor ? (
                        <Avatar name={event.actor.fullName} src={event.actor.avatarUrl} size="xs" />
                      ) : (
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-none bg-edge" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-relaxed text-ink-2">{event.summary}</p>
                        <p className="mt-0.5 text-xs text-ink-3">
                          {ACTIVITY_LABELS[event.type] ?? event.type} ·{' '}
                          {relativeTime(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </Sheet>
              )}
              </section>
            )}
          </div>

          {/* ----------------------------- side column ----------------------- */}
          <div className="space-y-5">
            {isLeadership && (
              <Sheet className="p-4">
                <RuledHead
                  title="Invite workers"
                  description={
                    activeInvite
                      ? `Used ${activeInvite.useCount} time${activeInvite.useCount === 1 ? '' : 's'}.`
                      : 'Generate a code your team can join with.'
                  }
                />
                {activeInvite ? (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 rounded-sm border border-rule bg-paper px-3 py-2.5">
                      <code className="flex-1 font-mono text-sm tracking-[0.14em] text-ink">
                        {activeInvite.code}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy className="h-3.5 w-3.5" />}
                        onClick={() => void copyCode(activeInvite.code)}
                        aria-label="Copy invitation code"
                      >
                        Copy
                      </Button>
                    </div>
                    <Link
                      to="/app/invitations"
                      className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"
                    >
                      Manage invitations
                      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <Button
                    className="mt-3 w-full justify-center"
                    variant="primary"
                    icon={<UserPlus className="h-4 w-4" />}
                    onClick={() => navigate('/app/invitations')}
                  >
                    Create an invitation code
                  </Button>
                )}
              </Sheet>
            )}

            <Sheet className="p-4">
              <RuledHead title="Announcements" />
              {announcements.data && announcements.data.items.length === 0 && (
                <p className="mt-3 text-[13px] text-ink-3">
                  Nothing posted yet.
                  {isLeadership && ' Use “Announce” to tell everyone something.'}
                </p>
              )}
              <div className="mt-3 space-y-3">
                {(announcements.data?.items ?? []).slice(0, 4).map((announcement) => (
                  <div
                    key={announcement.id}
                    className="border-b border-rule pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-[13px] font-medium text-ink">{announcement.title}</p>
                    <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-2">
                      {announcement.body}
                    </p>
                    <p className="mt-1.5 text-xs text-ink-3">
                      {announcement.author?.fullName ?? 'Someone'} ·{' '}
                      {relativeTime(announcement.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </Sheet>

            {stats && stats.pendingAcknowledgments > 0 && (
              <Sheet className="border-pending/30 bg-pending-wash/60 p-4">
                <p className="text-[13px] font-medium text-pending">
                  You have {stats.pendingAcknowledgments} document
                  {stats.pendingAcknowledgments === 1 ? '' : 's'} to read
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-pending">
                  Required reading needs your acknowledgment.
                </p>
                <Button className="mt-3" size="sm" onClick={() => navigate('/app/knowledge')}>
                  Open the knowledge base
                </Button>
              </Sheet>
            )}
          </div>
        </div>
      </PageBody>

      <TaskComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false);
          summary.refetch();
          overdue.refetch();
          unassigned.refetch();
          toast.success('Task created.');
        }}
      />

      <TaskDetailPanel
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={() => {
          summary.refetch();
          overdue.refetch();
        }}
      />

      {isLeadership && (
        <AnnouncementModal
          open={announceOpen}
          onClose={() => setAnnounceOpen(false)}
          onPosted={() => {
            setAnnounceOpen(false);
            announcements.refetch();
            toast.success('Announcement posted.');
          }}
        />
      )}
    </PageTransition>
  );
}

function AnnouncementModal({
  open,
  onClose,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/companies/current/announcements', { title, body, pinned: false });
      setTitle('');
      setBody('');
      onPosted();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post an announcement"
      description="Everybody in the company gets a notification."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!title.trim() || !body.trim()}
            onClick={() => void post()}
          >
            Post
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}
        <Field label="Title" htmlFor="announcement-title" required>
          <Input
            id="announcement-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="We signed Meridian Tower"
          />
        </Field>
        <Field label="Message" htmlFor="announcement-body" required>
          <Textarea
            id="announcement-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-[120px]"
          />
        </Field>
      </div>
    </Modal>
  );
}
