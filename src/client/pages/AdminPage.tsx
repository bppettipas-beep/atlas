import { useState } from 'react';
import {
  Building,
  Check,
  Clock,
  Search,
  Megaphone,
  PaperPlane,
  ShieldCheck,
  SignOut,
  User,
  Users,
} from '@/components/icons';
import {
  Avatar,
  Button,
  Field,
  Input,
  LoadingState,
  Modal,
  Notice,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/useQuery';
import { Markdown } from '@/components/knowledge/Markdown';

type Plan = 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE';
type Status = 'ACTIVE' | 'SUSPENDED';
type AccountState = '' | 'free' | 'active' | 'suspended';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  isPlatformAdmin: boolean;
  subscriptionPlan: Plan | null;
  subscriptionStatus: Status | null;
  subscriptionExpiresAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  activeSessionCount: number;
  companies: {
    membershipId: string;
    id: string;
    name: string;
    slug: string;
    role: 'OWNER' | 'CO_OWNER' | 'MANAGER' | 'WORKER';
  }[];
}

interface UsersResponse {
  items: AdminUser[];
  total: number;
  limited: boolean;
  metrics: {
    allUsers: number;
    paidUsers: number;
    freeUsers: number;
    panelUsers: number;
    activeSessions: number;
  };
}

const PLANS: Plan[] = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];

function titleCase(value: string) {
  return value[0] + value.slice(1).toLowerCase();
}

