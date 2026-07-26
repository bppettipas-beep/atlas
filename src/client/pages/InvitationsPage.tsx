import { useState } from 'react';
import { Copy, Envelope, Plus, Trash, Undo, UserPlus } from '@/components/icons';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  Modal,
  Notice,
  PageHeader,
  RuledHead,
  Select,
  Sheet,
  SkeletonRows,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { cn, formatDate, relativeTime } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import type { DirectInviteDto, InviteCodeDto, TeamDto } from '@shared/types';

export function InvitationsPage() {
  const { isOwner } = useAuth();
  const toast = useToast();
  const [codeModal, setCodeModal] = useState(false);
  const [directModal, setDirectModal] = useState(false);

  const codes = useQuery<{ items: InviteCodeDto[] }>(
    (signal) => api.get('/invites', undefined, signal),
    [],
  );
  const direct = useQuery<{ items: DirectInviteDto[] }>(
    (signal) => api.get('/invites/direct/list', undefined, signal),
    [],
  );
  const teams = useQuery<{ items: TeamDto[] }>(
    (signal) => api.get('/organization/teams', undefined, signal),
    [],
  );

  const copy = async (value: string, what = 'Invitation code') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied.`);
    } catch {
      toast.error('Your browser blocked the clipboard. Select the text and copy it manually.');
    }
  };

  const deactivate = async (id: string) => {
    try {
      await api.delete(`/invites/${id}`);
      codes.refetch();
      toast.success('Code deactivated. It can no longer be used.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const regenerate = async (id: string) => {
    try {
      await api.post(`/invites/${id}/regenerate`);
      codes.refetch();
      toast.success('New code issued. The old one no longer works.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const revokeDirect = async (id: string) => {
    try {
      await api.delete(`/invites/direct/${id}`);
      direct.refetch();
      toast.success('Invitation revoked.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const items = codes.data?.items ?? [];
  const active = items.filter((invite) => invite.isUsable);
  const inactive = items.filter((invite) => !invite.isUsable);

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow="Invitations"
          title="Bring your team in"
          description="Share a code and people join themselves. Everyone who joins lands on the map with a reporting line already drawn."
          actions={
            <>
              <Button icon={<Envelope />} onClick={() => setDirectModal(true)}>
                Invite by email
              </Button>
              <Button variant="primary" icon={<Plus />} onClick={() => setCodeModal(true)}>
                New code
              </Button>
            </>
          }
        />

        <Notice tone="info">
          Invitation codes are secrets. Only owners and managers can see this page — workers get a
          403 from the server, not just a hidden button.
        </Notice>

        {codes.loading && !codes.data && <SkeletonRows rows={3} />}
        {codes.error && <ErrorState message={codes.error} onRetry={codes.refetch} />}

        {codes.data && items.length === 0 && (
          <EmptyState
            icon={<UserPlus />}
            title="No invitation codes yet"
            description="Create one, then text or print it. Anyone with the code can join as a worker on the team you choose."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setCodeModal(true)}>
                Create your first code
              </Button>
            }
          />
        )}

        {active.length > 0 && (
          <section className="space-y-3">
            <RuledHead title="Active codes" meta={String(active.length).padStart(2, '0')} />
            <div className="grid gap-3 md:grid-cols-2">
              {active.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  canRegenerate={isOwner}
                  onCopy={copy}
                  onDeactivate={deactivate}
                  onRegenerate={regenerate}
                />
              ))}
            </div>
          </section>
        )}

        {inactive.length > 0 && (
          <section className="space-y-3">
            <RuledHead
              title="Expired and deactivated"
              description="Kept so the activity feed can still say which code somebody joined with."
              meta={String(inactive.length).padStart(2, '0')}
            />
            <Sheet>
              <ul className="divide-y divide-rule">
                {inactive.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <code className="font-mono text-[13px] tracking-[0.16em] text-ink-4 line-through">
                      {invite.code}
                    </code>
                    <span className="text-[12px] text-ink-3">
                      {invite.label ?? 'No label'} · used {invite.useCount}×
                    </span>
                    <span className="edge-sm ml-auto">
                      {!invite.active
                        ? 'Deactivated'
                        : invite.expiresAt && new Date(invite.expiresAt) < new Date()
                          ? 'Expired'
                          : 'Fully used'}
                    </span>
                  </li>
                ))}
              </ul>
            </Sheet>
          </section>
        )}

        {/* ------------------------- direct invitations -------------------- */}
        <section className="space-y-3">
          <RuledHead
            title="Direct invitations"
            description="A single-use code tied to one email address. Send it to them yourself — Atlas does not send email."
            meta={String(direct.data?.items.length ?? 0).padStart(2, '0')}
          />

          {direct.data && direct.data.items.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              None yet. Use <strong className="font-medium text-ink">Invite by email</strong> to
              create one.
            </p>
          ) : (
            <Sheet>
              <ul className="divide-y divide-rule">
                {(direct.data?.items ?? []).map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{invite.email}</p>
                      <p className="edge-sm mt-1">
                        {invite.role}
                        {invite.teamName && ` · ${invite.teamName}`}
                        {invite.jobTitle && ` · ${invite.jobTitle}`}
                      </p>
                    </div>

                    {invite.code && !invite.acceptedAt && !invite.revokedAt && (
                      <button
                        type="button"
                        onClick={() => void copy(invite.code!, 'Code')}
                        className="inline-flex items-center gap-1.5 border border-edge bg-paper px-2 py-1 font-mono text-[12px] tracking-[0.14em] text-ink transition-colors hover:border-ink"
                      >
                        {invite.code}
                        <Copy className="text-[12px] text-ink-3" />
                      </button>
                    )}

                    {invite.acceptedAt ? (
                      <Chip className="border-done/35 text-done">
                        Joined {relativeTime(invite.acceptedAt)}
                      </Chip>
                    ) : invite.revokedAt ? (
                      <Chip className="text-ink-4">Revoked</Chip>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-ink-3 hover:text-alert"
                        onClick={() => void revokeDirect(invite.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Sheet>
          )}
        </section>

        <CreateCodeModal
          open={codeModal}
          teams={teams.data?.items ?? []}
          canInviteManagers={isOwner}
          onClose={() => setCodeModal(false)}
          onCreated={() => {
            setCodeModal(false);
            codes.refetch();
            toast.success('Code created.');
          }}
        />

        <DirectInviteModal
          open={directModal}
          teams={teams.data?.items ?? []}
          canInviteManagers={isOwner}
          onClose={() => setDirectModal(false)}
          onCreated={() => {
            setDirectModal(false);
            direct.refetch();
            codes.refetch();
            toast.success('Invitation created. Send them the code.');
          }}
        />
      </PageBody>
    </PageTransition>
  );
}

/* -------------------------------------------------------------------------- */

function InviteCard({
  invite,
  canRegenerate,
  onCopy,
  onDeactivate,
  onRegenerate,
}: {
  invite: InviteCodeDto;
  canRegenerate: boolean;
  onCopy: (value: string, what?: string) => void;
  onDeactivate: (id: string) => void;
  onRegenerate: (id: string) => void;
}) {
  const usesLeft = invite.maxUses === null ? null : invite.maxUses - invite.useCount;

  return (
    <Sheet ticked className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="edge-sm">{invite.label ?? 'Invitation code'}</p>
          <p className="mt-1 text-[12px] text-ink-3">
            Joins as {invite.role.toLowerCase()}
            {invite.teamName && ` · ${invite.teamName}`}
          </p>
        </div>
        <span className="font-mono text-[11px] text-ink-4">
          {String(invite.useCount).padStart(2, '0')}
          {invite.maxUses !== null && `/${String(invite.maxUses).padStart(2, '0')}`}
        </span>
      </div>

      {/* The code itself is the content of this card, so it is set large. */}
      <button
        type="button"
        onClick={() => onCopy(invite.code)}
        className="group mt-4 flex w-full items-center justify-between gap-3 border border-edge bg-paper px-3 py-2.5 text-left transition-colors hover:border-ink"
      >
        <code className="font-mono text-[19px] leading-none tracking-[0.2em] text-ink">
          {invite.code}
        </code>
        <span className="edge-sm inline-flex shrink-0 items-center gap-1.5 group-hover:text-ink">
          <Copy className="text-[13px]" />
          Copy
        </span>
      </button>

      {usesLeft !== null && (
        <div className="mt-3">
          <div className="h-[3px] w-full bg-paper-deep">
            <div
              className={cn('h-full', usesLeft <= 2 ? 'bg-pending' : 'bg-ink')}
              style={{ width: `${(invite.useCount / (invite.maxUses ?? 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">
            {usesLeft} {usesLeft === 1 ? 'use' : 'uses'} left
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <span className="text-[11px] text-ink-4">
          {invite.expiresAt ? `Expires ${formatDate(invite.expiresAt)}` : 'No expiry'}
        </span>
        <span className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(invite.joinUrl, 'Join link')}
            title="Copy a link that pre-fills the code"
          >
            Copy link
          </Button>
          {canRegenerate && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo />}
              onClick={() => onRegenerate(invite.id)}
            >
              Regenerate
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash />}
            className="text-ink-3 hover:text-alert"
            onClick={() => onDeactivate(invite.id)}
            aria-label="Deactivate this code"
          />
        </span>
      </div>
    </Sheet>
  );
}

