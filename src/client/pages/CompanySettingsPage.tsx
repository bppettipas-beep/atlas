import { useEffect, useState } from 'react';
import { Calendar, Clock, Plus, Trash } from '@/components/icons';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import {
  Button,
  Chip,
  EmptyState,
  Field,
  InlineError,
  Input,
  Modal,
  Notice,
  PageHeader,
  RuledHead,
  Select,
  Sheet,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { formatDateTime } from '@/lib/utils';
import { useAuth, useSession } from '@/providers/AuthProvider';
import type { CompanyDto, PersonSummary, TeamDto } from '@shared/types';

interface TemplateRow {
  id: string;
  name: string;
  titleTemplate: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  weekdays: number[];
  dayOfMonth: number | null;
  timeOfDay: string;
  active: boolean;
  nextRunAt: string | null;
  assigneeName: string | null;
  teamName: string | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CompanySettingsPage() {
  const session = useSession();
  const { isOwner, refresh } = useAuth();
  const [tab, setTab] = useState<'company' | 'routines'>('company');

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="Company settings"
          title={session.company.name}
          description="The facts about your business, and the work that happens on a schedule."
        />

        <Tabs
          tabs={[
            { value: 'company', label: 'Company' },
            { value: 'routines', label: 'Recurring work' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'company' && <CompanyTab canEdit={isOwner} onSaved={refresh} />}
        {tab === 'routines' && <RoutinesTab />}
      </PageBody>
    </PageTransition>
  );
}

/* ------------------------------- company ---------------------------------- */

function CompanyTab({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const query = useQuery<CompanyDto>(
    (signal) => api.get('/companies/current', undefined, signal),
    [],
  );
  const [form, setForm] = useState({
    name: '',
    industry: '',
    sizeRange: '',
    location: '',
    timezone: '',
    logoUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setForm({
      name: query.data.name,
      industry: query.data.industry ?? '',
      sizeRange: query.data.sizeRange ?? '',
      location: query.data.location ?? '',
      timezone: query.data.timezone,
      logoUrl: query.data.logoUrl ?? '',
    });
  }, [query.data]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/companies/current', {
        name: form.name,
        industry: form.industry || null,
        sizeRange: form.sizeRange || null,
        location: form.location || null,
        timezone: form.timezone,
        logoUrl: form.logoUrl || null,
      });
      query.refetch();
      onSaved();
      toast.success('Company details saved.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {!canEdit && <Notice tone="info">Only the owner can change company details.</Notice>}
      {error && <InlineError message={error} />}

      <Sheet className="p-5">
        <RuledHead title="Details" className="mb-5" />
        <div className="space-y-4">
          <Field label="Company name" htmlFor="company-name" required>
            <Input
              id="company-name"
              disabled={!canEdit}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry" htmlFor="company-industry">
              <Input
                id="company-industry"
                disabled={!canEdit}
                value={form.industry}
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </Field>
            <Field label="Size" htmlFor="company-size">
              <Input
                id="company-size"
                disabled={!canEdit}
                value={form.sizeRange}
                onChange={(event) => setForm({ ...form, sizeRange: event.target.value })}
                placeholder="10-25"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Main location" htmlFor="company-location">
              <Input
                id="company-location"
                disabled={!canEdit}
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </Field>
            <Field label="Timezone" htmlFor="company-tz" hint="Used for due dates and routines.">
              <Input
                id="company-tz"
                disabled={!canEdit}
                value={form.timezone}
                onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                placeholder="America/Los_Angeles"
              />
            </Field>
          </div>

          <Field label="Logo URL" htmlFor="company-logo" hint="Optional. Paste a link to an image.">
            <Input
              id="company-logo"
              disabled={!canEdit}
              value={form.logoUrl}
              onChange={(event) => setForm({ ...form, logoUrl: event.target.value })}
            />
          </Field>
        </div>

        {canEdit && (
          <div className="mt-6 flex justify-end border-t border-rule pt-4">
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Save changes
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------- routines --------------------------------- */

function RoutinesTab() {
  const toast = useToast();
  const [modal, setModal] = useState(false);

  const query = useQuery<{ items: TemplateRow[] }>(
    (signal) => api.get('/tasks/templates/list', undefined, signal),
    [],
  );
  const people = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', undefined, signal),
    [],
  );
  const teams = useQuery<{ items: TeamDto[] }>(
    (signal) => api.get('/organization/teams', undefined, signal),
    [],
  );

  const toggle = async (template: TemplateRow) => {
    try {
      await api.patch(`/tasks/templates/${template.id}`, { active: !template.active });
      query.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/tasks/templates/${id}`);
      query.refetch();
      toast.success('Routine deleted. Tasks it already created are untouched.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const describe = (template: TemplateRow) => {
    const every = template.interval === 1 ? '' : `every ${template.interval} `;
    if (template.frequency === 'DAILY') return `Every ${every}day at ${template.timeOfDay}`;
    if (template.frequency === 'WEEKLY') {
      const days = template.weekdays.length
        ? template.weekdays.map((day) => WEEKDAYS[day]).join(', ')
        : 'weekly';
      return `${every ? `Every ${template.interval} weeks` : 'Weekly'} on ${days} at ${template.timeOfDay}`;
    }
    return `Monthly on day ${template.dayOfMonth ?? 1} at ${template.timeOfDay}`;
  };

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[64ch] text-[13px] leading-relaxed text-ink-3">
          Work that repeats — a weekly deep clean, a monthly filter round. Atlas creates the task
          for you, assigns it, and sets the due date. You do not have to remember.
        </p>
        <Button variant="primary" icon={<Plus />} onClick={() => setModal(true)}>
          New routine
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Calendar />}
          title="No recurring work set up"
          description="If you find yourself creating the same task every week, make it a routine instead."
          action={
            <Button variant="primary" icon={<Plus />} onClick={() => setModal(true)}>
              Create a routine
            </Button>
          }
        />
      ) : (
        <Sheet>
          <ul className="divide-y divide-rule">
            {items.map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{template.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                    <Clock className="text-[12px]" />
                    {describe(template)}
                    {template.assigneeName && <span>· {template.assigneeName}</span>}
                    {template.teamName && <span>· {template.teamName}</span>}
                  </p>
                </div>

                {template.active && template.nextRunAt && (
                  <span className="font-mono text-[11px] text-ink-4">
                    NEXT {formatDateTime(template.nextRunAt)}
                  </span>
                )}

                <Chip className={template.active ? 'border-done/35 text-done' : 'text-ink-4'}>
                  {template.active ? 'Active' : 'Paused'}
                </Chip>

                <Button size="sm" variant="ghost" onClick={() => void toggle(template)}>
                  {template.active ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash />}
                  className="text-ink-3 hover:text-alert"
                  aria-label={`Delete ${template.name}`}
                  onClick={() => void remove(template.id)}
                />
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <RoutineModal
        open={modal}
        people={people.data?.items ?? []}
        teams={teams.data?.items ?? []}
        onClose={() => setModal(false)}
        onCreated={() => {
          setModal(false);
          query.refetch();
          toast.success('Routine created.');
        }}
      />
    </div>
  );
}

function RoutineModal({
  open,
  people,
  teams,
  onClose,
  onCreated,
}: {
  open: boolean;
  people: PersonSummary[];
  teams: TeamDto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    titleTemplate: '',
    description: '',
    frequency: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    interval: 1,
    weekdays: [1] as number[],
    dayOfMonth: 1,
    timeOfDay: '09:00',
    defaultAssigneeId: '',
    teamId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/tasks/templates', {
        ...form,
        titleTemplate: form.titleTemplate || form.name,
        description: form.description || null,
        defaultAssigneeId: form.defaultAssigneeId || null,
        teamId: form.teamId || null,
        dayOfMonth: form.frequency === 'MONTHLY' ? form.dayOfMonth : null,
        weekdays: form.frequency === 'WEEKLY' ? form.weekdays : [],
      });
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
      title="New recurring routine"
      description="Atlas creates the task automatically each time it comes round."
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
            Create routine
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}

        <Field
          label="Routine name"
          htmlFor="routine-name"
          hint="What you call it internally."
          required
        >
          <Input
            id="routine-name"
            autoFocus
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Weekly deep clean — clinic sites"
          />
        </Field>

        <Field
          label="Task title"
          htmlFor="routine-title"
          hint="What the worker sees. Leave empty to reuse the routine name."
        >
          <Input
            id="routine-title"
            value={form.titleTemplate}
            onChange={(event) => setForm({ ...form, titleTemplate: event.target.value })}
          />
        </Field>

        <Field label="Instructions" htmlFor="routine-desc">
          <Textarea
            id="routine-desc"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Repeats" htmlFor="routine-frequency">
            <Select
              id="routine-frequency"
              value={form.frequency}
              onChange={(event) =>
                setForm({ ...form, frequency: event.target.value as typeof form.frequency })
              }
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
          </Field>

          <Field label="Every" htmlFor="routine-interval">
            <Input
              id="routine-interval"
              type="number"
              min={1}
              max={12}
              value={form.interval}
              onChange={(event) => setForm({ ...form, interval: Number(event.target.value) })}
            />
          </Field>

          <Field label="At" htmlFor="routine-time">
            <Input
              id="routine-time"
              type="time"
              value={form.timeOfDay}
              onChange={(event) => setForm({ ...form, timeOfDay: event.target.value })}
            />
          </Field>
        </div>

        {form.frequency === 'WEEKLY' && (
          <Field label="On these days">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((day, index) => {
                const active = form.weekdays.includes(index);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setForm({
                        ...form,
                        weekdays: active
                          ? form.weekdays.filter((value) => value !== index)
                          : [...form.weekdays, index],
                      })
                    }
                    className={
                      'edge-sm border px-2 py-1.5 transition-colors ' +
                      (active
                        ? 'border-ink bg-ink text-white'
                        : 'border-edge text-ink-3 hover:border-ink-3 hover:text-ink')
                    }
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {form.frequency === 'MONTHLY' && (
          <Field label="Day of the month" htmlFor="routine-dom">
            <Input
              id="routine-dom"
              type="number"
              min={1}
              max={31}
              value={form.dayOfMonth}
              onChange={(event) => setForm({ ...form, dayOfMonth: Number(event.target.value) })}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Always assign to" htmlFor="routine-assignee">
            <Select
              id="routine-assignee"
              value={form.defaultAssigneeId}
              onChange={(event) => setForm({ ...form, defaultAssigneeId: event.target.value })}
            >
              <option value="">Nobody — leave unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Team" htmlFor="routine-team">
            <Select
              id="routine-team"
              value={form.teamId}
              onChange={(event) => setForm({ ...form, teamId: event.target.value })}
            >
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