function shortDate(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function AdminPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<Plan | ''>('');
  const [state, setState] = useState<AccountState>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastId, setBroadcastId] = useState(() => crypto.randomUUID());
  const [broadcastView, setBroadcastView] = useState<'write' | 'preview'>('write');
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const debouncedSearch = useDebounced(search);
  const query = useQuery<UsersResponse>(
    (signal) =>
      api.get(
        '/admin/users',
        { search: debouncedSearch, plan: plan || undefined, state: state || undefined },
        signal,
      ),
    [debouncedSearch, plan, state],
  );
  const recipients = useQuery<{ count: number; emailConfigured: boolean }>(
    (signal) => api.get('/admin/broadcast/recipients', undefined, signal),
    [],
  );

  const sendBroadcast = async () => {
    setSendingBroadcast(true);
    try {
      const result = await api.post<{ sent: number; failed: number; total: number }>(
        '/admin/broadcast',
        {
          title: broadcastTitle,
          body: broadcastBody,
          broadcastId,
        },
      );
      setConfirmBroadcast(false);
      if (result.failed) {
        toast.error(
          `${result.sent} sent; ${result.failed} could not be queued. Check Resend usage and logs.`,
        );
      } else {
        toast.success(`Announcement queued for ${result.sent} Atlas accounts.`);
        setBroadcastOpen(false);
        setBroadcastTitle('');
        setBroadcastBody('');
        setBroadcastId(crypto.randomUUID());
        setBroadcastView('write');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSendingBroadcast(false);
    }
  };

  const updateUser = async (
    user: AdminUser,
    changes: Partial<
      Pick<AdminUser, 'subscriptionPlan' | 'subscriptionStatus' | 'subscriptionExpiresAt'>
    >,
  ) => {
    setSavingId(user.id);
    try {
      const nextPlan =
        changes.subscriptionPlan === undefined ? user.subscriptionPlan : changes.subscriptionPlan;
      const nextStatus =
        nextPlan === null
          ? null
          : changes.subscriptionStatus === undefined
            ? (user.subscriptionStatus ?? 'ACTIVE')
            : changes.subscriptionStatus;
      const result = await api.patch<AdminUser>(`/admin/users/${user.id}/subscription`, {
        subscriptionPlan: nextPlan,
        subscriptionStatus: nextStatus,
        subscriptionExpiresAt:
          changes.subscriptionExpiresAt === undefined
            ? user.subscriptionExpiresAt
            : changes.subscriptionExpiresAt,
      });
      query.setData((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === result.id ? result : item)),
      }));
      toast.success(
        nextPlan
          ? `${user.fullName} is now on ${titleCase(nextPlan)}.`
          : `${user.fullName} now has no paid plan.`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingId(null);
    }
  };

  const revokeSessions = async (user: AdminUser) => {
    if (
      !window.confirm(`Sign ${user.fullName} out on every device? They will need to sign in again.`)
    ) {
      return;
    }
    setRevokingId(user.id);
    try {
      const result = await api.post<{ revokedSessions: number }>(
        `/admin/users/${user.id}/revoke-sessions`,
      );
      query.setData((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === user.id ? { ...item, activeSessionCount: 0 } : item,
        ),
        metrics: {
          ...current.metrics,
          activeSessions: Math.max(0, current.metrics.activeSessions - result.revokedSessions),
        },
      }));
      toast.success(
        result.revokedSessions === 1
          ? 'One session was revoked.'
          : `${result.revokedSessions} sessions were revoked.`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRevokingId(null);
    }
  };

  if (query.loading && !query.data) {
    return <LoadingState label="Loading platform administration" />;
  }

  const metrics = query.data?.metrics;

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
        <header className="border-l-2 border-mark pl-5 sm:pl-7">
          <p className="edge text-mark">Platform administration</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display text-[2.3rem] leading-[0.98] sm:text-[3.5rem]">
                User control room.
              </h1>
              <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
                Find any Atlas account, change its plan, control subscription access, and revoke
                active sessions.
              </p>
            </div>
            <div className="flex items-center gap-2 border border-edge bg-sheet px-4 py-3 text-[13px] text-ink-2">
              <ShieldCheck className="text-[17px] text-mark" />
              Server-protected access
            </div>
          </div>
        </header>

        {query.error && (
          <Notice className="mt-8" tone="alert">
            {query.error}
          </Notice>
        )}

        {metrics && (
          <section
            aria-label="Platform totals"
            className="mt-10 grid border border-edge bg-sheet sm:grid-cols-2 lg:grid-cols-5"
          >
            {[
              { label: 'Accounts', value: metrics.allUsers, Icon: User },
              { label: 'Paid plans', value: metrics.paidUsers, Icon: Check },
              { label: 'Free accounts', value: metrics.freeUsers, Icon: Users },
              { label: 'Panels', value: metrics.panelUsers, Icon: Building },
              { label: 'Live sessions', value: metrics.activeSessions, Icon: Clock },
            ].map(({ label, value, Icon }, index) => (
              <div
                key={label}
                className={`px-5 py-4 ${index > 0 ? 'border-t border-edge sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 lg:border-l' : ''}`}
              >
                <Icon className="text-[16px] text-ink-4" />
                <p className="mt-4 font-mono text-[25px] leading-none text-ink">{value}</p>
                <p className="mt-1.5 text-[12px] text-ink-3">{label}</p>
              </div>
            ))}
          </section>
        )}

        <section className="mt-6 border border-edge bg-sheet">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-edge bg-paper">
                <Megaphone className="text-[17px] text-mark" />
              </span>
              <div>
                <p className="edge-sm text-mark">Platform email</p>
                <h2 className="title mt-1 text-[17px]">Broadcast an announcement</h2>
                <p className="mt-1 max-w-[65ch] text-[12.5px] leading-relaxed text-ink-3">
                  Send one formatted announcement to every Atlas account with a real email address.
                  Each recipient receives a private, individual message.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-ink-3">
                {recipients.loading ? 'Counting…' : `${recipients.data?.count ?? 0} recipients`}
              </span>
              <Button
                variant="primary"
                icon={<Megaphone />}
                disabled={!recipients.data?.emailConfigured}
                onClick={() => setBroadcastOpen((current) => !current)}
              >
                {broadcastOpen ? 'Close composer' : 'Compose announcement'}
              </Button>
            </div>
          </div>

          {recipients.data && !recipients.data.emailConfigured && (
            <Notice className="mx-5 mb-5 sm:mx-6" tone="alert">
              Resend is not configured in this deployment, so broadcasts cannot be sent.
            </Notice>
          )}

          {broadcastOpen && (
            <div className="grid border-t border-edge lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
              <div className="p-5 sm:p-6 lg:border-r lg:border-edge">
                <Field
                  label="Email title"
                  htmlFor="broadcast-title"
                  hint={`${broadcastTitle.length}/150 characters`}
                  required
                >
                  <Input
                    id="broadcast-title"
                    value={broadcastTitle}
                    maxLength={150}
                    placeholder="What every Atlas account should know"
                    onChange={(event) => setBroadcastTitle(event.target.value)}
                  />
                </Field>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <label htmlFor="broadcast-body" className="edge">
                    Announcement body <span className="text-mark">*</span>
                  </label>
                  <div className="flex border border-edge" role="group" aria-label="Body view">
                    {(['write', 'preview'] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setBroadcastView(view)}
                        className={`px-3 py-1.5 text-[11px] font-medium capitalize ${
                          broadcastView === view
                            ? 'bg-ink text-white'
                            : 'bg-paper text-ink-3 hover:text-ink'
                        }`}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                </div>

                {broadcastView === 'write' ? (
                  <Textarea
                    id="broadcast-body"
                    value={broadcastBody}
                    maxLength={10_000}
                    rows={12}
                    className="mt-1.5 min-h-[260px] font-mono text-[13px]"
                    placeholder={
                      'Write the announcement here.\n\nUse **bold**, *italic*, headings, lists, quotes, and [links](https://example.com).'
                    }
                    onChange={(event) => setBroadcastBody(event.target.value)}
                  />
                ) : (
                  <div className="mt-1.5 min-h-[260px] border border-edge bg-paper px-5 py-4">
                    {broadcastBody.trim() ? (
                      <Markdown source={broadcastBody} />
                    ) : (
                      <p className="text-[13px] text-ink-4">Write something to preview it here.</p>
                    )}
                  </div>
                )}
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
                  Formatting supports headings, bold, italics, links, quotes, numbered lists, and
                  bullet lists. Raw HTML is always escaped.
                </p>
              </div>

              <aside className="bg-paper/50 p-5 sm:p-6">
                <p className="edge-sm">Delivery review</p>
                <dl className="mt-5 divide-y divide-rule border-y border-rule text-[12.5px]">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-ink-3">Audience</dt>
                    <dd className="font-mono text-ink">{recipients.data?.count ?? 0} accounts</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-ink-3">Privacy</dt>
                    <dd className="text-right text-ink">Individual delivery</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-ink-3">Sender</dt>
                    <dd className="text-right text-ink">Atlas notifications</dd>
                  </div>
                </dl>
                <Notice className="mt-5" tone="pending">
                  Sending is irreversible. Resend’s daily quota still applies; on its free tier,
                  other Atlas emails sent today reduce the remaining broadcast capacity.
                </Notice>
                <Button
                  variant="primary"
                  size="lg"
                  className="mt-5 w-full justify-center"
                  icon={<PaperPlane />}
                  disabled={
                    !broadcastTitle.trim() ||
                    !broadcastBody.trim() ||
                    !recipients.data?.count ||
                    !recipients.data.emailConfigured
                  }
                  onClick={() => setConfirmBroadcast(true)}
                >
                  Review and send
                </Button>
              </aside>
            </div>
          )}
        </section>

        <section className="mt-6 border border-edge bg-sheet">
          <div className="grid gap-3 border-b border-edge p-4 sm:grid-cols-[minmax(260px,1fr)_180px_180px] sm:p-5">
            <label>
              <span className="edge-sm mb-1.5 block">Search accounts</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-4" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, email, or company"
                  className="pl-9"
                />
              </div>
            </label>
            <label>
              <span className="edge-sm mb-1.5 block">Plan</span>
              <Select value={plan} onChange={(event) => setPlan(event.target.value as Plan | '')}>
                <option value="">All plans</option>
                {PLANS.map((item) => (
                  <option key={item} value={item}>
                    {titleCase(item)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span className="edge-sm mb-1.5 block">Account state</span>
              <Select
                value={state}
                onChange={(event) => setState(event.target.value as AccountState)}
              >
                <option value="">All states</option>
                <option value="free">No plan</option>
                <option value="active">Active plan</option>
                <option value="suspended">Suspended plan</option>
              </Select>
            </label>
          </div>

          <div className="flex items-center justify-between border-b border-edge px-5 py-3">
            <p className="title text-[15px]">
              {query.data?.total ?? 0} {query.data?.total === 1 ? 'account' : 'accounts'}
            </p>
            {query.data?.limited && (
              <p className="text-[12px] text-ink-3">Showing the newest 250 matches</p>
            )}
          </div>

          {!query.loading && query.data?.items.length === 0 && (
            <div className="px-5 py-14 text-center">
              <Search className="mx-auto text-[25px] text-ink-4" />
              <p className="title mt-4 text-[17px]">No matching accounts</p>
              <p className="mt-1 text-[13px] text-ink-3">Try a different search or filter.</p>
            </div>
          )}

          <div className="divide-y divide-edge">
            {query.data?.items.map((user) => {
              const saving = savingId === user.id;
              const revoking = revokingId === user.id;
              return (
                <article key={user.id} className="px-5 py-6 sm:px-6">
                  <div className="grid gap-6 xl:grid-cols-[minmax(260px,1.15fr)_minmax(560px,2fr)] xl:items-start">
                    <div className="flex min-w-0 gap-3.5">
                      <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="title truncate text-[17px]">{user.fullName}</h2>
                          {user.isPlatformAdmin && (
                            <span className="border border-mark/30 bg-mark-wash px-1.5 py-0.5 text-[10px] font-medium text-mark">
                              Platform admin
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[13px] text-ink-2">{user.email}</p>
                        {(user.phone || user.location) && (
                          <p className="mt-1 text-[12px] text-ink-3">
                            {[user.phone, user.location].filter(Boolean).join(' / ')}
                          </p>
                        )}
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                          <div>
                            <dt className="edge-sm">Joined</dt>
                            <dd className="mt-0.5 font-mono text-ink-2">
                              {shortDate(user.createdAt)}
                            </dd>
                          </div>
                          <div>
                            <dt className="edge-sm">Last login</dt>
                            <dd className="mt-0.5 font-mono text-ink-2">
                              {shortDate(user.lastLoginAt)}
                            </dd>
                          </div>
                          <div>
                            <dt className="edge-sm">Sessions</dt>
                            <dd className="mt-0.5 font-mono text-ink-2">
                              {user.activeSessionCount} active
                            </dd>
                          </div>
                          <div>
                            <dt className="edge-sm">Panels</dt>
                            <dd className="mt-0.5 font-mono text-ink-2">{user.companies.length}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label>
                          <span className="edge-sm mb-1.5 block">Plan</span>
                          <Select
                            value={user.subscriptionPlan ?? ''}
                            disabled={saving}
                            onChange={(event) =>
                              void updateUser(user, {
                                subscriptionPlan: (event.target.value || null) as Plan | null,
                              })
                            }
                          >
                            <option value="">No plan</option>
                            {PLANS.map((item) => (
                              <option key={item} value={item}>
                                {titleCase(item)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label>
                          <span className="edge-sm mb-1.5 block">Subscription access</span>
                          <Select
                            value={user.subscriptionStatus ?? ''}
                            disabled={saving || !user.subscriptionPlan}
                            onChange={(event) =>
                              void updateUser(user, {
                                subscriptionStatus: event.target.value as Status,
                              })
                            }
                          >
                            {!user.subscriptionPlan && <option value="">No plan</option>}
                            <option value="ACTIVE">Active</option>
                            <option value="SUSPENDED">Suspended</option>
                          </Select>
                        </label>
                        <label>
                          <span className="edge-sm mb-1.5 block">Expires on</span>
                          <Input
                            type="date"
                            value={user.subscriptionExpiresAt?.slice(0, 10) ?? ''}
                            disabled={saving || !user.subscriptionPlan}
                            onChange={(event) =>
                              void updateUser(user, {
                                subscriptionExpiresAt: event.target.value
                                  ? new Date(`${event.target.value}T23:59:59.999Z`).toISOString()
                                  : null,
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
                          {user.companies.length === 0 ? (
                            <span>No panel created</span>
                          ) : (
                            user.companies.map((company) => (
                              <span key={company.membershipId} className="truncate">
                                {company.name} ({titleCase(company.role)})
                              </span>
                            ))
                          )}
                        </div>
                        <Button
                          size="sm"
                          icon={<SignOut />}
                          loading={revoking}
                          disabled={user.isPlatformAdmin || user.activeSessionCount === 0}
                          title={
                            user.isPlatformAdmin
                              ? 'Protected for the platform administrator'
                              : undefined
                          }
                          onClick={() => void revokeSessions(user)}
                        >
                          Revoke sessions
                        </Button>
                      </div>
                      {saving && (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-mark">
                          <Check className="text-[13px]" />
                          Applying account and panel access
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <Modal
        open={confirmBroadcast}
        onClose={() => !sendingBroadcast && setConfirmBroadcast(false)}
        title="Send this announcement?"
        description={`This will email ${recipients.data?.count ?? 0} Atlas accounts and cannot be recalled.`}
        footer={
          <>
            <Button disabled={sendingBroadcast} onClick={() => setConfirmBroadcast(false)}>
              Go back
            </Button>
            <Button
              variant="primary"
              icon={<PaperPlane />}
              loading={sendingBroadcast}
              onClick={() => void sendBroadcast()}
            >
              Send to every account
            </Button>
          </>
        }
      >
        <div className="border border-edge bg-paper p-4">
          <p className="edge-sm">Subject</p>
          <p className="title mt-1 text-[16px]">{broadcastTitle}</p>
          <div className="mt-4 border-t border-rule pt-4">
            <Markdown source={broadcastBody} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
