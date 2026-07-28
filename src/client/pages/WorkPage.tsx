import { motion } from 'framer-motion';
import { CheckSquare, Columns, List, Plus, Search, X } from '@/components/icons';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import {
  Avatar,
  Chip,
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Meter,
  Select,
  SkeletonRows,
  Tabs,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/useQuery';
import { PRIORITY_META, STATUS_META, cn, dueLabel } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import {
  TASK_STATUSES,
  type PersonSummary,
  type TaskStatus,
  type TaskSummary,
  type TeamDto,
} from '@shared/types';

type Scope = 'all' | 'mine' | 'unassigned' | 'overdue' | 'today';
type View = 'list' | 'board';

export function WorkPage() {
  const { isLeadership } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const scope = (params.get('scope') as Scope | null) ?? (isLeadership ? 'all' : 'mine');
  const openTaskId = params.get('task');

  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const tasksQuery = useQuery<{ items: TaskSummary[] }>(
    (signal) =>
      api.get(
        '/tasks',
        {
          scope,
          search: debouncedSearch,
          status: status || undefined,
          assigneeId,
          teamId,
          limit: 200,
        },
        signal,
      ),
    [scope, debouncedSearch, status, assigneeId, teamId],
  );

  const peopleQuery = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', undefined, signal),
    [],
  );
  const teamsQuery = useQuery<{ items: TeamDto[] }>(
    (signal) => api.get('/organization/teams', undefined, signal),
    [],
  );

  useRealtimeEvent(['task:created', 'task:updated', 'task:deleted', 'task:comment'], () =>
    tasksQuery.refetch(),
  );

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const tasks = tasksQuery.data?.items ?? [];

  const scopes: { value: Scope; label: string; count?: number }[] = useMemo(
    () => [
      ...(isLeadership ? [{ value: 'all' as const, label: 'All work' }] : []),
      { value: 'mine' as const, label: 'Assigned to me' },
      { value: 'today' as const, label: 'Due today' },
      { value: 'overdue' as const, label: 'Overdue' },
      ...(isLeadership ? [{ value: 'unassigned' as const, label: 'Unassigned' }] : []),
    ],
    [isLeadership],
  );

  const hasFilters = Boolean(debouncedSearch || status || assigneeId || teamId);

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setAssigneeId('');
    setTeamId('');
  };

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="Work"
          title={isLeadership ? 'Everything your business is doing' : 'My work'}
          description={
            isLeadership
              ? 'Filter by team, person or status to find what is late, blocked or waiting on you.'
              : 'The tasks assigned to you, plus anything your team is working on.'
          }
          actions={
            <>
              <div className="flex rounded-sm border border-[theme(colors.edgeStrong)] bg-sheet p-0.5">
                {[
                  { value: 'list' as const, icon: List, label: 'List view' },
                  { value: 'board' as const, icon: Columns, label: 'Board view' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setView(option.value)}
                    aria-label={option.label}
                    aria-pressed={view === option.value}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-sm transition-colors',
                      view === option.value
                        ? 'bg-ink text-white'
                        : 'text-ink-3 hover:bg-paper-deep',
                    )}
                  >
                    <option.icon aria-hidden className="h-4 w-4" />
                  </button>
                ))}
              </div>
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

        <Tabs
          tabs={scopes}
          value={scope}
          onChange={(value) => setParam('scope', value === 'all' ? null : value)}
        />

        {/* ------------------------------ filters ----------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks…"
              aria-label="Search tasks"
              className="h-9 pl-9"
            />
          </div>

          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus | '')}
            aria-label="Filter by status"
            className="h-9 w-auto min-w-[140px]"
          >
            <option value="">Any status</option>
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_META[value].label}
              </option>
            ))}
          </Select>

          {isLeadership && (
            <Select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              aria-label="Filter by assignee"
              className="h-9 w-auto min-w-[150px]"
            >
              <option value="">Anyone</option>
              {(peopleQuery.data?.items ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
          )}

          <Select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            aria-label="Filter by team"
            className="h-9 w-auto min-w-[140px]"
          >
            <option value="">All teams</option>
            {(teamsQuery.data?.items ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>

          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={clearFilters}
            >
              Clear
            </Button>
          )}

          <span className="ml-auto text-xs tabular-nums text-ink-3">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {/* ------------------------------ content ----------------------------- */}
        {tasksQuery.loading && !tasksQuery.data && <SkeletonRows rows={6} />}

        {tasksQuery.error && <ErrorState message={tasksQuery.error} onRetry={tasksQuery.refetch} />}

        {tasksQuery.data && tasks.length === 0 && (
          <EmptyState
            icon={<CheckSquare className="h-5 w-5" />}
            title={hasFilters ? 'No tasks match those filters' : 'No work here yet'}
            description={
              hasFilters
                ? 'Try widening your search or clearing the filters.'
                : 'Create the first task and Atlas will start tracking who is doing what.'
            }
            action={
              hasFilters ? (
                <Button onClick={clearFilters}>Clear filters</Button>
              ) : isLeadership ? (
                <Button
                  variant="primary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setComposerOpen(true)}
                >
                  New task
                </Button>
              ) : undefined
            }
          />
        )}

        {tasks.length > 0 &&
          (view === 'list' ? (
            <TaskList tasks={tasks} onOpen={(id) => setParam('task', id)} />
          ) : (
            <TaskBoard tasks={tasks} onOpen={(id) => setParam('task', id)} />
          ))}
      </PageBody>

      <TaskComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false);
          tasksQuery.refetch();
          toast.success('Task created.');
        }}
      />

      <TaskDetailPanel
        taskId={openTaskId}
        people={peopleQuery.data?.items ?? []}
        onClose={() => setParam('task', null)}
        onChanged={() => tasksQuery.refetch()}
      />
    </PageTransition>
  );
}

