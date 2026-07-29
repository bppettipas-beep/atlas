import { Plus, ShieldCheck, Users } from '@/components/icons';
import { Button, Chip, Notice, RuledHead, Sheet } from '@/components/ui';

const RANKS = [
  ['Owner', 'Full company authority', 'Protected'],
  ['Co-owner', 'Broad company operations', 'Protected'],
  ['Administrator', 'Company configuration and operations', 'Protected'],
  ['Manager', 'Managed people and selected teams', 'Scoped'],
  ['Supervisor', 'Selected-team daily operations', 'Scoped'],
  ['Team Lead', 'Team coordination without management authority', 'Scoped'],
  ['Worker', 'Assigned work and own schedule', 'Restricted'],
  ['Contractor', 'Assigned and explicitly shared work', 'Restricted'],
  ['Guest', 'Explicitly shared resources only', 'Restricted'],
] as const;

/** The replacement surface for legacy job-role management. */
export function RanksPermissionsTab() {
  return (
    <div className="space-y-5">
      <Notice tone="info">
        Ranks control Atlas access. Job title and reporting relationships remain separate from permissions.
      </Notice>
      <Sheet>
        <RuledHead
          index="R"
          title="Ranks & Permissions"
          description="Authority flows from rank permissions and their scope, never from an editable title."
          className="px-5 pt-5"
          action={<Button variant="primary" icon={<Plus />} disabled>Create rank</Button>}
        />
        <div className="mt-5 divide-y divide-rule border-t border-rule">
          {RANKS.map(([name, summary, kind], index) => (
            <div key={name} className="flex items-center gap-3 px-5 py-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-edge font-mono text-[11px] text-ink-3">{index + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-medium text-ink">{name}</p><p className="mt-0.5 text-[12px] text-ink-3">{summary}</p></div>
              <Chip className={kind === 'Protected' ? 'border-pending/35 bg-pending-wash text-pending' : ''}>{kind === 'Protected' && <ShieldCheck className="mr-1" />}{kind}</Chip>
              <Button size="sm" variant="ghost" disabled>Permissions</Button>
            </div>
          ))}
        </div>
      </Sheet>
      <Sheet className="flex items-start gap-3 p-4"><Users className="mt-0.5 text-[18px] text-ink-3" /><p className="text-[13px] leading-relaxed text-ink-2">Rank changes and permission scopes are being migrated from the retired role model. Protected ranks remain guarded from self-promotion and accidental lockout.</p></Sheet>
    </div>
  );
}
