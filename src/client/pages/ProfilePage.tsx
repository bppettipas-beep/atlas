import { PageBody, PageTransition } from '@/components/layout/AppShell';
import { ProfilePanel } from '@/components/people/ProfilePanel';
import { Button, LoadingState, PageHeader, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useSession } from '@/providers/AuthProvider';
import { useState } from 'react';
import { Pencil } from '@/components/icons';
import { AVAILABILITY_META, ROLE_META, cn, formatDate } from '@/lib/utils';
import type { PersonDetail, PersonSummary } from '@shared/types';
import { Avatar, Chip, RuledHead } from '@/components/ui';

/**
 * "My profile" is the same record everyone else sees, shown as a read-through
 * with an edit affordance — not a separate settings form. What your colleagues
 * see and what you edit should never be two different screens.
 */
export function ProfilePage() {
  const session = useSession();
  const [panelOpen, setPanelOpen] = useState(false);

  const me = useQuery<PersonDetail>(
    (signal) => api.get(`/people/${session.membership.id}`, undefined, signal),
    [session.membership.id],
  );
  const people = useQuery<{ items: PersonSummary[] }>(
    (signal) => api.get('/people', undefined, signal),
    [],
  );

  const person = me.data;

  return (
    <PageTransition>
      <PageBody className="max-w-[820px]">
        <PageHeader
          eyebrow="Your profile"
          title="How your company sees you"
          description="Your colleagues see this on the organization map. Keep the availability honest — people plan around it."
          actions={
            <Button icon={<Pencil />} onClick={() => setPanelOpen(true)}>
              Open and edit
            </Button>
          }
        />

        {me.loading && !person && <LoadingState label="Loading your profile" />}

        {person && (
          <Sheet ticked className="p-6">
            <div className="flex flex-wrap items-start gap-5">
              <div className="relative shrink-0">
                <Avatar name={person.fullName} src={person.avatarUrl} size="xl" />
                <span
                  title={AVAILABILITY_META[person.availability].label}
                  className={cn(
                    'absolute -bottom-1 -right-1 h-3 w-3 ring-2 ring-sheet',
                    AVAILABILITY_META[person.availability].dot,
                  )}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="display text-[24px] leading-none">{person.fullName}</h2>
                <p className="mt-2 text-[13.5px] text-ink-3">{person.jobTitle ?? 'No job title'}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip className={ROLE_META[person.role].chip}>
                    {ROLE_META[person.role].label}
                  </Chip>
                  <Chip dot={AVAILABILITY_META[person.availability].dot}>
                    {AVAILABILITY_META[person.availability].label}
                  </Chip>
                  {person.teams.map((team) => (
                    <Chip key={team.id}>{team.name}</Chip>
                  ))}
                </div>
              </div>
            </div>

            {person.headline && (
              <p className="mt-6 border-l-2 border-ink pl-4 text-[14px] leading-relaxed text-ink-2">
                <span className="edge-sm mb-1 block">What you own</span>
                {person.headline}
              </p>
            )}

            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <section>
                <RuledHead title="Contact" className="mb-3" />
                <dl className="space-y-2 text-[13px]">
                  <Row label="Email" value={person.workEmail ?? person.email} />
                  {person.phone && <Row label="Phone" value={person.phone} />}
                  {person.location && <Row label="Location" value={person.location} />}
                  <Row label="Started" value={formatDate(person.startDate ?? person.joinedAt)} />
                  {person.manager && <Row label="Manager" value={person.manager.fullName} />}
                </dl>
              </section>

              <section>
                <RuledHead title="Workload" className="mb-3" />
                <dl className="grid grid-cols-2 gap-3">
                  <Stat label="Active" value={person.workload.active} />
                  <Stat label="Overdue" value={person.workload.overdue} alert />
                  <Stat label="Blocked" value={person.workload.blocked} alert />
                  <Stat label="Done 30d" value={person.workload.completedLast30Days} />
                </dl>
              </section>
            </div>

            {person.skills.length > 0 && (
              <section className="mt-8">
                <RuledHead title="Skills" className="mb-3" />
                <div className="flex flex-wrap gap-1.5">
                  {person.skills.map((skill) => (
                    <span
                      key={skill.id}
                      className="inline-flex items-center gap-2 border border-rule px-2 py-1 text-[12px] text-ink-2"
                    >
                      {skill.name}
                      <span className="flex gap-px" aria-label={`Level ${skill.level} of 5`}>
                        {[1, 2, 3, 4, 5].map((level) => (
                          <span
                            key={level}
                            className={cn(
                              'h-[3px] w-[3px]',
                              level <= skill.level ? 'bg-ink' : 'bg-edge',
                            )}
                          />
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            )}
          </Sheet>
        )}

        <ProfilePanel
          membershipId={panelOpen ? session.membership.id : null}
          people={people.data?.items ?? []}
          onClose={() => setPanelOpen(false)}
          onChanged={() => me.refetch()}
        />
      </PageBody>
    </PageTransition>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-20 shrink-0 text-ink-4">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ink-2">{value}</dd>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="border-t border-rule pt-2">
      <dt className="edge-sm">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-mono text-[18px] font-light leading-none',
          alert && value > 0 ? 'text-alert' : 'text-ink',
        )}
      >
        {String(value).padStart(2, '0')}
      </dd>
    </div>
  );
}
