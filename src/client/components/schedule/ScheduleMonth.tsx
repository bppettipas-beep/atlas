import type { ScheduleBlock } from '@shared/types';
import { cn } from '@/lib/utils';

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

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const STATUS_TONE: Record<string, string> = {
  NOT_STARTED: 'border-l-ink-4 bg-sheet',
  IN_PROGRESS: 'border-l-mark bg-mark/10',
  BLOCKED: 'border-l-alert bg-alert-wash',
  AWAITING_REVIEW: 'border-l-pending bg-pending/10',
  DONE: 'border-l-ink-4 bg-paper-deep opacity-60',
};

/** Compact month overview: task dates remain readable without a timeline scroll. */
export function ScheduleMonth({
  month,
  blocks,
  selectedTaskId,
  onOpenTask,
}: {
  month: Date;
  blocks: ScheduleBlock[];
  selectedTaskId: string | null;
  onOpenTask: (taskId: string) => void;
}) {
  const first = startOfDay(month);
  const gridStart = addDays(first, -((first.getDay() + 6) % 7));
  const today = startOfDay(new Date());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <div className="col-span-full grid min-h-0 grid-cols-7 overflow-hidden rounded-md border border-edge bg-sheet shadow-panel">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
        <div key={day} className="border-b border-r border-rule bg-paper px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 last:border-r-0">
          {day}
        </div>
      ))}
      {days.map((day) => {
        const events = blocks.filter((block) => sameDay(new Date(block.startAt), day));
        const inMonth = day.getMonth() === first.getMonth();
        return (
          <div
            key={day.toISOString()}
            className={cn(
              'min-h-[92px] border-b border-r border-rule p-1.5 last:border-r-0 sm:min-h-[112px]',
              !inMonth && 'bg-paper/50 text-ink-3',
            )}
          >
            <span className={cn('mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full text-edge', sameDay(day, today) && 'bg-mark px-1 font-semibold text-white shadow-sm')}>
              {day.getDate()}
            </span>
            <div className="space-y-1">
              {events.slice(0, 3).map((block) => (
                <button
                  key={block.taskId}
                  type="button"
                  onClick={() => onOpenTask(block.taskId)}
                  className={cn(
                    'block w-full truncate rounded-r-sm border-l-[3px] px-1.5 py-1 text-left text-[10px] font-medium text-ink shadow-sm transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-md sm:text-[11px]',
                    STATUS_TONE[block.status] ?? 'border-l-ink-4',
                    selectedTaskId === block.taskId && 'ring-1 ring-mark',
                  )}
                  title={`${new Date(block.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${block.title}`}
                >
                  <span className="hidden sm:inline">{new Date(block.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} </span>
                  {block.title}
                </button>
              ))}
              {events.length > 3 && <span className="block px-1 text-edge text-ink-3">+{events.length - 3} more</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
