import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity as ActivityGlyph, X } from '@/components/icons';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { ACTIVITY_LABELS, cn, formatTime, relativeTime } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import {
  ACTIVITY_TYPES,
  type ActivityEventDto,
  type ActivityType,
  type PersonSummary,
  type TeamDto,
} from '@shared/types';

/**
 * The company timeline. Grouped by day with the date printed in the margin, so
 * a long feed still reads as a record rather than an endless list.
 */
export function ActivityPage() {
  const { isLeadership } = useAuth();
  const [type, setType] = useState<ActivityType | ''>('');
  const [personId, setPersonId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [from, setFrom] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState<ActivityEventDto[]>([]);

  const query = useQuery<{ items: ActivityEventDto[]; nextCursor: string | null }>(
    (signal) =>
      api.get(
        '/activity',
        { type: type || undefined, personId, teamId, from: from || undefined, cursor, limit: 40 },
        signal,
      ),
    [type, personId, teamId, from, cursor],
  );

  const people = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', undefined, signal),
    [],
  );
  const teams = useQuery<{ items: TeamDto[] }>(
    (signal) => api.get('/organization/teams', undefined, signal),
    [],
  );

  useRealtimeEvent('activity:new', () => {
    if (!cursor) query.refetch();
  });

  // Only the first page is shown live; "Load more" appends older pages.
  const events = cursor
    ? [...accumulated, ...(query.data?.items ?? [])]
    : (query.data?.items ?? []);

  const grouped = events.reduce<Record<string, ActivityEventDto[]>>((groups, event) => {
    const day = new Date(event.createdAt).toDateString();
    (groups[day] ??= []).push(event);
    return groups;
  }, {});

  const hasFilters = Boolean(type || personId || teamId || from);
  const clear = () => {
    setType('');
    setPersonId('');
    setTeamId('');
    setFrom('');
    setCursor(null);
    setAccumulated([]);
  };

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="Activity"
          title="The company's memory"
          description={
            isLeadership
              ? 'Everything that has changed — who joined, what moved, what was escalated. Manager-only events are included for you.'
              : 'Everything that has changed across the company.'
          }
        />

        {/* ------------------------------ filters ---------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value as ActivityType | '');
              setCursor(null);
              setAccumulated([]);
            }}
            aria-label="Filter by event type"
            className="h-8 w-auto min-w-[170px]"
          >
            <option value="">All event types</option>
            {ACTIVITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_LABELS[value] ?? value}
              </option>
            ))}
          </Select>

          <Select
            value={personId}
            onChange={(event) => {
              setPersonId(event.target.value);
              setCursor(null);
              setAccumulated([]);
            }}
            aria-label="Filter by person"
            className="h-8 w-auto min-w-[150px]"
          >
            <option value="">Anyone</option>
            {(people.data?.items ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </Select>

          <Select
            value={teamId}
            onChange={(event) => {
              setTeamId(event.target.value);
              setCursor(null);
              setAccumulated([]);
            }}
            aria-label="Filter by team"
            className="h-8 w-auto min-w-[140px]"
          >
            <option value="">All teams</option>
            {(teams.data?.items ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>

          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setCursor(null);
              setAccumulated([]);
            }}
            aria-label="Show events since"
            className="h-8 w-auto"
          />

          {hasFilters && (
            <Button size="sm" variant="ghost" icon={<X />} onClick={clear}>
              Clear
            </Button>
          )}
        </div>

        {query.loading && events.length === 0 && <SkeletonRows rows={6} />}
        {query.error && <ErrorState message={query.error} onRetry={query.refetch} />}

        {query.data && events.length === 0 && (
          <EmptyState
            icon={<ActivityGlyph />}
            title={hasFilters ? 'No events match those filters' : 'Nothing has happened yet'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'As people join, tasks move and documents change, Atlas records it here.'
            }
            action={hasFilters ? <Button onClick={clear}>Clear filters</Button> : undefined}
          />
        )}

        {events.length > 0 && (
          <div className="border-t border-edge">
            {Object.entries(grouped).map(([day, dayEvents]) => (
              <Fragment key={day}>
                <div className="sticky top-0 z-10 flex items-center gap-3 bg-paper/95 py-2 backdrop-blur-[2px]">
                  <span className="edge-sm">
                    {new Date(day).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-rule" />
                  <span className="font-mono text-[10px] text-ink-4">
                    {String(dayEvents.length).padStart(2, '0')}
                  </span>
                </div>

                <ol className="border-b border-rule bg-sheet">
                  {dayEvents.map((event) => (
                    <li
                      key={event.id}
                      className="flex gap-3 border-b border-rule px-4 py-3 last:border-0"
                    >
                      <span className="w-11 shrink-0 pt-px font-mono text-[10px] leading-relaxed text-ink-4">
                        {formatTime(event.createdAt)}
                      </span>

                      {event.actor ? (
                        <Avatar name={event.actor.fullName} src={event.actor.avatarUrl} size="xs" />
                      ) : (
                        <span
                          aria-hidden
                          className="mt-[5px] h-[5px] w-[5px] shrink-0 bg-edgeStrong"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug text-ink-2">{event.summary}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="edge-sm">
                            {ACTIVITY_LABELS[event.type] ?? event.type}
                          </span>
                          {event.taskId && (
                            <Link
                              to={`/app/work?task=${event.taskId}`}
                              className="text-[11px] text-mark underline decoration-mark/30 underline-offset-2 hover:decoration-mark"
                            >
                              Open task
                            </Link>
                          )}
                          {event.documentId && (
                            <Link
                              to={`/app/knowledge/${event.documentId}`}
                              className="text-[11px] text-mark underline decoration-mark/30 underline-offset-2 hover:decoration-mark"
                            >
                              Open document
                            </Link>
                          )}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'hidden shrink-0 self-center text-[11px] text-ink-4 sm:block',
                        )}
                      >
                        {relativeTime(event.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              </Fragment>
            ))}

            {query.data?.nextCursor && (
              <div className="flex justify-center py-6">
                <Button
                  loading={query.loading}
                  onClick={() => {
                    setAccumulated(events);
                    setCursor(query.data!.nextCursor);
                  }}
                >
                  Load older events
                </Button>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </PageTransition>
  );
}
