/**
 * The scheduling timeline.
 *
 * One component serves both views because they differ only in what a column
 * means: in Day view a column is a person or a team, in Week view it is a
 * date. Everything else — the hour rules, the drag maths, the lane packing —
 * is identical, and duplicating it would guarantee the two drifted apart.
 *
 * Positions are computed from minutes, never from stored pixel values, so the
 * grid is correct at any zoom and after any resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ScheduleAvailability, ScheduleBlock } from '@shared/types';

/** Pixels per hour. Tall enough to read a title in a one-hour block. */
const HOUR_HEIGHT = 64;
/** Everything snaps to this, so two blocks booked "at 9" line up exactly. */
const SNAP_MINUTES = 15;

export interface ScheduleColumn {
  key: string;
  title: string;
  subtitle: string | null;
  /** The day this column covers. */
  date: Date;
  /** Person or team whose work belongs here. Null means "anyone selected". */
  resourceId: string | null;
  kind: 'PERSON' | 'TEAM' | 'DATE';
  color: string | null;
  avatarUrl?: string | null;
}

interface Placed {
  block: ScheduleBlock;
  start: Date;
  end: Date;
  /** Lane index and lane count, for side-by-side overlapping work. */
  lane: number;
  lanes: number;
}

interface DragState {
  kind: 'create' | 'move' | 'resize';
  columnKey: string;
  taskId?: string;
  /** Minutes from midnight. */
  startMinute: number;
  endMinute: number;
  /** Where in the block the pointer grabbed, in minutes. */
  grabOffset: number;
}

export interface ScheduleGridProps {
  columns: ScheduleColumn[];
  blocks: ScheduleBlock[];
  availability: ScheduleAvailability[];
  dayStartHour: number;
  dayEndHour: number;
  editable: boolean;
  selectedTaskId: string | null;
  onOpenTask: (taskId: string) => void;
  onCreate: (column: ScheduleColumn, start: Date, end: Date) => void;
  onMove: (block: ScheduleBlock, column: ScheduleColumn, start: Date, end: Date) => void;
}

const STATUS_TONE: Record<string, string> = {
  NOT_STARTED: 'border-l-ink-4',
  IN_PROGRESS: 'border-l-mark',
  BLOCKED: 'border-l-danger',
  AWAITING_REVIEW: 'border-l-warning',
  DONE: 'border-l-ink-4',
};

function minutesOf(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function snap(minute: number) {
  return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Packs overlapping blocks into side-by-side lanes.
 *
 * A conflict is still drawn as a conflict — this only stops two overlapping
 * jobs from covering each other up so neither can be read or grabbed.
 */
function packLanes(entries: { block: ScheduleBlock; start: Date; end: Date }[]): Placed[] {
  const sorted = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneEnds: number[] = [];
  const withLanes = sorted.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.start.getTime());
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = entry.end.getTime();
    return { ...entry, lane, lanes: 1 };
  });

  // A block shares its width with everything it actually overlaps, not with
  // every block in the column.
  return withLanes.map((entry) => {
    const overlapping = withLanes.filter(
      (other) =>
        other.start.getTime() < entry.end.getTime() && entry.start.getTime() < other.end.getTime(),
    );
    return { ...entry, lanes: Math.max(...overlapping.map((other) => other.lane + 1)) };
  });
}

