import { useState, type FormEvent } from 'react';
import {
  Button,
  Field,
  InlineError,
  Input,
  Modal,
  Notice,
  Select,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import type { PersonSummary, RoleDto, TeamDto } from '@shared/types';

/**
 * Adds somebody to the company by hand, without an invitation.
 *
 * For a position you are still hiring for, or a member of staff who does not
 * use a computer. What comes out is an ordinary person: they appear on the
 * map, hold a role, join a team and take assigned work exactly like anybody
 * else. The only thing they cannot do is sign in.
 */
export function AddPersonModal({
  open,
  onClose,
  onCreated,
  people,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  people: PersonSummary[];
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: '',
    jobTitle: '',
    email: '',
    roleId: '',
    managerId: '',
    teamId: '',
    headline: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rolesQuery = useQuery<{ items: RoleDto[] }>(
    (signal) => (open ? api.get('/roles', undefined, signal) : Promise.resolve({ items: [] })),
    [open],
  );
  const teamsQuery = useQuery<{ items: TeamDto[] }>(
    (signal) =>
      open ? api.get('/organization/teams', undefined, signal) : Promise.resolve({ items: [] }),
    [open],
  );

  const reset = () =>
    setForm({
      fullName: '',
      jobTitle: '',
      email: '',
      roleId: '',
      managerId: '',
      teamId: '',
      headline: '',
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/people', {
        fullName: form.fullName.trim(),
        jobTitle: form.jobTitle.trim() || null,
        email: form.email.trim() || null,
        roleId: form.roleId || null,
        managerId: form.managerId || null,
        teamId: form.teamId || null,
        headline: form.headline.trim() || null,
      });
      toast.success(`${form.fullName.trim()} added.`);
      reset();
      onCreated();
      onClose();
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
      size="sm"
      title="Add a person"
      description="Someone who does not need to sign in — a placeholder for a role you are hiring for, or staff who work off a phone."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-person-form"
            variant="primary"
            loading={saving}
            disabled={form.fullName.trim().length < 2}
          >
            Add person
          </Button>
        </div>
      }
    >
      <form id="add-person-form" onSubmit={(event) => void submit(event)} className="space-y-4">
        {error && <InlineError message={error} />}

        <Field label="Full name" htmlFor="add-name" required>
          <Input
            id="add-name"
            autoFocus
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            placeholder="Theo Banda"
          />
        </Field>

        <Field label="Job title" htmlFor="add-job" hint="Optional.">
          <Input
            id="add-job"
            value={form.jobTitle}
            onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
            placeholder="Cleaning Technician"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" htmlFor="add-role">
            <Select
              id="add-role"
              value={form.roleId}
              onChange={(event) => setForm({ ...form, roleId: event.target.value })}
            >
              <option value="">— No role —</option>
              {(rolesQuery.data?.items ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Team" htmlFor="add-team">
            <Select
              id="add-team"
              value={form.teamId}
              onChange={(event) => setForm({ ...form, teamId: event.target.value })}
            >
              <option value="">— No team —</option>
              {(teamsQuery.data?.items ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Reports to" htmlFor="add-manager">
          <Select
            id="add-manager"
            value={form.managerId}
            onChange={(event) => setForm({ ...form, managerId: event.target.value })}
          >
            <option value="">— Nobody —</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
                {person.jobTitle ? ` — ${person.jobTitle}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Email"
          htmlFor="add-email"
          hint="Optional. Only for your records — no invitation is sent."
        >
          <Input
            id="add-email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="theo@example.com"
          />
        </Field>

        <Notice tone="info">
          They cannot sign in. When they need their own account, send them an invitation code and
          they will get one.
        </Notice>
      </form>
    </Modal>
  );
}
