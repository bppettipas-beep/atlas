import { useState } from 'react';
import { Check, ShieldCheck } from '@/components/icons';
import { LoadingState, Notice, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';

type Plan = 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE';
type Status = 'ACTIVE' | 'SUSPENDED';

interface CompanySubscription {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  owner: { fullName: string; email: string } | null;
  subscriptionPlan: Plan;
  subscriptionStatus: Status;
  subscriptionExpiresAt: string | null;
}

interface CompaniesResponse {
  items: CompanySubscription[];
}

const PLANS: Plan[] = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];

/** The platform-owner workspace. Access is also enforced by /api/admin. */
export function AdminPage() {
  const query = useQuery<CompaniesResponse>((signal) => api.get('/admin/companies', undefined, signal), []);
  const toast = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  const updateSubscription = async (company: CompanySubscription, changes: Partial<CompanySubscription>) => {
    setSavingId(company.id);
    try {
      const next = {
        subscriptionPlan: (changes.subscriptionPlan ?? company.subscriptionPlan) as Plan,
        subscriptionStatus: (changes.subscriptionStatus ?? company.subscriptionStatus) as Status,
        subscriptionExpiresAt:
          changes.subscriptionExpiresAt === undefined ? company.subscriptionExpiresAt : changes.subscriptionExpiresAt,
      };
      const result = await api.patch<Pick<CompanySubscription, 'id' | 'subscriptionPlan' | 'subscriptionStatus' | 'subscriptionExpiresAt'>>(
        `/admin/companies/${company.id}/subscription`,
        next,
      );
      query.setData((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === result.id ? { ...item, ...result } : item)),
      }));
      toast.success(`${company.name} is now on ${result.subscriptionPlan.toLowerCase()} (${result.subscriptionStatus.toLowerCase()}).`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingId(null);
    }
  };

  if (query.loading && !query.data) return <LoadingState label="Loading platform administration" />;

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8 sm:px-8 sm:py-10">
      <div className="border-l-2 border-mark pl-5 sm:pl-7">
        <p className="edge text-mark">Platform administration</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-[2.3rem] leading-[0.98] sm:text-[3.5rem]">Atlas control room.</h1>
            <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-ink-2">
              Manage company subscriptions from one protected workspace. This area is available only to the platform administrator.
            </p>
          </div>
          <div className="flex items-center gap-2 border border-edge bg-sheet px-4 py-3 text-[13px] text-ink-2">
            <ShieldCheck className="text-[17px] text-mark" />
            Server-protected access
          </div>
        </div>
      </div>

      {query.error && <Notice className="mt-8" tone="alert">{query.error}</Notice>}

      <section className="mt-10 border border-edge bg-sheet">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4 sm:px-6">
          <div>
            <p className="title text-[17px]">Companies</p>
            <p className="mt-1 text-[13px] text-ink-3">Grant, change, suspend, or set an end date for subscriptions.</p>
          </div>
          <span className="font-mono text-[12px] text-ink-4">{query.data?.items.length ?? 0} total</span>
        </div>

        <div className="divide-y divide-edge">
          {query.data?.items.map((company) => {
            const saving = savingId === company.id;
            return (
              <article key={company.id} className="grid gap-5 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(220px,1fr)_180px_170px_180px] lg:items-end">
                <div>
                  <h2 className="title text-[17px]">{company.name}</h2>
                  <p className="mt-1 text-[13px] text-ink-3">
                    {company.owner ? `${company.owner.fullName} · ${company.owner.email}` : 'No active owner'}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-ink-4">{company.memberCount} active members · {company.slug}</p>
                </div>
                <label className="block">
                  <span className="edge-sm mb-1.5 block">Plan</span>
                  <select
                    value={company.subscriptionPlan}
                    disabled={saving}
                    onChange={(event) => void updateSubscription(company, { subscriptionPlan: event.target.value as Plan })}
                    className="h-10 w-full rounded-sm border border-edge bg-paper px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    {PLANS.map((plan) => <option key={plan} value={plan}>{plan[0]}{plan.slice(1).toLowerCase()}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="edge-sm mb-1.5 block">Status</span>
                  <select
                    value={company.subscriptionStatus}
                    disabled={saving}
                    onChange={(event) => void updateSubscription(company, { subscriptionStatus: event.target.value as Status })}
                    className="h-10 w-full rounded-sm border border-edge bg-paper px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </label>
                <label className="block">
                  <span className="edge-sm mb-1.5 block">Expires on</span>
                  <input
                    type="date"
                    value={company.subscriptionExpiresAt ? company.subscriptionExpiresAt.slice(0, 10) : ''}
                    disabled={saving}
                    onChange={(event) => void updateSubscription(company, { subscriptionExpiresAt: event.target.value ? new Date(`${event.target.value}T23:59:59.999Z`).toISOString() : null })}
                    className="h-10 w-full rounded-sm border border-edge bg-paper px-3 text-[13px] text-ink outline-none focus:border-ink"
                  />
                </label>
                <p className={`inline-flex items-center gap-1.5 text-[12px] ${company.subscriptionStatus === 'ACTIVE' ? 'text-done' : 'text-alert'}`}>
                  <Check className="text-[13px]" /> {saving ? 'Saving…' : company.subscriptionStatus === 'ACTIVE' ? 'Subscription active' : 'Subscription suspended'}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