function CreateCodeModal({
  open,
  teams,
  canInviteManagers,
  onClose,
  onCreated,
}: {
  open: boolean;
  teams: TeamDto[];
  canInviteManagers: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    label: '',
    role: 'WORKER',
    teamId: '',
    expiresAt: '',
    maxUses: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/invites', {
        label: form.label || undefined,
        role: form.role,
        teamId: form.teamId || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      });
      setForm({ label: '', role: 'WORKER', teamId: '', expiresAt: '', maxUses: '' });
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
      title="New invitation code"
      description="Anyone with this code can join your company. Set a limit if you are sharing it widely."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void create()}>
            Create code
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}

        <Field
          label="Label"
          htmlFor="invite-label"
          hint="Only you see this. It helps you tell codes apart."
        >
          <Input
            id="invite-label"
            autoFocus
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="Spring hiring — cleaning technicians"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="They join as" htmlFor="invite-role">
            <Select
              id="invite-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              <option value="WORKER">Worker</option>
              {canInviteManagers && <option value="MANAGER">Manager</option>}
            </Select>
          </Field>

          <Field label="Added to team" htmlFor="invite-team" hint="Sets their manager too.">
            <Select
              id="invite-team"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expires" htmlFor="invite-expiry" hint="Leave empty for no expiry.">
            <Input
              id="invite-expiry"
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            />
          </Field>

          <Field label="Maximum uses" htmlFor="invite-max" hint="Leave empty for unlimited.">
            <Input
              id="invite-max"
              type="number"
              min={1}
              max={500}
              value={form.maxUses}
              onChange={(event) => setForm({ ...form, maxUses: event.target.value })}
              placeholder="25"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function DirectInviteModal({
  open,
  teams,
  canInviteManagers,
  onClose,
  onCreated,
}: {
  open: boolean;
  teams: TeamDto[];
  canInviteManagers: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ email: '', role: 'WORKER', jobTitle: '', teamId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/invites/direct', {
        email: form.email,
        role: form.role,
        jobTitle: form.jobTitle || undefined,
        teamId: form.teamId || null,
      });
      setForm({ email: '', role: 'WORKER', jobTitle: '', teamId: '' });
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
      title="Invite one person"
      description="Creates a single-use code for this email address. Atlas does not send email — copy the code and send it however you already talk to them."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!form.email.trim()}
            onClick={() => void create()}
          >
            Create invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}

        <Field label="Email address" htmlFor="direct-email" required>
          <Input
            id="direct-email"
            type="email"
            autoFocus
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="theo@example.com"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" htmlFor="direct-role">
            <Select
              id="direct-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              <option value="WORKER">Worker</option>
              {canInviteManagers && <option value="MANAGER">Manager</option>}
            </Select>
          </Field>

          <Field label="Team" htmlFor="direct-team">
            <Select
              id="direct-team"
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

        <Field label="Job title" htmlFor="direct-title" hint="Optional.">
          <Input
            id="direct-title"
            value={form.jobTitle}
            onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
            placeholder="Cleaning Technician"
          />
        </Field>
      </div>
    </Modal>
  );
}
