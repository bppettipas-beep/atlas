import { Plus, Search, Squares, UserPlus, Users, X } from '@/components/icons';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { AddPersonModal } from '@/components/people/AddPersonModal';
import { ProfilePanel } from '@/components/people/ProfilePanel';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import {
  Avatar,
  Chip,
  Button,
  Sheet,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/useQuery';
import { AVAILABILITY_META, ROLE_META, cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeEvent } from '@/providers/RealtimeProvider';
import type { PersonSummary, TeamDto } from '@shared/types';

export function PeoplePage() {
  const { isLeadership, isOwner } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [tab, setTab] = useState<'people' | 'teams'>('people');
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [teamId, setTeamId] = useState('');
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);
  const selectedPersonId = params.get('person');

  const peopleQuery = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', { search: debouncedSearch, role, teamId }, signal),
    [debouncedSearch, role, teamId],
  );
  const teamsQuery = useQuery<{ items: TeamDto[] }>(
    (signal) => api.get('/organization/teams', undefined, signal),
    [],
  );

  useRealtimeEvent(['people:updated', 'organization:updated'], () => {
    peopleQuery.refetch();
    teamsQuery.refetch();
  });

  const selectPerson = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('person', id);
        else next.delete('person');
        return next;
      },
      { replace: true },
    );

  const people = peopleQuery.data?.items ?? [];
  const teams = teamsQuery.data?.items ?? [];
  const hasFilters = Boolean(debouncedSearch || role || teamId);

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="People"
          title="Everyone in your company"
          description="Who they are, what they own, and who they report to."
          actions={
            isLeadership && (
              <>
                <Button
                  icon={<Squares className="h-4 w-4" />}
                  onClick={() => setTeamModalOpen(true)}
                >
                  New team
                </Button>
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddPersonOpen(true)}>
                  Add person
                </Button>
                <Button
                  variant="primary"
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => navigate('/app/invitations')}
                >
                  Invite people
                </Button>
              </>
            )
          }
        />

        <Tabs
          tabs={[
            { value: 'people', label: 'People', count: people.length },
            { value: 'teams', label: 'Teams', count: teams.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'people' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, title or skill…"
                  aria-label="Search people"
                  className="h-9 pl-9"
                />
              </div>

              <Select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                aria-label="Filter by role"
                className="h-9 w-auto min-w-[130px]"
              >
                <option value="">Any role</option>
                <option value="OWNER">Owner</option>
                <option value="CO_OWNER">Co-owner</option>
                <option value="MANAGER">Manager</option>
                <option value="WORKER">Worker</option>
              </Select>

              <Select
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                aria-label="Filter by team"
                className="h-9 w-auto min-w-[140px]"
              >
                <option value="">All teams</option>
                {teams.map((team) => (
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
                  onClick={() => {
                    setSearch('');
                    setRole('');
                    setTeamId('');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {peopleQuery.loading && !peopleQuery.data && <SkeletonRows rows={5} />}
            {peopleQuery.error && (
              <ErrorState message={peopleQuery.error} onRetry={peopleQuery.refetch} />
            )}

            {peopleQuery.data && people.length === 0 && (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title={hasFilters ? 'Nobody matches those filters' : 'It is just you so far'}
                description={
                  hasFilters
                    ? 'Try a different search or clear the filters.'
                    : 'Invite your team and their profiles, skills and reporting lines will appear here.'
                }
                action={
                  hasFilters ? (
                    <Button
                      onClick={() => {
                        setSearch('');
                        setRole('');
                        setTeamId('');
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : isLeadership ? (
                    <Button
                      variant="primary"
                      icon={<UserPlus className="h-4 w-4" />}
                      onClick={() => navigate('/app/invitations')}
                    >
                      Invite your first worker
                    </Button>
                  ) : undefined
                }
              />
            )}

            {people.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => selectPerson(person.id)}
                    className="sheet group rounded-sm px-4 py-3.5 text-left transition-colors hover:border-ink-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <Avatar name={person.fullName} src={person.avatarUrl} size="lg" />
                        <span
                          title={AVAILABILITY_META[person.availability].label}
                          className={cn(
                            'absolute bottom-0 right-0 h-3 w-3 rounded-none ring-2 ring-sheet',
                            AVAILABILITY_META[person.availability].dot,
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="title truncate text-[13.5px]">{person.fullName}</p>
                        <p className="mt-0.5 truncate text-[13px] text-ink-3">
                          {person.jobTitle ?? 'No job title'}
                        </p>
                        {person.headline && (
                          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-3">
                            {person.headline}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-rule pt-3">
                      {person.assignedRole && (
                        <span className="edge-sm inline-flex items-center gap-1.5 border border-edge px-1.5 py-0.5 text-ink-2">
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-[1px]"
                            style={{ backgroundColor: person.assignedRole.color }}
                          />
                          {person.assignedRole.name}
                        </span>
                      )}
                      <Chip className={ROLE_META[person.role].chip}>
                        {ROLE_META[person.role].label}
                      </Chip>
                      {person.isPlaceholder && (
                        <span
                          className="edge-sm border border-dashed border-edgeStrong px-1.5 py-0.5 text-ink-4"
                          title="Added by hand — this person has no login"
                        >
                          No login
                        </span>
                      )}
                      {person.teams.slice(0, 2).map((team) => (
                        <Chip key={team.id}>{team.name}</Chip>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'teams' && (
          <TeamsTab
            teams={teams}
            people={people}
            loading={teamsQuery.loading}
            error={teamsQuery.error}
            canManage={isLeadership}
            canDelete={isOwner}
            onChanged={() => {
              teamsQuery.refetch();
              peopleQuery.refetch();
            }}
            onOpenPerson={selectPerson}
            onCreate={() => setTeamModalOpen(true)}
          />
        )}
      </PageBody>

      <ProfilePanel
        membershipId={selectedPersonId}
        people={people}
        onClose={() => selectPerson(null)}
        onChanged={() => peopleQuery.refetch()}
        onAssignTask={(person) => setComposerFor(person.id)}
      />

      <AddPersonModal
        open={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        onCreated={() => peopleQuery.refetch()}
        people={people}
      />

      <TaskComposer
        open={Boolean(composerFor)}
        onClose={() => setComposerFor(null)}
        defaultAssigneeId={composerFor ?? undefined}
        onCreated={() => {
          setComposerFor(null);
          toast.success('Task created.');
        }}
      />

      <TeamModal
        open={teamModalOpen}
        people={people}
        onClose={() => setTeamModalOpen(false)}
        onCreated={() => {
          setTeamModalOpen(false);
          teamsQuery.refetch();
          toast.success('Team created.');
        }}
      />
    </PageTransition>
  );
}

// --------------------------------- teams ------------------------------------

function TeamsTab({
  teams,
  people,
  loading,
  error,
  canManage,
  canDelete,
  onChanged,
  onOpenPerson,
  onCreate,
}: {
  teams: TeamDto[];
  people: PersonSummary[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onOpenPerson: (id: string) => void;
  onCreate: () => void;
}) {
  const toast = useToast();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState('');

  const addMember = async (teamId: string) => {
    if (!selectedPerson) return;
    try {
      await api.post(`/organization/teams/${teamId}/members`, { membershipId: selectedPerson });
      setAddingTo(null);
      setSelectedPerson('');
      onChanged();
      toast.success('Added to the team.');
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const removeMember = async (teamId: string, membershipId: string) => {
    try {
      await api.delete(`/organization/teams/${teamId}/members/${membershipId}`);
      onChanged();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const archiveTeam = async (teamId: string) => {
    try {
      await api.delete(`/organization/teams/${teamId}`);
      onChanged();
      toast.success('Team archived.');
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  if (loading && teams.length === 0) return <SkeletonRows rows={3} />;
  if (error) return <ErrorState message={error} />;

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={<Squares className="h-5 w-5" />}
        title="No teams yet"
        description="Teams group people who work together and make the organization map far easier to read."
        action={
          canManage ? (
            <Button variant="primary" onClick={onCreate}>
              Create a team
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {teams.map((team) => (
        <Sheet key={team.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className="mt-0.5 h-8 w-1 shrink-0 rounded-none"
                style={{ backgroundColor: team.color ?? '#1f6feb' }}
              />
              <div className="min-w-0">
                <h3 className="title text-[13.5px]">{team.name}</h3>
                {team.description && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">
                    {team.description}
                  </p>
                )}
              </div>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-ink-3">{team.memberCount}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(team.members ?? []).map((member) => (
              <span
                key={member.id}
                className="group inline-flex items-center gap-1.5 rounded-sm border border-rule py-1 pl-1 pr-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onOpenPerson(member.id)}
                  className="flex items-center gap-1.5"
                >
                  <Avatar name={member.fullName} src={member.avatarUrl} size="xs" />
                  <span className="text-ink-2">{member.fullName}</span>
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void removeMember(team.id, member.id)}
                    aria-label={`Remove ${member.fullName} from ${team.name}`}
                    className="text-ink-4 transition-colors hover:text-alert"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {(team.members ?? []).length === 0 && (
              <p className="text-[13px] text-ink-3">Nobody on this team yet.</p>
            )}
          </div>

          {canManage && (
            <div className="mt-3 border-t border-rule pt-3">
              {addingTo === team.id ? (
                <div className="flex gap-2">
                  <Select
                    value={selectedPerson}
                    onChange={(event) => setSelectedPerson(event.target.value)}
                    aria-label={`Add someone to ${team.name}`}
                    className="h-8 text-[13px]"
                  >
                    <option value="">Choose a person…</option>
                    {people
                      .filter((person) => !(team.members ?? []).some((m) => m.id === person.id))
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!selectedPerson}
                    onClick={() => void addMember(team.id)}
                  >
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingTo(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setAddingTo(team.id)}
                  >
                    Add someone
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-ink-3 hover:text-alert"
                      onClick={() => void archiveTeam(team.id)}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </Sheet>
      ))}
    </div>
  );
}

function TeamModal({
  open,
  people,
  onClose,
  onCreated,
}: {
  open: boolean;
  people: PersonSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: '', description: '', color: '#1f6feb', leadId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/organization/teams', {
        name: form.name,
        description: form.description || null,
        color: form.color,
        leadId: form.leadId || null,
      });
      setForm({ name: '', description: '', color: '#1f6feb', leadId: '' });
      onCreated();
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
      title="New team"
      description="Teams show up as their own nodes on the organization map."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!form.name.trim()}
            onClick={() => void create()}
          >
            Create team
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}

        <Field label="Team name" htmlFor="team-name" required>
          <Input
            id="team-name"
            autoFocus
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Operations"
          />
        </Field>

        <Field label="What this team does" htmlFor="team-description">
          <Textarea
            id="team-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Cleaning crews, route scheduling and day-to-day client work."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team lead" htmlFor="team-lead">
            <Select
              id="team-lead"
              value={form.leadId}
              onChange={(event) => setForm({ ...form, leadId: event.target.value })}
            >
              <option value="">No lead</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Colour" htmlFor="team-color" hint="Used on the map.">
            <input
              id="team-color"
              type="color"
              value={form.color}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
              className="h-9 w-full cursor-pointer rounded-sm border border-[theme(colors.edgeStrong)] bg-sheet px-1"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
