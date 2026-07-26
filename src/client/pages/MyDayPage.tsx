import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Check,
  CheckCircle,
  Clock,
  Megaphone,
  SunHorizon,
  TreeStructure,
  Users,
  Warning,
} from '@/components/icons';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import {
  Avatar,
  Chip,
  Button,
  Sheet,
  EmptyState,
  ErrorState,
  PageHeader,
  Meter,
  RuledHead,
  SkeletonRows,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { PRIORITY_META, STATUS_META, cn, dueLabel, formatTime, relativeTime } from '@/lib/utils';
import { useSession } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { MyDayDto, TaskSummary } from '@shared/types';

export function MyDayPage() {
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const myDay = useQuery<MyDayDto>((signal) => api.get('/people/me/my-day', undefined, signal), []);

  useRealtimeEvent(
    ['task:created', 'task:updated', 'task:deleted', 'announcement:new', 'people:updated'],
    () => myDay.refetch(),
  );

  const complete = async (task: TaskSummary) => {
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: 'DONE' });
      myDay.refetch();
      toast.success('Nice — marked complete.');
    } catch (error) {
      // A required photo or approval sends people into the task itself.
      toast.error(errorMessage(error));
      setOpenTaskId(task.id);
    }
  };

  const data = myDay.data;
  const groups = data
    ? [
        { key: 'overdue', label: 'Overdue', tasks: data.tasks.overdue, tone: 'alert' as const },
        { key: 'blocked', label: 'Blocked', tasks: data.tasks.blocked, tone: 'alert' as const },
        { key: 'today', label: 'Due today', tasks: data.tasks.dueToday, tone: 'mark' as const },
        {
          key: 'review',
          label: 'Waiting for review',
          tasks: data.tasks.awaitingReview,
          tone: 'pending' as const,
        },
        { key: 'upcoming', label: 'Coming up', tasks: data.tasks.upcoming, tone: 'ink' as const },
      ].filter((group) => group.tasks.length > 0)
    : [];

  const nothingToDo = data && groups.length === 0 && data.tasks.completedToday.length === 0;

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          title={`Good ${greeting()}, ${data?.greetingName ?? session.user.fullName.split(' ')[0]}`}
          description="Everything you need today, in one place."
        />

        {myDay.loading && !data && <SkeletonRows rows={5} />}
        {myDay.error && <ErrorState message={myDay.error} onRetry={myDay.refetch} />}

        {data && (
          <>
            {/* -------------------------- at a glance ------------------------ */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Glance
                label="Active"
                value={data.counts.active}
                icon={<Clock className="h-4 w-4" />}
              />
              <Glance
                label="Overdue"
                value={data.counts.overdue}
                tone={data.counts.overdue > 0 ? 'alert' : 'ink'}
                icon={<Warning className="h-4 w-4" />}
              />
              <Glance
                label="Blocked"
                value={data.counts.blocked}
                tone={data.counts.blocked > 0 ? 'alert' : 'ink'}
                icon={<Warning className="h-4 w-4" />}
              />
              <Glance
                label="Done today"
                value={data.counts.doneToday}
                tone="done"
                icon={<CheckCircle className="h-4 w-4" />}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                {nothingToDo && (
                  <EmptyState
                    icon={<SunHorizon className="h-5 w-5" />}
                    title="Nothing is due right now"
                    description="You have no open tasks. Check the company map or the knowledge base while it is quiet."
                    action={
                      <Button onClick={() => navigate('/app/knowledge')}>
                        Open the knowledge base
                      </Button>
                    }
                  />
                )}

                {groups.map((group) => (
                  <section key={group.key} className="space-y-2.5">
                    <RuledHead
                      title={
                        <span className="flex items-center gap-2">
                          {group.label}
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-edge tabular-nums',
                              group.tone === 'alert' && 'bg-alert-wash text-alert',
                              group.tone === 'mark' && 'bg-mark/10 text-mark',
                              group.tone === 'pending' && 'bg-pending-wash text-pending',
                              group.tone === 'ink' && 'bg-paper-deep text-ink-3',
                            )}
                          >
                            {group.tasks.length}
                          </span>
                        </span>
                      }
                    />
                    <AnimatePresence initial={false}>
                      {group.tasks.map((task) => (
                        <motion.div
                          key={task.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.2 }}
                        >
                          <WorkerTaskCard
                            task={task}
                            onOpen={() => setOpenTaskId(task.id)}
                            onComplete={() => void complete(task)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </section>
                ))}

                {data.tasks.completedToday.length > 0 && (
                  <section className="space-y-2.5">
                    <RuledHead title="Finished today" />
                    <Sheet className="divide-y divide-rule overflow-hidden">
                      {data.tasks.completedToday.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setOpenTaskId(task.id)}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-paper"
                        >
                          <CheckCircle aria-hidden className="h-4 w-4 shrink-0 text-done" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3 line-through">
                            {task.title}
                          </span>
                        </button>
                      ))}
                    </Sheet>
                  </section>
                )}
              </div>

              {/* --------------------------- side rail ----------------------- */}
              <div className="space-y-5">
                <Sheet className="p-4">
                  <RuledHead title="Your team" />
                  <div className="mt-3 space-y-3">
                    {data.manager ? (
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={data.manager.fullName}
                          src={data.manager.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">
                            {data.manager.fullName}
                          </p>
                          <p className="text-xs text-ink-3">
                            Your manager{data.manager.jobTitle ? ` · ${data.manager.jobTitle}` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] text-ink-3">No manager assigned yet.</p>
                    )}

                    {data.teams.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-t border-rule pt-3">
                        {data.teams.map((team) => (
                          <Chip key={team.id}>{team.name}</Chip>
                        ))}
                      </div>
                    )}

                    {data.teammates.length > 0 && (
                      <div className="border-t border-rule pt-3">
                        <p className="mb-2 text-xs text-ink-3">
                          {data.teammates.length} teammate{data.teammates.length === 1 ? '' : 's'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {data.teammates.slice(0, 10).map((mate) => (
                            <Link
                              key={mate.id}
                              to={`/app/people?person=${mate.id}`}
                              title={`${mate.fullName}${mate.jobTitle ? ` — ${mate.jobTitle}` : ''}`}
                            >
                              <Avatar name={mate.fullName} src={mate.avatarUrl} size="sm" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full justify-center"
                      size="sm"
                      icon={<TreeStructure className="h-3.5 w-3.5" />}
                      onClick={() => navigate('/app/organization')}
                    >
                      View the company map
                    </Button>
                    <p className="text-center text-edge text-ink-3">
                      <Users aria-hidden className="mr-1 inline h-3 w-3" />
                      You can explore the map, but only managers can rearrange it.
                    </p>
                  </div>
                </Sheet>

                {data.announcements.length > 0 && (
                  <Sheet className="p-4">
                    <RuledHead
                      title={
                        <span className="flex items-center gap-1.5">
                          <Megaphone aria-hidden className="h-3.5 w-3.5 text-ink-3" />
                          Announcements
                        </span>
                      }
                    />
                    <div className="mt-3 space-y-3">
                      {data.announcements.slice(0, 3).map((announcement) => (
                        <div
                          key={announcement.id}
                          className="border-b border-rule pb-3 last:border-0 last:pb-0"
                        >
                          <p className="text-[13px] font-medium text-ink">{announcement.title}</p>
                          <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-2">
                            {announcement.body}
                          </p>
                          <p className="mt-1.5 text-xs text-ink-3">
                            {relativeTime(announcement.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Sheet>
                )}

                {data.training.length > 0 && (
                  <Sheet className="p-4">
                    <RuledHead title="Reading for you" />
                    <ul className="mt-3 space-y-1.5">
                      {data.training.map((item) => (
                        <li key={item.id}>
                          <Link
                            to={`/app/knowledge/${item.id}`}
                            className="flex items-start gap-2 rounded-sm px-2 py-2 transition-colors hover:bg-paper"
                          >
                            <BookOpen
                              aria-hidden
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium text-ink">
                                {item.title}
                              </span>
                              <span className="text-xs text-ink-3">{item.category}</span>
                            </span>
                            {item.requiresAcknowledgment &&
                              (item.acknowledgedByMe ? (
                                <Check
                                  aria-hidden
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-done"
                                />
                              ) : (
                                <Chip className="shrink-0 border-pending/30 bg-pending-wash text-pending">
                                  Required
                                </Chip>
                              ))}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Sheet>
                )}
              </div>
            </div>
          </>
        )}
      </PageBody>

      <TaskDetailPanel
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={() => myDay.refetch()}
      />
    </PageTransition>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function Glance({
  label,
  value,
  tone = 'ink',
  icon,
}: {
  label: string;
  value: number;
  tone?: 'ink' | 'alert' | 'done';
  icon: React.ReactNode;
}) {
  return (
    <Sheet className="px-3.5 py-3">
      <div className="flex items-center justify-between">
        <p className="edge-sm">{label}</p>
        <span
          className={cn(
            tone === 'alert' && value > 0 ? 'text-red-400' : 'text-ink-4',
            tone === 'done' && value > 0 && 'text-emerald-400',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'alert' && value > 0 ? 'text-alert' : 'text-ink',
          tone === 'done' && value > 0 && 'text-done',
        )}
      >
        {value}
      </p>
    </Sheet>
  );
}

function WorkerTaskCard({
  task,
  onOpen,
  onComplete,
}: {
  task: TaskSummary;
  onOpen: () => void;
  onComplete: () => void;
}) {
  return (
    <Sheet
      className={cn(
        'overflow-hidden transition-colors hover:border-ink-3',
        task.isOverdue && 'border-alert/30',
        task.status === 'BLOCKED' && 'border-alert/30 bg-alert-wash/30',
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={onComplete}
          aria-label={`Mark "${task.title}" complete`}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-none border-2 border-edge text-transparent transition-all hover:border-done hover:bg-done hover:text-white"
        >
          <Check aria-hidden className="h-3 w-3" />
        </button>

        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium leading-snug text-ink">{task.title}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip className={STATUS_META[task.status].chip} dot={STATUS_META[task.status].dot}>
              {STATUS_META[task.status].label}
            </Chip>
            {task.priority !== 'MEDIUM' && (
              <Chip className={PRIORITY_META[task.priority].chip}>
                {PRIORITY_META[task.priority].label}
              </Chip>
            )}
            {task.team && <Chip>{task.team.name}</Chip>}
            <span
              className={cn(
                'text-xs tabular-nums',
                task.isOverdue ? 'font-medium text-alert' : 'text-ink-3',
              )}
            >
              {task.dueAt ? dueLabel(task.dueAt, task.status) : 'No due date'}
            </span>
          </div>

          {task.completionPercent > 0 && task.status !== 'DONE' && (
            <Meter value={task.completionPercent} className="mt-2.5" />
          )}
        </button>

        {task.dueAt && (
          <span className="hidden shrink-0 text-xs tabular-nums text-ink-3 sm:block">
            {formatTime(task.dueAt)}
          </span>
        )}
      </div>
    </Sheet>
  );
}