export function ScheduleGrid({
  columns,
  blocks,
  availability,
  dayStartHour,
  dayEndHour,
  editable,
  selectedTaskId,
  onOpenTask,
  onCreate,
  onMove,
}: ScheduleGridProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [now, setNow] = useState(() => new Date());

  const dayStartMinute = dayStartHour * 60;
  const dayEndMinute = dayEndHour * 60;
  const totalMinutes = dayEndMinute - dayStartMinute;
  const bodyHeight = (totalMinutes / 60) * HOUR_HEIGHT;

  // The "now" line is only honest if it moves.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let hour = dayStartHour; hour <= dayEndHour; hour += 1) out.push(hour);
    return out;
  }, [dayStartHour, dayEndHour]);

  const availabilityById = useMemo(
    () => new Map(availability.map((entry) => [entry.membershipId, entry])),
    [availability],
  );

  const byColumn = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const column of columns) {
      const entries = blocks
        .filter((block) => {
          const start = new Date(block.startAt);
          if (!sameDay(start, column.date)) return false;
          if (!column.resourceId) return true;
          return block.resourceIds.includes(column.resourceId);
        })
        .map((block) => ({
          block,
          start: new Date(block.startAt),
          end: new Date(block.endAt),
        }));
      map.set(column.key, packLanes(entries));
    }
    return map;
  }, [columns, blocks]);

  const minuteFromPointer = useCallback(
    (clientY: number) => {
      const body = bodyRef.current;
      if (!body) return dayStartMinute;
      const rect = body.getBoundingClientRect();
      const offset = clientY - rect.top + body.scrollTop;
      const minute = dayStartMinute + (offset / HOUR_HEIGHT) * 60;
      return Math.min(Math.max(minute, dayStartMinute), dayEndMinute);
    },
    [dayStartMinute, dayEndMinute],
  );

  const dateAt = useCallback((column: ScheduleColumn, minute: number) => {
    const date = new Date(column.date);
    date.setHours(0, minute, 0, 0);
    return date;
  }, []);

  // ------------------------------ dragging ---------------------------------

  useEffect(() => {
    if (!drag) return;

    const onPointerMove = (event: PointerEvent) => {
      const minute = snap(minuteFromPointer(event.clientY));
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const nextColumnKey =
        target?.closest<HTMLElement>('[data-schedule-column]')?.dataset.scheduleColumn;
      setDrag((current) => {
        if (!current) return current;
        const columnKey =
          nextColumnKey && columns.some((column) => column.key === nextColumnKey)
            ? nextColumnKey
            : current.columnKey;
        if (current.kind === 'resize') {
          return {
            ...current,
            columnKey,
            endMinute: Math.max(minute, current.startMinute + SNAP_MINUTES),
          };
        }
        if (current.kind === 'move') {
          const length = current.endMinute - current.startMinute;
          const start = Math.min(
            Math.max(minute - current.grabOffset, dayStartMinute),
            dayEndMinute - length,
          );
          return {
            ...current,
            columnKey,
            startMinute: snap(start),
            endMinute: snap(start) + length,
          };
        }
        return {
          ...current,
          columnKey,
          endMinute: Math.max(minute, current.startMinute + SNAP_MINUTES),
        };
      });
    };

    const onPointerUp = () => {
      setDrag((current) => {
        if (!current) return null;
        const column = columns.find((item) => item.key === current.columnKey) ?? columns[0];
        if (!column) return null;

        const start = dateAt(column, current.startMinute);
        const end = dateAt(column, current.endMinute);

        if (current.kind === 'create') {
          // A click, not a drag. Opening a composer for a zero-length slot is
          // never what somebody meant.
          if (current.endMinute - current.startMinute >= SNAP_MINUTES) onCreate(column, start, end);
        } else {
          const block = blocks.find((item) => item.taskId === current.taskId);
          if (block) onMove(block, column, start, end);
        }
        return null;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [
    drag,
    columns,
    blocks,
    dateAt,
    minuteFromPointer,
    dayStartMinute,
    dayEndMinute,
    onCreate,
    onMove,
  ]);

  const startCreate = (column: ScheduleColumn, event: React.PointerEvent) => {
    if (!editable) return;
    if (event.button !== 0) return;
    const minute = snap(minuteFromPointer(event.clientY));
    setDrag({
      kind: 'create',
      columnKey: column.key,
      startMinute: minute,
      endMinute: minute + SNAP_MINUTES * 2,
      grabOffset: 0,
    });
  };

  const startMove = (placed: Placed, column: ScheduleColumn, event: React.PointerEvent) => {
    if (!editable) return;
    event.stopPropagation();
    const minute = snap(minuteFromPointer(event.clientY));
    setDrag({
      kind: 'move',
      columnKey: column.key,
      taskId: placed.block.taskId,
      startMinute: minutesOf(placed.start),
      endMinute: minutesOf(placed.end),
      grabOffset: minute - minutesOf(placed.start),
    });
  };

  const startResize = (placed: Placed, column: ScheduleColumn, event: React.PointerEvent) => {
    if (!editable) return;
    event.stopPropagation();
    setDrag({
      kind: 'resize',
      columnKey: column.key,
      taskId: placed.block.taskId,
      startMinute: minutesOf(placed.start),
      endMinute: minutesOf(placed.end),
      grabOffset: 0,
    });
  };

  const topFor = (minute: number) => ((minute - dayStartMinute) / 60) * HOUR_HEIGHT;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-edge bg-sheet shadow-panel">
      {/* --------------------------- column heads --------------------------- */}
      <div className="flex shrink-0 border-b border-rule bg-paper/80">
        <div className="w-14 shrink-0 border-r border-rule" />
        {columns.map((column) => (
          <div
            key={column.key}
            className="min-w-0 flex-1 border-r border-rule px-2.5 py-2.5 last:border-r-0"
          >
            <div className="flex items-center gap-2">
              {column.kind === 'PERSON' && (
                <Avatar name={column.title} src={column.avatarUrl} size="xs" />
              )}
              {column.color && (
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: column.color }}
                />
              )}
              <span className="truncate text-[12px] font-semibold text-ink">{column.title}</span>
            </div>
            {column.subtitle && (
              <span className="mt-0.5 block truncate text-edge text-ink-3">{column.subtitle}</span>
            )}
          </div>
        ))}
      </div>

      {/* ------------------------------ body -------------------------------- */}
      <div ref={bodyRef} className="relative flex min-h-0 flex-1 overflow-y-auto">
        {/* hour gutter */}
        <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-rule bg-sheet">
          <div style={{ height: bodyHeight }} className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-1.5 -translate-y-1/2 text-edge text-ink-3"
                style={{ top: topFor(hour * 60) }}
              >
                {hour === 0 || hour === 24
                  ? '12a'
                  : hour === 12
                    ? '12p'
                    : hour > 12
                      ? `${hour - 12}p`
                      : `${hour}a`}
              </div>
            ))}
          </div>
        </div>

        {columns.map((column) => {
          const placed = byColumn.get(column.key) ?? [];
          const dayAvailability = column.resourceId
            ? availabilityById.get(column.resourceId)
            : undefined;
          const window = dayAvailability?.workingHours.find(
            (entry) => entry.weekday === column.date.getDay(),
          );
          const isToday = sameDay(column.date, now);

          return (
            <div
              key={column.key}
              data-schedule-column={column.key}
              className="relative min-w-0 flex-1 border-r border-rule last:border-r-0"
              onPointerDown={(event) => startCreate(column, event)}
            >
              <div style={{ height: bodyHeight }} className="relative">
                {/* Outside working hours, shaded rather than hidden: the time
                    still exists and can still be booked with a warning. */}
                {dayAvailability && dayAvailability.workingHours.length > 0 && (
                  <>
                    <div
                      className="absolute inset-x-0 bg-paper-deep/60"
                      style={{
                        top: 0,
                        height: Math.max(topFor(window ? window.startMinute : dayEndMinute), 0),
                      }}
                    />
                    {window && (
                      <div
                        className="absolute inset-x-0 bg-paper-deep/60"
                        style={{
                          top: topFor(window.endMinute),
                          height: Math.max(bodyHeight - topFor(window.endMinute), 0),
                        }}
                      />
                    )}
                  </>
                )}

                {/* time off */}
                {dayAvailability?.timeOff
                  .filter((period) => sameDay(new Date(period.startAt), column.date))
                  .map((period) => {
                    const from = minutesOf(new Date(period.startAt));
                    const to = minutesOf(new Date(period.endAt));
                    return (
                      <div
                        key={period.id}
                        title={period.note ?? 'Time off'}
                        className="absolute inset-x-0 border-y border-dashed border-rule bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.045)_5px,rgba(0,0,0,0.045)_10px)]"
                        style={{
                          top: topFor(from),
                          height: Math.max(topFor(to) - topFor(from), 8),
                        }}
                      />
                    );
                  })}

                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-rule/60"
                    style={{ top: topFor(hour * 60) }}
                  />
                ))}

                {isToday && minutesOf(now) >= dayStartMinute && minutesOf(now) <= dayEndMinute && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t border-mark"
                    style={{ top: topFor(minutesOf(now)) }}
                  >
                    <span className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-mark" />
                  </div>
                )}

                {/* the block being dragged out */}
                {drag && drag.columnKey === column.key && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-30 rounded-sm border border-mark bg-mark/10"
                    style={{
                      top: topFor(drag.startMinute),
                      height: Math.max(topFor(drag.endMinute) - topFor(drag.startMinute), 12),
                    }}
                  >
                    <span className="block px-1.5 py-0.5 text-edge text-mark">
                      {formatTime(dateAt(column, drag.startMinute))} –{' '}
                      {formatTime(dateAt(column, drag.endMinute))}
                    </span>
                  </div>
                )}

                {placed.map((entry) => {
                  const from = minutesOf(entry.start);
                  const to = sameDay(entry.end, column.date) ? minutesOf(entry.end) : dayEndMinute;
                  const height = Math.max(topFor(to) - topFor(from), 18);
                  const width = 100 / entry.lanes;
                  const dragging = drag?.taskId === entry.block.taskId;

                  return (
                    <button
                      key={entry.block.taskId}
                      type="button"
                      onPointerDown={(event) => startMove(entry, column, event)}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!drag) onOpenTask(entry.block.taskId);
                      }}
                      title={`${entry.block.title} · ${formatTime(entry.start)}–${formatTime(entry.end)}`}
                      className={cn(
                        'group absolute z-10 overflow-hidden rounded-sm border border-l-[3px] border-rule bg-sheet px-2 py-1.5 text-left shadow-sm transition-[box-shadow,transform] hover:z-20 hover:-translate-y-px hover:shadow-lift',
                        STATUS_TONE[entry.block.status] ?? 'border-l-ink-4',
                        entry.block.status === 'DONE' && 'opacity-55',
                        entry.block.conflictsWith.length > 0 && 'ring-danger/60 ring-1',
                        entry.block.outsideAvailability && 'border-dashed',
                        selectedTaskId === entry.block.taskId && 'ring-2 ring-mark',
                        dragging && 'opacity-40',
                        editable && 'cursor-grab active:cursor-grabbing',
                      )}
                      style={{
                        top: topFor(from),
                        height,
                        left: `calc(${entry.lane * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <span className="block truncate text-[11px] font-medium leading-tight text-ink">
                        {entry.block.title}
                      </span>
                      {height > 32 && (
                        <span className="mt-0.5 block truncate text-edge text-ink-3">
                          {formatTime(entry.start)}
                          {entry.block.assignee && column.kind !== 'PERSON'
                            ? ` · ${entry.block.assignee.fullName}`
                            : ''}
                        </span>
                      )}
                      {entry.block.conflictsWith.length > 0 && (
                        <span className="bg-danger absolute right-1 top-1 h-1.5 w-1.5 rounded-full" />
                      )}

                      {editable && (
                        <span
                          role="presentation"
                          onPointerDown={(event) => startResize(entry, column, event)}
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <span className="mx-auto block h-0.5 w-6 rounded-full bg-ink-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
