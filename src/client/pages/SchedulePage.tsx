import { ArrowLeft, ArrowRight, Calendar, Plus, Warning } from '@/components/icons';
import { PageTransition } from '@/components/layout/AppShell';
import { ScheduleGrid, type ScheduleColumn } from '@/components/schedule/ScheduleGrid';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  SkeletonRows,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  PersonSummary,
  ScheduleBlock,
  SchedulePermissions,
  ScheduleResponse,
  TaskDetail,
} from '@shared/types';

type View = 'day' | 'week' | 'mine';
type Draft = { column: ScheduleColumn; start: Date; end: Date };

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function localDate(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function labelRange(from: Date, to: Date, view: View) {
  if (view === 'day')
    return from.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const end = addDays(to, -1);
  return `${from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** A single timeline over Task scheduling fields — it owns no separate task data. */
export function SchedulePage() {
  const { session, isLeadership } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const initialView = (params.get('view') as View | null) ?? (isLeadership ? 'day' : 'mine');
  const [view, setView] = useState<View>(initialView);
  const [anchor, setAnchor] = useState(() => {
    const requested = params.get('date');
    return requested ? startOfDay(new Date(`${requested}T12:00:00`)) : startOfDay(new Date());
  });
  const [resourceIds, setResourceIds] = useState<string[]>(() => {
    const requested = params.get('resources');
    if (requested) return requested.split(',').filter(Boolean);
    try {
      return JSON.parse(localStorage.getItem('atlas:schedule:resources') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(params.get('task'));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 639px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const from = view === 'day' ? startOfDay(anchor) : startOfWeek(anchor);
  const to = view === 'day' ? addDays(from, 1) : addDays(from, 7);
  const resourcesKey = resourceIds.join(',');

  useEffect(() => {
    localStorage.setItem('atlas:schedule:resources', JSON.stringify(resourceIds));
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('view', view);
        next.set('date', localDate(anchor));
        if (resourceIds.length) next.set('resources', resourcesKey);
        else next.delete('resources');
        return next;
      },
      { replace: true },
    );
  }, [anchor, resourceIds, resourcesKey, setParams, view]);

  const scheduleQuery = useQuery<ScheduleResponse>(
    (signal) =>
      api.get(
        '/schedule',
        { from: from.toISOString(), to: to.toISOString(), resources: resourcesKey || undefined },
        signal,
      ),
    [from.getTime(), to.getTime(), resourcesKey],
  );
  const permissionsQuery = useQuery<SchedulePermissions>(
    (signal) => api.get('/schedule/permissions', undefined, signal),
    [],
  );
  const peopleQuery = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', undefined, signal),
    [],
  );

  const refetch = useCallback(() => scheduleQuery.refetch(), [scheduleQuery]);
  useRealtimeEvent(
    ['schedule:updated', 'schedule:availability', 'task:updated', 'task:created'],
    refetch,
  );

  const resources = useMemo(
    () => scheduleQuery.data?.resources ?? [],
    [scheduleQuery.data?.resources],
  );
  const columns = useMemo<ScheduleColumn[]>(() => {
    if (view === 'day') {
      const selected = resources.filter(
        (resource) => !resourceIds.length || resourceIds.includes(resource.id),
      );
      const fallback = selected.length
        ? selected
        : resources.filter((item) => item.kind === 'PERSON').slice(0, 4);
      return (compact ? fallback.slice(0, 1) : fallback).map((resource) => ({
        key: resource.id,
        title: resource.name,
        subtitle: resource.subtitle,
        date: from,
        resourceId: resource.id,
        kind: resource.kind,
        color: resource.color,
        avatarUrl: resource.avatarUrl,
      }));
    }
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(from, index);
      return {
        key: localDate(date),
        title: date.toLocaleDateString(undefined, { weekday: 'short' }),
        subtitle: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        date,
        resourceId: null,
        kind: 'DATE' as const,
        color: null,
      };
    });
  }, [from, resourceIds, resources, view]);

  const blocks = scheduleQuery.data?.blocks ?? [];
  const canSchedule = Boolean(permissionsQuery.data?.canScheduleOthers);

  const move = async (block: ScheduleBlock, column: ScheduleColumn, start: Date, end: Date) => {
    const assigneeId = column.kind === 'PERSON' ? column.resourceId : undefined;
    const teamId = column.kind === 'TEAM' ? column.resourceId : undefined;
    if (
      (assigneeId && assigneeId !== block.assignee?.id) ||
      (teamId && teamId !== block.team?.id)
    ) {
      const label = column.title;
      if (!window.confirm(`Move “${block.title}” to ${label}? This also changes its assignment.`))
        return;
    }
    try {
      const result = await api.patch<{ conflicts: unknown[]; unavailable: boolean | null }>(
        `/schedule/tasks/${block.taskId}`,
        {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          ...(assigneeId ? { assigneeId } : {}),
          ...(teamId ? { teamId } : {}),
        },
      );
      if (result.conflicts.length || result.unavailable)
        toast.error(
          result.unavailable
            ? 'Saved, but this person is unavailable at that time.'
            : 'Saved, but this overlaps existing work.',
        );
      else toast.success('Schedule updated.');
      refetch();
    } catch (error) {
      toast.error(errorMessage(error));
      refetch();
    }
  };

  const createScheduled = async (task: TaskDetail) => {
    if (!draft) return;
    try {
      await api.patch(`/schedule/tasks/${task.id}`, {
        startAt: draft.start.toISOString(),
        endAt: draft.end.toISOString(),
        ...(draft.column.kind === 'PERSON' ? { assigneeId: draft.column.resourceId } : {}),
        ...(draft.column.kind === 'TEAM' ? { teamId: draft.column.resourceId } : {}),
      });
      toast.success('Task scheduled.');
      setDraft(null);
      refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const navigate = (direction: -1 | 1) =>
    setAnchor((current) => addDays(current, direction * (view === 'day' ? 1 : 7)));
  const setToday = () => setAnchor(startOfDay(new Date()));
  const taskPanelPeople = peopleQuery.data?.items ?? [];

  return (
    <PageTransition>
      <div className="flex h-full min-h-0 flex-col pl-14 pr-4 pt-4 sm:px-6 sm:py-5">
        <PageHeader
          eyebrow="Schedule"
          title={view === 'mine' ? 'My schedule' : 'The day, at a glance'}
          description={
            view === 'mine'
              ? 'Your scheduled work and availability for the coming week.'
              : 'Scheduled work is the same work tracked in Atlas — move it here and the task updates everywhere.'
          }
          actions={
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              disabled={!canSchedule}
              onClick={() =>
                setDraft({
                  column: columns[0] ?? {
                    key: 'mine',
                    title: 'My schedule',
                    subtitle: null,
                    date: from,
                    resourceId: session?.membership.id ?? null,
                    kind: 'PERSON',
                    color: null,
                    avatarUrl: null,
                  },
                  start: new Date(),
                  end: new Date(Date.now() + 3_600_000),
                })
              }
            >
              New scheduled task
            </Button>
          }
        />
        <div className="mb-3 flex flex-wrap items-center gap-2 border-y border-rule py-2">
          <div className="flex rounded-sm border border-edge bg-paper p-0.5">
            {[
              { value: 'day' as const, label: 'Day' },
              { value: 'week' as const, label: 'Week' },
              { value: 'mine' as const, label: 'Mine' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setView(option.value);
                  if (option.value === 'mine' && session) setResourceIds([session.membership.id]);
                }}
                className={cn(
                  'rounded-sm px-3 py-1.5 text-[12px] font-medium transition-colors',
                  view === option.value
                    ? 'bg-ink text-white shadow-sm'
                    : 'text-ink-3 hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 sm:ml-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              aria-label="Previous period"
              onClick={() => navigate(-1)}
            />
            <Button size="sm" variant="ghost" onClick={setToday}>
              Today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
              aria-label="Next period"
              onClick={() => navigate(1)}
            />
            <span className="ml-2 text-[13px] font-medium text-ink">
              {labelRange(from, to, view === 'mine' ? 'week' : view)}
            </span>
          </div>
          <span className="ml-auto hidden text-edge text-ink-3 md:block">
            Drag work to move · drag open time to add
          </span>
        </div>
        {isLeadership && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label
              className="text-edge font-medium uppercase tracking-wider text-ink-3"
              htmlFor="schedule-resource"
            >
              Resources
            </label>
            <Select
              id="schedule-resource"
              className="h-9 min-w-0 flex-1 sm:min-w-[220px] sm:flex-none"
              value={resourceIds[0] ?? ''}
              onChange={(event) => setResourceIds(event.target.value ? [event.target.value] : [])}
            >
              <option value="">Show the crew</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.kind === 'TEAM' ? 'Team · ' : ''}
                  {resource.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {scheduleQuery.loading && !scheduleQuery.data && <SkeletonRows rows={7} />}
        {scheduleQuery.error && <ErrorState message={scheduleQuery.error} onRetry={refetch} />}
        {scheduleQuery.data && columns.length === 0 && (
          <EmptyState
            icon={<Calendar className="h-5 w-5" />}
            title="Choose a person or team"
            description="There are no resources available for this schedule yet."
          />
        )}
        {scheduleQuery.data && columns.length > 0 && (
          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_230px]">
            <ScheduleGrid
              columns={columns}
              blocks={blocks}
              availability={scheduleQuery.data.availability}
              dayStartHour={6}
              dayEndHour={21}
              editable={canSchedule}
              selectedTaskId={selectedTaskId}
              onOpenTask={(id) => {
                setSelectedTaskId(id);
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.set('task', id);
                    return next;
                  },
                  { replace: true },
                );
              }}
              onCreate={(column, start, end) => setDraft({ column, start, end })}
              onMove={move}
            />
            <ScheduleRail
              resources={resources}
              workload={scheduleQuery.data.workload}
              blocks={blocks}
              selectedResourceId={resourceIds[0] ?? null}
              onSelect={(id) => setResourceIds(id ? [id] : [])}
              onOpenTask={setSelectedTaskId}
            />
          </div>
        )}
        {scheduleQuery.data?.hiddenCount ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
            <Warning className="h-3.5 w-3.5" />
            {scheduleQuery.data.hiddenCount} item(s) are hidden because you do not have access.
          </p>
        ) : null}
      </div>
      <TaskComposer
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        onCreated={createScheduled}
        defaultAssigneeId={
          draft?.column.kind === 'PERSON' ? (draft.column.resourceId ?? undefined) : undefined
        }
        defaultTeamId={
          draft?.column.kind === 'TEAM' ? (draft.column.resourceId ?? undefined) : undefined
        }
      />
      <TaskDetailPanel
        taskId={selectedTaskId}
        people={taskPanelPeople}
        onClose={() => {
          setSelectedTaskId(null);
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.delete('task');
              return next;
            },
            { replace: true },
          );
        }}
        onChanged={refetch}
      />
    </PageTransition>
  );
}

function ScheduleRail({
  resources,
  workload,
  blocks,
  selectedResourceId,
  onSelect,
  onOpenTask,
}: {
  resources: ScheduleResponse['resources'];
  workload: ScheduleResponse['workload'];
  blocks: ScheduleBlock[];
  selectedResourceId: string | null;
  onSelect: (id: string | null) => void;
  onOpenTask: (id: string) => void;
}) {
  const workloadById = new Map(workload.map((entry) => [entry.membershipId, entry]));
  const attention = blocks
    .filter(
      (block) =>
        block.conflictsWith.length || block.outsideAvailability || block.status === 'BLOCKED',
    )
    .slice(0, 4);

  return (
    <aside className="hidden min-h-0 overflow-y-auto rounded-sm border border-rule bg-sheet xl:block">
      <div className="border-b border-rule bg-paper px-3 py-3">
        <p className="edge-sm">Crew board</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Focus the board on one person.
        </p>
      </div>
      <div className="divide-y divide-rule">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-paper',
            !selectedResourceId && 'bg-paper',
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center border border-edge bg-sheet font-mono text-[10px] text-ink-3">
            ALL
          </span>
          <span>
            <span className="block text-[12px] font-medium text-ink">Everyone</span>
            <span className="block text-edge text-ink-3">Company view</span>
          </span>
        </button>
        {resources
          .filter((resource) => resource.kind === 'PERSON')
          .map((resource) => {
            const load = workloadById.get(resource.id);
            const overfull = load && load.scheduledMinutes > load.availableMinutes;
            return (
              <button
                key={resource.id}
                type="button"
                onClick={() => onSelect(resource.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-paper',
                  selectedResourceId === resource.id && 'bg-paper',
                )}
              >
                <Avatar name={resource.name} src={resource.avatarUrl} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {resource.name}
                  </span>
                  <span className={cn('block text-edge', overfull ? 'text-alert' : 'text-ink-3')}>
                    {load
                      ? `${Math.round((load.scheduledMinutes / 60) * 10) / 10}h booked`
                      : 'No work booked'}
                  </span>
                </span>
                {load?.conflictCount || load?.outsideAvailabilityCount ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-alert" title="Needs attention" />
                ) : null}
              </button>
            );
          })}
      </div>
      {attention.length > 0 && (
        <div className="border-t border-rule p-3">
          <p className="edge-sm mb-2">Needs attention</p>
          <div className="space-y-1.5">
            {attention.map((block) => (
              <button
                key={block.taskId}
                type="button"
                onClick={() => onOpenTask(block.taskId)}
                className="block w-full border-l-2 border-alert bg-alert-wash px-2 py-1.5 text-left"
              >
                <span className="block truncate text-[11px] font-medium text-ink">
                  {block.title}
                </span>
                <span className="text-edge text-alert">
                  {block.status === 'BLOCKED'
                    ? 'Blocked'
                    : block.outsideAvailability
                      ? 'Outside availability'
                      : 'Overlaps work'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
