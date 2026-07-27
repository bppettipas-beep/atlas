import {
  BookOpen,
  Calendar,
  Certificate,
  Chat,
  Check,
  Envelope,
  GraduationCap,
  Link as LinkIcon,
  MapPin,
  NotePencil,
  Pencil,
  Phone,
  Plus,
  Trash,
  X,
} from '@/components/icons';
import { useState } from 'react';
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
  Menu,
  Modal,
  Meter,
  Notice,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import {
  ACTIVITY_LABELS,
  AVAILABILITY_META,
  ROLE_META,
  cn,
  dueLabel,
  formatDate,
  relativeTime,
} from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import {
  AVAILABILITY_STATUSES,
  type AvailabilityStatus,
  type PersonDetail,
  type PersonSummary,
  type RoleDto,
  type TaskSummary,
} from '@shared/types';

interface ProfilePanelProps {
  membershipId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  onAssignTask?: (person: PersonDetail) => void;
  people?: PersonSummary[];
}

type TabValue = 'overview' | 'work' | 'knowledge' | 'timeline' | 'notes';

export function ProfilePanel({
  membershipId,
  onClose,
  onChanged,
  onAssignTask,
  people = [],
}: ProfilePanelProps) {
  const { session, isLeadership, isOwner, refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<TabValue>('overview');
  const [editing, setEditing] = useState(false);

  const { data, loading, error, refetch } = useQuery<PersonDetail | null>(
    (signal) =>
      membershipId
        ? api.get<PersonDetail>(`/people/${membershipId}`, undefined, signal)
        : Promise.resolve(null),
    [membershipId],
  );

  const isSelf = data?.id === session?.membership.id;
  const canEdit = isLeadership || isSelf;

  const reload = () => {
    refetch();
    onChanged?.();
    if (isSelf) void refresh();
  };

  const tabs: { value: TabValue; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'work', label: 'Work', count: data?.workload.active },
    { value: 'knowledge', label: 'Knowledge', count: data?.ownedDocuments.length },
    { value: 'timeline', label: 'Timeline' },
    ...(isLeadership
      ? [{ value: 'notes' as const, label: 'Notes', count: data?.notes?.length }]
      : []),
  ];

  return (
    <Drawer
      open={Boolean(membershipId)}
      onClose={onClose}
      labelledBy="profile-panel-title"
      width="max-w-xl"
    >
      {loading && <LoadingState label="Loading profile…" />}

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
          {/* ------------------------------ header ---------------------------- */}
          <header className="shrink-0 border-b border-rule px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="relative shrink-0">
                  <Avatar name={data.fullName} src={data.avatarUrl} size="xl" />
                  <span
                    title={AVAILABILITY_META[data.availability].label}
                    className={cn(
                      'absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-none ring-[3px] ring-sheet',
                      AVAILABILITY_META[data.availability].dot,
                    )}
                  />
                </div>
                <div className="min-w-0 pt-1">
                  <h2
                    id="profile-panel-title"
                    className="display truncate text-[19px] leading-tight"
                  >
                    {data.fullName}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-ink-3">
                    {data.jobTitle ?? 'No job title yet'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {/* The company's own role first — it is what people call
                        each other. The access tier is administrative. */}
                    {data.assignedRole && (
                      <span className="edge-sm inline-flex items-center gap-1.5 border border-edge px-1.5 py-0.5 text-ink-2">
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-[1px]"
                          style={{ backgroundColor: data.assignedRole.color }}
                        />
                        {data.assignedRole.name}
                      </span>
                    )}
                    <Chip className={ROLE_META[data.role].chip}>{ROLE_META[data.role].label}</Chip>
                    <Chip dot={AVAILABILITY_META[data.availability].dot}>
                      {AVAILABILITY_META[data.availability].label}
                    </Chip>
                    {data.teams.map((team) => (
                      <Chip key={team.id}>{team.name}</Chip>
                    ))}
                  </div>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close profile">
                <X aria-hidden className="h-4 w-4" />
              </Button>
            </div>

            {data.headline && (
              <p className="mt-3.5 rounded-sm bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">Owns:</span> {data.headline}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to={`/app/schedule?view=day&resources=${data.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-edgeStrong bg-sheet px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-paper"
                onClick={onClose}
              >
                <Calendar className="h-3.5 w-3.5" />
                View schedule
              </Link>
              {isLeadership && onAssignTask && (
                <Button
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => onAssignTask(data)}
                >
                  Assign a task
                </Button>
              )}
              {!isSelf && (
                <SendMessageButton
                  personId={data.id}
                  personName={data.fullName}
                  onSent={() => toast.success(`Message sent to ${data.fullName}.`)}
                />
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setEditing(true)}
                >
                  Edit profile
                </Button>
              )}
            </div>
          </header>

          <Tabs tabs={tabs} value={tab} onChange={setTab} className="shrink-0 px-3" />

          {/* ------------------------------- body ----------------------------- */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {tab === 'overview' && (
              <OverviewTab
                person={data}
                people={people}
                canEdit={canEdit}
                isOwner={isOwner}
                onChanged={reload}
              />
            )}
            {tab === 'work' && <WorkTab person={data} />}
            {tab === 'knowledge' && (
              <KnowledgeTab person={data} canEdit={isLeadership} onChanged={reload} />
            )}
            {tab === 'timeline' && <TimelineTab person={data} />}
            {tab === 'notes' && isLeadership && <NotesTab person={data} onChanged={reload} />}
          </div>

          <EditProfileModal
            open={editing}
            person={data}
            canEditAll={isLeadership}
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

// ------------------------------- Overview -----------------------------------

function OverviewTab({
  person,
  people,
  canEdit,
  isOwner,
  onChanged,
}: {
  person: PersonDetail;
  people: PersonSummary[];
  canEdit: boolean;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { isLeadership } = useAuth();
  const [newSkill, setNewSkill] = useState('');
  const [busy, setBusy] = useState(false);

  // Only leadership can assign a role, so only leadership needs the list.
  const rolesQuery = useQuery<{ items: RoleDto[] }>(
    (signal) =>
      isLeadership ? api.get('/roles', undefined, signal) : Promise.resolve({ items: [] }),
    [isLeadership],
  );
  const roles = rolesQuery.data?.items ?? [];

  const { session } = useAuth();
  const isMe = person.id === session?.membership.id;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const removePerson = async () => {
    setRemoving(true);
    try {
      await api.delete(`/people/${person.id}`);
      toast.success(`${person.fullName} was removed from the company.`);
      setConfirmRemove(false);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRemoving(false);
    }
  };

  const addSkill = async () => {
    if (!newSkill.trim()) return;
    setBusy(true);
    try {
      await api.post(`/people/${person.id}/skills`, { name: newSkill.trim(), level: 3 });
      setNewSkill('');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const removeSkill = async (skillId: string) => {
    try {
      await api.delete(`/people/${person.id}/skills/${skillId}`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const changeManager = async (managerId: string) => {
    try {
      await api.patch(`/people/${person.id}/manager`, { managerId: managerId || null });
      toast.success('Reporting line updated.');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const changeRole = async (role: string) => {
    try {
      await api.patch(`/people/${person.id}/role`, { role });
      toast.success('Access level updated.');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  /** The company's own named role — position, not access. */
  const changeAssignedRole = async (roleId: string) => {
    try {
      await api.patch(`/people/${person.id}/assigned-role`, { roleId: roleId || null });
      toast.success(roleId ? 'Role assigned.' : 'Role removed.');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      {/* workload */}
      <section>
        <h3 className="edge-sm mb-2.5">Current workload</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Active', value: person.workload.active },
            { label: 'Overdue', value: person.workload.overdue, danger: true },
            { label: 'Blocked', value: person.workload.blocked, danger: true },
            { label: 'Done 30d', value: person.workload.completedLast30Days },
          ].map((stat) => (
            <div key={stat.label} className="rounded-sm border border-rule px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">{stat.label}</p>
              <p
                className={cn(
                  'mt-0.5 text-lg font-semibold tabular-nums',
                  stat.danger && stat.value > 0 ? 'text-alert' : 'text-ink',
                )}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* contact */}
      <section>
        <h3 className="edge-sm mb-2.5">Contact</h3>
        <dl className="space-y-2 text-[13px]">
          <Row
            icon={<Envelope className="h-3.5 w-3.5" />}
            label="Email"
            value={person.workEmail ?? person.email}
          />
          {person.phone && (
            <Row icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={person.phone} />
          )}
          {person.location && (
            <Row
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Location"
              value={person.location}
            />
          )}
          <Row label="Joined" value={formatDate(person.startDate ?? person.joinedAt)} />
          {person.availabilityNote && (
            <Row label="Availability note" value={person.availabilityNote} />
          )}
        </dl>
      </section>

      {person.bio && (
        <section>
          <h3 className="edge-sm mb-2">About</h3>
          <p className="text-[13px] leading-relaxed text-ink-2">{person.bio}</p>
        </section>
      )}

      {/* reporting */}
      <section>
        <h3 className="edge-sm mb-2.5">Reporting</h3>
        {isLeadership ? (
          <Field label="Manager" htmlFor="manager-select">
            <Select
              id="manager-select"
              value={person.managerId ?? ''}
              onChange={(event) => void changeManager(event.target.value)}
            >
              <option value="">No manager</option>
              {people
                .filter((candidate) => candidate.id !== person.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.fullName}
                    {candidate.jobTitle ? ` — ${candidate.jobTitle}` : ''}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <p className="text-[13px] text-ink-2">
            {person.manager ? `Reports to ${person.manager.fullName}` : 'No manager assigned'}
          </p>
        )}

        {person.directReports.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-ink-3">
              {person.directReports.length} direct{' '}
              {person.directReports.length === 1 ? 'report' : 'reports'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {person.directReports.map((report) => (
                <Chip key={report.id}>{report.fullName}</Chip>
              ))}
            </div>
          </div>
        )}

        {isLeadership && (
          <div className="mt-3">
            <Field
              label="Role"
              htmlFor="assigned-role-select"
              hint="What they are called here. Does not change what they can access."
            >
              <Select
                id="assigned-role-select"
                value={person.assignedRole?.id ?? ''}
                onChange={(event) => void changeAssignedRole(event.target.value)}
              >
                <option value="">— No role —</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {isOwner && (
          <div className="mt-3">
            <Field label="Access level" htmlFor="role-select" hint="What they are allowed to do.">
              <Select
                id="role-select"
                value={person.role}
                onChange={(event) => void changeRole(event.target.value)}
              >
                <option value="OWNER">Owner</option>
                <option value="MANAGER">Manager</option>
                <option value="WORKER">Worker</option>
              </Select>
            </Field>
          </div>
        )}

        {isOwner && !isMe && (
          <div className="mt-4 border-t border-rule pt-4">
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash className="h-3.5 w-3.5" />}
              className="text-alert hover:bg-alert-wash"
              onClick={() => setConfirmRemove(true)}
            >
              Remove from company
            </Button>
          </div>
        )}

        <Modal
          open={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          size="sm"
          title={`Remove ${person.fullName}?`}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmRemove(false)} disabled={removing}>
                Keep them
              </Button>
              <Button variant="danger" loading={removing} onClick={() => void removePerson()}>
                Remove from company
              </Button>
            </div>
          }
        >
          <Notice tone="alert">
            {person.isPlaceholder
              ? 'They were added by hand and have no account, so this deletes them outright. Work assigned to them stays, unassigned.'
              : 'They lose access immediately and are signed out everywhere. Their name stays on the work and comments they created, and anyone reporting to them moves up to their manager.'}
          </Notice>
        </Modal>
      </section>

      {/* skills */}
      <section>
        <h3 className="edge-sm mb-2.5">Skills</h3>
        {person.skills.length === 0 && (
          <p className="mb-2 text-[13px] text-ink-3">No skills recorded yet.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {person.skills.map((skill) => (
            <span
              key={skill.id}
              className="group inline-flex items-center gap-1.5 rounded-sm border border-rule bg-sheet px-2 py-1 text-xs text-ink-2"
            >
              {skill.name}
              <span className="flex gap-px" aria-label={`Level ${skill.level} of 5`}>
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className={cn(
                      'h-1 w-1 rounded-none',
                      level <= skill.level ? 'bg-ink' : 'bg-edge',
                    )}
                  />
                ))}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void removeSkill(skill.id)}
                  aria-label={`Remove ${skill.name}`}
                  className="ml-0.5 text-ink-4 transition-colors hover:text-alert"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <Input
              value={newSkill}
              onChange={(event) => setNewSkill(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addSkill();
                }
              }}
              placeholder="Add a skill…"
              className="h-8 text-[13px]"
              aria-label="Add a skill"
            />
            <Button
              size="sm"
              onClick={() => void addSkill()}
              loading={busy}
              disabled={!newSkill.trim()}
            >
              Add
            </Button>
          </div>
        )}
      </section>

      {person.certifications.length > 0 && (
        <section>
          <h3 className="edge-sm mb-2.5">Certifications</h3>
          <ul className="space-y-1.5">
            {person.certifications.map((certification) => (
              <li key={certification.id} className="flex items-start gap-2 text-[13px]">
                <Certificate aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                <span>
                  <span className="text-ink">{certification.name}</span>
                  {certification.issuer && (
                    <span className="text-ink-3"> · {certification.issuer}</span>
                  )}
                  {certification.expiresAt && (
                    <span className="block text-xs text-ink-3">
                      Expires {formatDate(certification.expiresAt)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 w-4 shrink-0 text-ink-3">{icon}</span>
      <dt className="w-24 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ink-2">{value}</dd>
    </div>
  );
}

// --------------------------------- Work -------------------------------------

function TaskRow({ task }: { task: TaskSummary }) {
  return (
    <Link
      to={`/app/work?task=${task.id}`}
      className="block rounded-sm border border-rule px-3 py-2.5 transition-colors hover:border-edge hover:bg-paper"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink">{task.title}</p>
        <span
          className={cn(
            'shrink-0 text-[11px] tabular-nums',
            task.isOverdue ? 'font-medium text-alert' : 'text-ink-3',
          )}
        >
          {dueLabel(task.dueAt, task.status)}
        </span>
      </div>
      {task.completionPercent > 0 && task.status !== 'DONE' && (
        <Meter value={task.completionPercent} className="mt-2" />
      )}
    </Link>
  );
}

function WorkTab({ person }: { person: PersonDetail }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="edge-sm mb-2.5">Active tasks ({person.activeTasks.length})</h3>
        {person.activeTasks.length === 0 ? (
          <p className="text-[13px] text-ink-3">Nothing on their plate right now.</p>
        ) : (
          <div className="space-y-2">
            {person.activeTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="edge-sm mb-2.5">Recently completed</h3>
        {person.recentlyCompleted.length === 0 ? (
          <p className="text-[13px] text-ink-3">No completed work yet.</p>
        ) : (
          <div className="space-y-2">
            {person.recentlyCompleted.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------- Knowledge ----------------------------------

function KnowledgeTab({
  person,
  canEdit,
  onChanged,
}: {
  person: PersonDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [newStep, setNewStep] = useState('');

  const toggleTraining = async (recordId: string, completed: boolean) => {
    try {
      await api.patch(`/people/${person.id}/training/${recordId}`, { completed });
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const addStep = async () => {
    if (!newStep.trim()) return;
    try {
      await api.post(`/people/${person.id}/training`, { title: newStep.trim(), completed: false });
      setNewStep('');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="edge-sm mb-2.5">Knowledge they own</h3>
        {person.ownedDocuments.length === 0 ? (
          <p className="text-[13px] text-ink-3">They do not own any documented processes yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {person.ownedDocuments.map((document) => (
              <li key={document.id}>
                <Link
                  to={`/app/knowledge/${document.id}`}
                  className="flex items-start gap-2 rounded-sm border border-rule px-3 py-2.5 text-[13px] transition-colors hover:border-edge hover:bg-paper"
                >
                  <BookOpen aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{document.title}</span>
                    <span className="text-xs text-ink-3">{document.category}</span>
                  </span>
                  <LinkIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="edge-sm mb-2.5">Training & onboarding</h3>
        {person.trainingRecords.length === 0 ? (
          <p className="text-[13px] text-ink-3">No onboarding steps recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {person.trainingRecords.map((record) => (
              <li
                key={record.id}
                className="flex items-center gap-2.5 rounded-sm border border-rule px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => void toggleTraining(record.id, !record.completedAt)}
                  aria-label={
                    record.completedAt
                      ? `Mark ${record.title} incomplete`
                      : `Mark ${record.title} complete`
                  }
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    record.completedAt
                      ? 'border-done bg-done text-white'
                      : 'border-edge hover:border-edgeStrong',
                  )}
                >
                  {record.completedAt && <Check aria-hidden className="h-3 w-3" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[13px]',
                      record.completedAt ? 'text-ink-3 line-through' : 'text-ink',
                    )}
                  >
                    {record.title}
                  </span>
                  {record.completedAt && (
                    <span className="text-xs text-ink-3">
                      Completed {formatDate(record.completedAt)}
                    </span>
                  )}
                </span>
                <GraduationCap aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-4" />
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="mt-3 flex gap-2">
            <Input
              value={newStep}
              onChange={(event) => setNewStep(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addStep();
                }
              }}
              placeholder="Add an onboarding step…"
              className="h-8 text-[13px]"
              aria-label="Add an onboarding step"
            />
            <Button size="sm" onClick={() => void addStep()} disabled={!newStep.trim()}>
              Add
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

// -------------------------------- Timeline ----------------------------------

function TimelineTab({ person }: { person: PersonDetail }) {
  if (person.timeline.length === 0) {
    return <p className="text-[13px] text-ink-3">Nothing has happened yet.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-rule pl-5">
      {person.timeline.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[1.44rem] top-1.5 h-1.5 w-1.5 rounded-none bg-edge ring-4 ring-sheet" />
          <p className="text-[13px] leading-relaxed text-ink-2">{event.summary}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
            <span>{ACTIVITY_LABELS[event.type] ?? event.type}</span>
            <span>·</span>
            <span>{relativeTime(event.createdAt)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

// --------------------------------- Notes ------------------------------------

function NotesTab({ person, onChanged }: { person: PersonDetail; onChanged: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/people/${person.id}/notes`, { body: body.trim() });
      setBody('');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (noteId: string) => {
    try {
      await api.delete(`/people/${person.id}/notes/${noteId}`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-sm bg-pending-wash px-3 py-2.5 text-xs leading-relaxed text-pending">
        <NotePencil aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          These notes are only visible to owners and managers. {person.fullName} cannot see them.
        </span>
      </div>

      <div>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={`A private note about ${person.fullName.split(' ')[0]}…`}
          aria-label="New private note"
          className="min-h-[80px]"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void save()}
            loading={saving}
            disabled={!body.trim()}
          >
            Save note
          </Button>
        </div>
      </div>

      {(person.notes ?? []).length === 0 ? (
        <p className="text-[13px] text-ink-3">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {(person.notes ?? []).map((note) => (
            <li key={note.id} className="rounded-sm border border-rule px-3 py-2.5">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                {note.body}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
                <span>
                  {note.author?.fullName ?? 'Someone'} · {relativeTime(note.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  className="text-ink-4 transition-colors hover:text-alert"
                  aria-label="Delete note"
                >
                  <Trash aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------ Send message --------------------------------

function SendMessageButton({
  personId,
  personName,
  onSent,
}: {
  personId: string;
  personName: string;
  onSent: () => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  return (
    <Menu
      trigger={({ toggle }) => (
        <Button size="sm" variant="ghost" icon={<Chat className="h-3.5 w-3.5" />} onClick={toggle}>
          Message
        </Button>
      )}
    >
      {({ close }) => (
        <div className="w-72 p-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={`Send ${personName.split(' ')[0]} a quick note…`}
            aria-label={`Message to ${personName}`}
            className="min-h-[72px] text-[13px]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={sending}
              disabled={!body.trim()}
              onClick={async () => {
                setSending(true);
                try {
                  await api.post(`/people/${personId}/message`, { body: body.trim() });
                  setBody('');
                  close();
                  onSent();
                } catch (error) {
                  toast.error(errorMessage(error));
                } finally {
                  setSending(false);
                }
              }}
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </Menu>
  );
}

// ----------------------------- Edit profile ---------------------------------

export function EditProfileModal({
  open,
  person,
  canEditAll,
  onClose,
  onSaved,
}: {
  open: boolean;
  person: PersonDetail;
  canEditAll: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: person.fullName,
    jobTitle: person.jobTitle ?? '',
    headline: person.headline ?? '',
    bio: person.bio ?? '',
    phone: person.phone ?? '',
    location: person.location ?? '',
    availability: person.availability,
    availabilityNote: person.availabilityNote ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        fullName: form.fullName,
        headline: form.headline || null,
        bio: form.bio || null,
        phone: form.phone || null,
        location: form.location || null,
        availability: form.availability,
        availabilityNote: form.availabilityNote || null,
      };
      if (canEditAll) payload.jobTitle = form.jobTitle || null;

      await api.patch(`/people/${person.id}`, payload);
      toast.success('Profile updated.');
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      onSave={() => void save()}
      saving={saving}
      title={`Edit ${person.fullName}`}
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}

        <Field label="Full name" htmlFor="edit-name" required>
          <Input
            id="edit-name"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
        </Field>

        {canEditAll && (
          <Field label="Job title" htmlFor="edit-title">
            <Input
              id="edit-title"
              value={form.jobTitle}
              onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
            />
          </Field>
        )}

        <Field
          label="What this person owns"
          htmlFor="edit-headline"
          hint="One line — the part of the business they are responsible for."
        >
          <Input
            id="edit-headline"
            value={form.headline}
            onChange={(event) => setForm({ ...form, headline: event.target.value })}
            placeholder="Owns the downtown office route"
          />
        </Field>

        <Field label="About" htmlFor="edit-bio">
          <Textarea
            id="edit-bio"
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="edit-phone">
            <Input
              id="edit-phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          <Field label="Location" htmlFor="edit-location">
            <Input
              id="edit-location"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Availability" htmlFor="edit-availability">
            <Select
              id="edit-availability"
              value={form.availability}
              onChange={(event) =>
                setForm({ ...form, availability: event.target.value as AvailabilityStatus })
              }
            >
              {AVAILABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AVAILABILITY_META[status].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Availability note" htmlFor="edit-availability-note">
            <Input
              id="edit-availability-note"
              value={form.availabilityNote}
              onChange={(event) => setForm({ ...form, availabilityNote: event.target.value })}
              placeholder="Back Monday"
            />
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}

/** Small wrapper so the edit modal keeps a consistent footer. */
function ModalShell({
  open,
  onClose,
  onSave,
  saving,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
