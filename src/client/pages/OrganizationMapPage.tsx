import { motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Funnel, Search, Sliders, UserPlus, X } from '@/components/icons';
import { LogoMark } from '@/components/Logo';
import { OrganizationMap } from '@/components/org/OrganizationMap';
import { ProfilePanel } from '@/components/people/ProfilePanel';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import {
  Button,
  Checkbox,
  DRAFT_EASE,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Menu,
  Select,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/useQuery';
import { RELATIONSHIP_META, cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import {
  RELATIONSHIP_TYPES,
  type OrgGraphDto,
  type PersonSummary,
  type RelationshipType,
  type TaskSummary,
  type TeamDto,
} from '@shared/types';

/** Shared skills are off by default: useful on demand, noise all the time. */
const DEFAULT_VISIBLE: RelationshipType[] = [
  'REPORTS_TO',
  'TEAM_MEMBER',
  'COLLABORATES_WITH',
  'OWNS_AREA',
  'MENTORS',
];

export function OrganizationMapPage() {
  const { isLeadership } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState('');
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(DEFAULT_VISIBLE));
  const [composerFor, setComposerFor] = useState<{ id: string; fullName: string } | null>(null);

  const debouncedSearch = useDebounced(search, 300);
  const selectedNodeId = params.get('node');

  const graphQuery = useQuery<OrgGraphDto>(
    (signal) =>
      api.get<OrgGraphDto>('/organization/graph', { search: debouncedSearch, teamId }, signal),
    [debouncedSearch, teamId],
  );
  const teamsQuery = useQuery<{ items: TeamDto[] }>(
    (signal) => api.get('/organization/teams', undefined, signal),
    [],
  );
  const tasksQuery = useQuery<{ items: TaskSummary[] }>(
    (signal) => api.get('/tasks', { includeDone: false, limit: 200 }, signal),
    [],
  );
  const peopleQuery = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', undefined, signal),
    [],
  );

  useRealtimeEvent(['organization:updated', 'people:updated', 'organization:layout'], () =>
    graphQuery.refetch(),
  );
  useRealtimeEvent(['task:created', 'task:updated', 'task:deleted'], () => tasksQuery.refetch());

  const selectedPersonId = useMemo(() => {
    if (!selectedNodeId || !graphQuery.data) return null;
    return graphQuery.data.nodes.find((node) => node.id === selectedNodeId)?.person?.id ?? null;
  }, [selectedNodeId, graphQuery.data]);

  const selectNode = useCallback(
    (nodeId: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nodeId) next.set('node', nodeId);
          else next.delete('node');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const savePositions = useCallback(
    async (positions: { id: string; x: number; y: number }[]) => {
      try {
        await api.patch('/organization/nodes/positions', { positions });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [toast],
  );

  const summary = graphQuery.data?.summary;
  const isEmpty =
    graphQuery.data && graphQuery.data.nodes.length <= 1 && !debouncedSearch && !teamId;
  const noMatches =
    graphQuery.data && graphQuery.data.nodes.length === 0 && Boolean(debouncedSearch || teamId);

  return (
    <div className="flex h-full flex-col">
      {/* ============================ title block ============================ */}
      <header className="shrink-0 border-b border-edge bg-sheet">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 px-5 pb-4 pt-5 sm:px-8">
          <div className="min-w-0">
            <p className="edge-sm mb-2">Organization map · Sheet 01</p>
            <h1 className="display text-[26px] leading-none sm:text-[34px]">
              Your business, connected
            </h1>
          </div>

          {summary && (
            <dl className="flex flex-wrap items-stretch gap-x-7 gap-y-3">
              <Readout label="People" value={summary.people} />
              <Readout label="Teams" value={summary.teams} />
              <Readout label="Active" value={summary.activeTasks} />
              <Readout
                label="Overdue"
                value={summary.overdueTasks}
                tone={summary.overdueTasks > 0 ? 'alert' : undefined}
                onClick={() => navigate('/app/work?scope=overdue')}
              />
              <Readout
                label="Unassigned"
                value={summary.unassignedTasks}
                tone={summary.unassignedTasks > 0 ? 'pending' : undefined}
                onClick={() => navigate('/app/work?scope=unassigned')}
              />
            </dl>
          )}
        </div>

        {/* ------------------------------ controls --------------------------- */}
        <div className="flex flex-wrap items-center gap-2 border-t border-rule px-5 py-2.5 sm:px-8">
          <div className="relative min-w-[170px] flex-1 sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-4" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a person"
              aria-label="Search people on the map"
              className="h-8 pl-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
              >
                <X className="text-[12px]" />
              </button>
            )}
          </div>

          <Select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            aria-label="Filter by team"
            className="h-8 w-auto min-w-[140px]"
          >
            <option value="">All teams</option>
            {(teamsQuery.data?.items ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>

          <Menu
            align="right"
            trigger={({ toggle }) => (
              <Button size="md" icon={<Sliders />} onClick={toggle}>
                Lines
                <span className="ml-1 font-mono text-[10px] text-ink-3">
                  {String(visibleTypes.size).padStart(2, '0')}
                </span>
              </Button>
            )}
          >
            {() => (
              <div className="w-[228px] px-1 py-1">
                <p className="edge-sm px-2 pb-2 pt-1">Line types</p>
                {RELATIONSHIP_TYPES.map((type) => (
                  <div key={type} className="px-2 py-1.5">
                    <Checkbox
                      checked={visibleTypes.has(type)}
                      onChange={() =>
                        setVisibleTypes((current) => {
                          const next = new Set(current);
                          if (next.has(type)) next.delete(type);
                          else next.add(type);
                          return next;
                        })
                      }
                      label={
                        <span className="flex items-center gap-2">
                          <LineSample type={type} />
                          {RELATIONSHIP_META[type].label}
                        </span>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </Menu>

          {isLeadership && (
            <>
              <span className="ml-auto hidden font-mono text-[10px] text-ink-4 lg:block">
                DRAG TO REARRANGE · LAYOUT SAVES FOR EVERYONE
              </span>
              <Button
                size="md"
                variant="primary"
                icon={<UserPlus />}
                onClick={() => navigate('/app/invitations')}
              >
                Invite people
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ============================== canvas ============================== */}
      <div className="relative min-h-0 flex-1">
        {graphQuery.loading && !graphQuery.data && <LoadingState label="Drawing your map" />}

        {graphQuery.error && (
          <div className="p-6">
            <ErrorState message={graphQuery.error} onRetry={graphQuery.refetch} />
          </div>
        )}

        {isEmpty && (
          <div className="drafting-grid flex h-full items-center justify-center p-6">
            <EmptyState
              className="max-w-lg bg-sheet"
              icon={<LogoMark className="h-5 w-5" />}
              title="One node so far — you"
              description="Invite someone and Atlas draws the reporting lines, teams, shared skills and knowledge ownership for you. Nothing to wire up."
              action={
                isLeadership ? (
                  <Button
                    variant="primary"
                    icon={<UserPlus />}
                    onClick={() => navigate('/app/invitations')}
                  >
                    Invite your first worker
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}

        {noMatches && (
          <div className="drafting-grid flex h-full items-center justify-center p-6">
            <EmptyState
              className="max-w-md bg-sheet"
              icon={<Funnel />}
              title="Nobody matches"
              description="Try a different name, or clear the team filter."
              action={
                <Button
                  onClick={() => {
                    setSearch('');
                    setTeamId('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        )}

        {graphQuery.data && !isEmpty && !noMatches && (
          <>
            <OrganizationMap
              graph={graphQuery.data}
              tasks={tasksQuery.data?.items ?? []}
              selectedNodeId={selectedNodeId}
              visibleTypes={visibleTypes}
              editable={isLeadership}
              onSelect={selectNode}
              onPositionsChange={(positions) => void savePositions(positions)}
            />

            {/* Legend, printed like a drawing key. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2, ease: DRAFT_EASE }}
              className="bg-sheet/92 pointer-events-none absolute right-3 top-3 hidden border border-rule backdrop-blur-[2px] sm:block"
            >
              <p className="edge-sm border-b border-rule px-2.5 py-1.5">Key</p>
              <ul className="space-y-1.5 px-2.5 py-2">
                {Array.from(visibleTypes).map((type) => (
                  <li key={type} className="flex items-center gap-2 text-[11px] text-ink-2">
                    <LineSample type={type} />
                    {RELATIONSHIP_META[type].label}
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </div>

      <ProfilePanel
        membershipId={selectedPersonId}
        people={peopleQuery.data?.items ?? []}
        onClose={() => selectNode(null)}
        onChanged={() => {
          graphQuery.refetch();
          peopleQuery.refetch();
        }}
        onAssignTask={(person) => setComposerFor({ id: person.id, fullName: person.fullName })}
      />

      <TaskComposer
        open={Boolean(composerFor)}
        onClose={() => setComposerFor(null)}
        defaultAssigneeId={composerFor?.id}
        onCreated={() => {
          setComposerFor(null);
          tasksQuery.refetch();
          toast.success('Task created.');
        }}
      />
    </div>
  );
}

/** A 22px sample of the actual line, so the key shows the thing itself. */
function LineSample({ type }: { type: RelationshipType }) {
  const meta = RELATIONSHIP_META[type];
  return (
    <svg aria-hidden width="22" height="6" viewBox="0 0 22 6" className="shrink-0">
      <line
        x1="0"
        y1="3"
        x2="22"
        y2="3"
        stroke={meta.stroke}
        strokeWidth="1.4"
        strokeDasharray={meta.dashed ? '3 3' : undefined}
      />
    </svg>
  );
}

function Readout({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'alert' | 'pending';
  onClick?: () => void;
}) {
  const body = (
    <>
      <dt className="edge-sm">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-mono text-[22px] font-light leading-none',
          tone === 'alert' && 'text-alert',
          tone === 'pending' && 'text-pending',
          !tone && 'text-ink',
        )}
      >
        {String(value).padStart(2, '0')}
      </dd>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="border-t-2 border-ink pt-2 text-left transition-colors hover:border-mark"
      >
        {body}
      </button>
    );
  }
  return <div className="border-t-2 border-ink pt-2">{body}</div>;
}