// -------------------------------- list view ---------------------------------

function TaskList({ tasks, onOpen }: { tasks: TaskSummary[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-sm border border-rule bg-sheet">
      {/* Column headings only make sense once there is room for them. */}
      <div className="hidden border-b border-rule bg-paper/60 px-4 py-2 text-edge font-semibold uppercase tracking-wider text-ink-3 sm:grid sm:grid-cols-[1fr_140px_150px_130px]">
        <span>Task</span>
        <span>Status</span>
        <span>Assignee</span>
        <span>Due</span>
      </div>

      <ul className="divide-y divide-rule">
        {tasks.map((task, index) => (
          <motion.li
            key={task.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: Math.min(index * 0.012, 0.2) }}
          >
            <button
              type="button"
              onClick={() => onOpen(task.id)}
              className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-paper sm:grid-cols-[1fr_140px_150px_130px] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-none',
                      STATUS_META[task.status].dot,
                    )}
                  />
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'truncate text-[13px] font-medium text-ink',
                        task.status === 'DONE' && 'text-ink-3 line-through',
                      )}
                    >
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {task.priority !== 'MEDIUM' && (
                        <Chip className={PRIORITY_META[task.priority].chip}>
                          {PRIORITY_META[task.priority].label}
                        </Chip>
                      )}
                      {task.team && <Chip>{task.team.name}</Chip>}
                    </div>
                  </div>
                </div>
                {task.completionPercent > 0 && task.status !== 'DONE' && (
                  <Meter value={task.completionPercent} className="mt-2 sm:hidden" />
                )}
              </div>

              <span className="hidden sm:block">
                <Chip className={STATUS_META[task.status].chip}>
                  {STATUS_META[task.status].label}
                </Chip>
              </span>

              <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
                {task.assignee ? (
                  <>
                    <Avatar name={task.assignee.fullName} src={task.assignee.avatarUrl} size="xs" />
                    <span className="truncate text-[13px] text-ink-2">
                      {task.assignee.fullName}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-pending">Unassigned</span>
                )}
              </span>

              <span
                className={cn(
                  'text-xs tabular-nums sm:text-[13px]',
                  task.isOverdue ? 'font-medium text-alert' : 'text-ink-3',
                )}
              >
                {dueLabel(task.dueAt, task.status)}
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// -------------------------------- board view --------------------------------

function TaskBoard({ tasks, onOpen }: { tasks: TaskSummary[]; onOpen: (id: string) => void }) {
  const columns = TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3">
        {columns.map((column) => (
          <div key={column.status} className="w-[260px] shrink-0">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn('h-1.5 w-1.5 rounded-none', STATUS_META[column.status].dot)} />
              <h3 className="text-[13px] font-medium text-ink-2">
                {STATUS_META[column.status].label}
              </h3>
              <span className="ml-auto text-xs tabular-nums text-ink-3">{column.tasks.length}</span>
            </div>

            <div className="space-y-2 rounded-sm bg-paper-deep/60 p-2">
              {column.tasks.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-ink-3">Nothing here</p>
              )}
              {column.tasks.map((task) => (
                <motion.button
                  key={task.id}
                  layout
                  type="button"
                  onClick={() => onOpen(task.id)}
                  className="w-full rounded-sm border border-rule bg-sheet px-3 py-2.5 text-left transition-colors hover:border-ink-3"
                >
                  <p className="text-[13px] font-medium leading-snug text-ink">{task.title}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {task.priority !== 'MEDIUM' && (
                      <Chip className={PRIORITY_META[task.priority].chip}>
                        {PRIORITY_META[task.priority].label}
                      </Chip>
                    )}
                    {task.team && <Chip>{task.team.name}</Chip>}
                  </div>

                  {task.completionPercent > 0 && task.status !== 'DONE' && (
                    <Meter value={task.completionPercent} className="mt-2.5" />
                  )}

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'text-[11px] tabular-nums',
                        task.isOverdue ? 'font-medium text-alert' : 'text-ink-3',
                      )}
                    >
                      {dueLabel(task.dueAt, task.status)}
                    </span>
                    {task.assignee && (
                      <Avatar
                        name={task.assignee.fullName}
                        src={task.assignee.avatarUrl}
                        size="xs"
                      />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
