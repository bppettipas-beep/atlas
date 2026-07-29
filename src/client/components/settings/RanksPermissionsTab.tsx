import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Users } from '@/components/icons';
import { Button, Chip, InlineError, Input, Notice, RuledHead, Select, Sheet, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';

type Scope = 'OWN' | 'ASSIGNED' | 'TEAM' | 'MANAGED_PEOPLE' | 'SELECTED_TEAMS' | 'COMPANY_WIDE' | 'EXPLICITLY_SHARED';
interface Grant { id?: string; permissionKey: string; scope: Scope; selectedTeamIds: string[] }
interface Rank {
  id: string;
  key: string;
  name: string;
  description: string | null;
  position: number;
  isSystem: boolean;
  isProtected: boolean;
  permissions: Grant[];
  _count: { memberships: number };
}
interface RankResponse { items: Rank[]; catalog: string[]; scopes: Scope[] }

const label = (key: string) =>
  key.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' · ');

export function RanksPermissionsTab() {
  const toast = useToast();
  const query = useQuery<RankResponse>((signal) => api.get('/ranks', undefined, signal), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, { enabled: boolean; scope: Scope }>>({});
  const [saving, setSaving] = useState(false);
  const [newRankName, setNewRankName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selected = query.data?.items.find((rank) => rank.id === selectedId) ?? query.data?.items[0];

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, { enabled: boolean; scope: Scope }> = {};
    for (const key of query.data?.catalog ?? []) {
      const grant = selected.permissions.find((item) => item.permissionKey === key);
      next[key] = { enabled: Boolean(grant), scope: grant?.scope ?? 'OWN' };
    }
    // A rank selection starts a fresh editable draft of the server grants.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrants(next);
  }, [selected, query.data?.catalog]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/ranks/${selected.id}/permissions`, {
        permissions: Object.entries(grants)
          .filter(([, grant]) => grant.enabled)
          .map(([key, grant]) => ({ key, scope: grant.scope, selectedTeamIds: [] })),
      });
      await query.refetch();
      toast.success('Rank permissions saved');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const createRank = async () => {
    const name = newRankName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const rank = await api.post<Rank>('/ranks', { name });
      setNewRankName('');
      setSelectedId(rank.id);
      await query.refetch();
      toast.success('Rank created');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  if (query.loading) return <Sheet className="p-5 text-sm text-ink-3">Loading ranks…</Sheet>;
  if (query.error || !query.data) return <InlineError message={query.error ?? 'Ranks could not be loaded.'} />;
  const data = query.data;

  return (
    <div className="space-y-5">
      <Notice tone="info">
        Ranks control Atlas access. Job titles and organization roles never grant permissions.
      </Notice>
      <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]">
        <Sheet>
          <RuledHead index="R" title="Ranks" description="Highest authority appears first." className="px-5 pt-5" />
          <div className="flex gap-2 px-5 pb-4 pt-4">
            <Input
              value={newRankName}
              maxLength={60}
              placeholder="New rank name"
              aria-label="New rank name"
              onChange={(event) => setNewRankName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void createRank(); }}
            />
            <Button icon={<Plus />} disabled={saving || !newRankName.trim()} onClick={createRank}>Create</Button>
          </div>
          <div className="mt-5 divide-y divide-rule border-t border-rule">
            {data.items.map((rank) => (
              <button
                type="button"
                key={rank.id}
                onClick={() => setSelectedId(rank.id)}
                className={`flex w-full items-center gap-3 px-5 py-4 text-left ${selected?.id === rank.id ? 'border-l-[3px] border-ink bg-paper-deep' : 'border-l-[3px] border-transparent'}`}
              >
                <span className="font-mono text-[11px] text-ink-3">{String(rank.position).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{rank.name}</span>
                  <span className="block text-[12px] text-ink-3">{rank._count.memberships} people</span>
                </span>
                {rank.isProtected && <Chip><ShieldCheck className="mr-1" />Protected</Chip>}
              </button>
            ))}
          </div>
        </Sheet>

        <Sheet>
          <RuledHead
            index="P"
            title={selected ? `${selected.name} permissions` : 'Permissions'}
            description="Each permission is enforced by the API. Scope limits which records it reaches."
            className="px-5 pt-5"
            action={<Button onClick={save} disabled={saving || selected?.key === 'owner'}>{saving ? 'Saving…' : 'Save permissions'}</Button>}
          />
          {error && <div className="px-5 pt-4"><InlineError message={error} /></div>}
          <div className="mt-5 divide-y divide-rule border-t border-rule">
            {data.catalog.map((key) => {
              const grant = grants[key] ?? { enabled: false, scope: 'OWN' as Scope };
              return (
                <div key={key} className="grid gap-3 px-5 py-3 sm:grid-cols-[1fr_190px] sm:items-center">
                  <label className="flex items-center gap-3 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={grant.enabled}
                      disabled={selected?.key === 'owner'}
                      onChange={(event) => setGrants({ ...grants, [key]: { ...grant, enabled: event.target.checked } })}
                    />
                    {label(key)}
                  </label>
                  <Select
                    value={grant.scope}
                    disabled={!grant.enabled || selected?.key === 'owner'}
                    onChange={(event) => setGrants({ ...grants, [key]: { ...grant, scope: event.target.value as Scope } })}
                  >
                    {data.scopes.map((scope) => <option key={scope} value={scope}>{label(scope.toLowerCase().replaceAll('_', '.'))}</option>)}
                  </Select>
                </div>
              );
            })}
          </div>
        </Sheet>
      </div>
      <Sheet className="flex items-start gap-3 p-4">
        <Users className="mt-0.5 text-[18px] text-ink-3" />
        <p className="text-[13px] leading-relaxed text-ink-2">Owner access is locked to prevent company lockout. Rank changes are recorded in the permission audit trail.</p>
      </Sheet>
    </div>
  );
}
