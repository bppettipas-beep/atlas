import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building,
  Calendar,
  Check,
  CheckSquare,
  ShieldCheck,
  TreeStructure,
} from '@/components/icons';
import { MarketingFooter, MarketingHeader } from '@/components/marketing/MarketingChrome';
import { DRAFT_EASE } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

const PRICING_PLANS = [
  {
    name: 'Starter',
    price: '$19',
    description: 'For a new business building its operating foundation.',
    capacity: 'Up to 10 employees',
    features: ['Everything included', 'Core work management', 'People and organization map'],
  },
  {
    name: 'Growth',
    price: '$49',
    featured: true,
    description: 'The full operating picture for a team finding its rhythm.',
    capacity: 'Up to 50 employees',
    features: [
      'Unlimited managers',
      'Atlasy AI included',
      'Scheduling and Knowledge Base',
      'Organization Map and Reporting',
    ],
  },
  {
    name: 'Business',
    price: '$99',
    description: 'More control and insight for an established operation.',
    capacity: 'Up to 150 employees',
    features: ['Advanced permissions', 'Analytics', 'API access', 'Priority support'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'A tailored Atlas rollout for complex organizations.',
    capacity: 'Built around your company',
    features: [
      'Custom pricing',
      'Tailored onboarding',
      'Flexible company scale',
      'Priority support',
    ],
  },
];

/** Answers to the things people actually ask, all of them true of the build. */
const PRICING_FAQ = [
  [
    'Can one person work for more than one company?',
    'Yes. An account can hold a membership in several companies and switch between them, with a separate role in each.',
  ],
  [
    'Can we add someone who never uses a computer?',
    'Yes. A person can be added by hand with no login at all. They can be assigned work, put on the map and given a manager exactly like anyone else.',
  ],
  [
    'Can a worker see everything in the company?',
    'No. Every rule is enforced by the server, not by hiding buttons. A worker sees their own work and their teams’; the activity feed and invitations are closed to them entirely.',
  ],
  [
    'Where does our data actually live?',
    'In PostgreSQL, as the single source of truth. No third-party backend sits in the middle, so the company record is one you can point at, back up and take with you.',
  ],
] as const;

const PAGES = {
  problem: {
    index: '01',
    sheet: 'ATL-01',
    label: 'The problem',
    title: 'Stop running the company from memory.',
    intro:
      'Atlas gives the work, the people, and the way work gets done a shared home. The goal is not more software. It is fewer blind spots.',
    closer: 'Every gap above is somebody remembering to tell somebody else.',
    points: [
      ['See responsibility', 'Every person has a place, a role, a team, and clear ownership.'],
      [
        'Catch work early',
        'Deadlines, blockers, approvals, and activity stay visible before they become a crisis.',
      ],
      [
        'Keep know-how',
        'Processes belong to the company, not to the one person who happens to remember them.',
      ],
    ],
    inPractice: [
      [
        'Start with the handoffs',
        'Map the moments where one person has to remember to tell another person something. Those are the first gaps Atlas makes visible.',
      ],
      [
        'Give every job an owner',
        'A task, process, and decision should have a person attached to it. Clarity is less about adding process and more about removing ambiguity.',
      ],
      [
        'Keep the signal in one place',
        'Updates belong beside the work, not buried in a chat thread that only a few people can find later.',
      ],
    ],
    icon: TreeStructure,
  },
  product: {
    index: '02',
    sheet: 'ATL-02',
    label: 'What Atlas does',
    title: 'The connected picture of your business.',
    intro:
      'Atlas is built around the questions small teams ask all day: who is responsible, what needs doing, when is it happening, and how should it be done?',
    closer: 'Four surfaces, one record underneath them.',
    points: [
      [
        'Organisation map',
        'A living structure of people, teams, reporting lines, skills, and ownership.',
      ],
      [
        'Work',
        'Tasks carry the context needed to finish them: subtasks, comments, documents, evidence, and approval.',
      ],
      [
        'Schedule',
        'A clear resource timeline that turns planned work into a practical day for the people doing it.',
      ],
      [
        'Knowledge',
        'Living documents with ownership, version history, and acknowledgement when a process must be read.',
      ],
    ],
    inPractice: [
      [
        'See the whole chain',
        'A job can begin with a person, be assigned to a team, scheduled into a day, and linked to the instructions needed to complete it.',
      ],
      [
        'Work from context',
        'Instead of asking around, the person doing the work can see the notes, documents, attachments, and updates that matter.',
      ],
      [
        'Let the record build itself',
        'Changes, comments, approvals, and completed work stay connected, making the next handoff easier than the last.',
      ],
    ],
    icon: CheckSquare,
  },
  roles: {
    index: '03',
    sheet: 'ATL-03',
    label: 'Two views, one company',
    title: 'The right amount of information for every role.',
    intro:
      'Owners and managers need the whole operating picture. Workers need a calm, focused view of the work in front of them. Atlas gives both groups a view designed for their job.',
    closer: 'The same data, read from two different chairs.',
    points: [
      [
        'Owners and managers',
        'See the map, team capacity, blocked work, changing responsibilities, and the company-wide activity record.',
      ],
      [
        'Workers',
        'Use My Day to see assigned work, follow the right process, update progress, and report a blocker or time off.',
      ],
      [
        'Permissions that hold',
        'Access is enforced by the server, so the view is not merely hiding information a person should not access.',
      ],
    ],
    inPractice: [
      [
        'A calm worker day',
        'Workers open a focused list of today’s work instead of a dashboard full of decisions that are not theirs to make.',
      ],
      [
        'A useful manager view',
        'Managers can spot overdue, blocked, unassigned, and scheduled work early enough to do something about it.',
      ],
      [
        'One source of truth',
        'Both views come from the same data, so a worker update is immediately useful to the people coordinating the business.',
      ],
    ],
    icon: Building,
  },
  details: {
    index: '04',
    sheet: 'ATL-04',
    label: 'Everything else',
    title: 'The details that make a system stick.',
    intro:
      'Good operations software earns trust in the small moments: a notification arriving at the right time, a photo staying with the job, or a recurring task appearing without anyone remembering it.',
    closer: 'Small mechanics, compounding into a record you can trust.',
    points: [
      [
        'Live updates',
        'Assignments, comments, schedules, and availability update for the people who need to know.',
      ],
      [
        'A reliable record',
        'Activity history records what changed and why, so handoffs do not depend on retelling the story.',
      ],
      [
        'Built for the real world',
        'Attachments, mentions, sign-off, Google sign-in, invitations, and multi-company access fit into the same operating model.',
      ],
    ],
    inPractice: [
      [
        'Updates reach the right people',
        'Assignments, comments, schedule changes, and announcements become notifications in Atlas and can also arrive by email.',
      ],
      [
        'Processes stay usable',
        'A document can be owned, published, revised, and acknowledged, turning “the way we do it” into something people can actually follow.',
      ],
      [
        'Small actions add up',
        'Attachments, mentions, approvals, recurring tasks, and availability are deliberately connected instead of being separate little tools.',
      ],
    ],
    icon: ShieldCheck,
  },
  pricing: {
    index: '05',
    sheet: 'ATL-05',
    label: 'Pricing',
    title: 'Plans that grow with the way you work.',
    intro:
      'Choose the Atlas plan that fits your company today, then grow into the next level when your operation needs more room and control.',
    closer: '',
    points: [],
    inPractice: [],
    icon: Calendar,
  },
  'getting-started': {
    index: '06',
    sheet: 'ATL-06',
    label: 'Getting started',
    title: 'Set up the operating picture in an afternoon.',
    intro:
      'Atlas becomes useful quickly because it starts with the things you already know: your company, your people, and the first piece of work that matters.',
    closer: 'Three steps, and the picture starts drawing itself.',
    points: [
      ['Create your company', 'Set up the company and become its owner.'],
      [
        'Invite your people',
        'Send invitation codes and add the reporting lines, teams, and responsibilities that matter.',
      ],
      [
        'Put the first job in motion',
        'Assign work, attach the process, schedule it when appropriate, and let the shared picture start doing its work.',
      ],
    ],
    inPractice: [
      [
        'Begin with what is true today',
        'Add the people, teams, and reporting lines you already know. You do not need a perfect org chart to make the first version useful.',
      ],
      [
        'Choose one real workflow',
        'Bring in a current job, assign it, attach the instructions, and let the team use Atlas on something that matters.',
      ],
      [
        'Build in layers',
        'Once the first work is moving, add recurring routines, announcements, schedules, and the company knowledge that makes handoffs reliable.',
      ],
    ],
    icon: BookOpen,
  },
};

export function MarketingDetailPage() {
  const { section } = useParams();
  const { session } = useAuth();
  const page = section ? PAGES[section as keyof typeof PAGES] : undefined;

  // The braces matter. With a concise body this returned whatever scrollTo
  // returns — a Promise in current Chromium — and React takes an effect's
  // return value to be its cleanup function. It then called that Promise on
  // unmount, threw "destroy is not a function", and took the page down with it.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);

  if (!page) return <Navigate to="/" replace />;
  const Icon = page.icon;
  const isPricing = section === 'pricing';

  return (
    <div className="sheet-set min-h-full bg-paper">
      <MarketingHeader current={section} />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="drafting-grid border-b border-edge">
          <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: DRAFT_EASE }}
              className="ticked relative border-x border-edge bg-paper/40 px-5 py-16 sm:px-10 sm:py-24"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-mono text-[11px] text-ink-2">SHEET {page.index}</span>
                <span aria-hidden className="h-px w-8 bg-edgeStrong" />
                <p className="edge-sm">{page.label}</p>
                <Icon aria-hidden className="ml-auto text-[26px] text-ink-3" />
              </div>

              <h1 className="display mt-8 max-w-[15ch] text-[2.7rem] leading-[0.95] sm:text-[4.6rem]">
                {page.title}
              </h1>

              <div className="mt-9 flex max-w-[62ch] items-start gap-4">
                <span aria-hidden className="mt-[11px] flex shrink-0 items-center">
                  <span className="h-[7px] w-[7px] bg-ink" />
                  <span className="h-px w-12 bg-edgeStrong" />
                </span>
                <p className="text-[16px] leading-relaxed text-ink-2">{page.intro}</p>
              </div>
            </motion.div>
          </div>
        </section>

        {isPricing ? (
          <PricingContent signedIn={Boolean(session)} />
        ) : (
          <>
            {/* ------------------------------------------------------- points */}
            <section className="border-b border-edge">
              <div className="mx-auto w-full max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
                <ol>
                  {page.points.map(([title, body], index) => (
                    <li
                      key={title}
                      className="grid items-baseline gap-x-8 gap-y-2 border-b border-rule py-7 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,14rem)_1fr]"
                    >
                      <span className="font-mono text-[1.6rem] font-light leading-none text-ink-3 sm:text-[2rem]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h2 className="title text-[19px] sm:text-[21px]">{title}</h2>
                      <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
                        {body}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            {/* --------------------------------------------- the negative print */}
            <section className="negative drafting-grid-negative border-b border-ink">
              <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
                <div className="ticked ticked-negative relative border border-white/15 p-6 sm:p-10">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-white/45">IN PRACTICE</span>
                    <motion.span
                      aria-hidden
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.6, ease: DRAFT_EASE }}
                      style={{ originX: 0 }}
                      className="h-px flex-1 bg-white/25"
                    />
                  </div>

                  <h2 className="display mt-7 max-w-[20ch] text-[1.9rem] leading-[1.02] sm:text-[3rem]">
                    {page.closer}
                  </h2>

                  <div className="border-white/12 bg-white/12 mt-10 grid gap-px border md:grid-cols-3">
                    {page.inPractice.map(([title, body], index) => (
                      <article key={title} className="bg-ink p-6 sm:p-7">
                        <span className="font-mono text-[11px] text-white/40">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="title mt-7 text-[17px]">{title}</h3>
                        <p className="mt-3 text-[13.5px] leading-relaxed text-white/70">{body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <ClosingActions signedIn={Boolean(session)} />
          </>
        )}
      </main>

      <MarketingFooter sheet={page.sheet} title={page.label} />
    </div>
  );
}

function ClosingActions({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-b border-edge">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-3 px-5 py-12 sm:px-8">
        <Link
          to={signedIn ? '/app' : '/start'}
          className="group inline-flex h-12 items-center gap-2.5 rounded-sm bg-ink px-6 text-[14.5px] font-medium text-white transition-colors hover:bg-ink-2"
        >
          {signedIn ? 'Open your panel' : 'Get started'}
          <ArrowRight className="text-[14px] transition-transform duration-200 ease-draft group-hover:translate-x-1" />
        </Link>
        <Link
          to="/"
          className="inline-flex h-12 items-center rounded-sm border border-edge bg-sheet px-6 text-[14.5px] font-medium text-ink transition-colors hover:border-edgeStrong hover:bg-paper"
        >
          Back to overview
        </Link>
      </div>
    </section>
  );
}

function PricingContent({ signedIn }: { signedIn: boolean }) {
  const actionHref = signedIn ? '/app' : '/start';

  return (
    <>
      {/* ---------------------------------------------------------- the plans */}
      <section className="border-b border-edge">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
          {/* One hairline grid rather than four floating cards: the plans are a
              comparison, and a comparison wants a shared rule between columns. */}
          <div className="grid gap-px border border-edge bg-edge lg:grid-cols-4">
            {PRICING_PLANS.map((plan) => (
              <article
                key={plan.name}
                className={`flex flex-col p-6 sm:p-7 ${
                  plan.featured ? 'negative ticked ticked-negative relative' : 'bg-paper'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="edge-sm">{plan.name}</p>
                  {/* White, not `mark`. The annotation blue is specified
                      against the paper ground and only reaches 3.2:1 on ink,
                      so on the negative print it cannot carry text. */}
                  {plan.featured && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white">
                      Most chosen
                    </span>
                  )}
                </div>

                <div className="figure-rule mt-5">
                  <div className="flex items-baseline gap-1.5">
                    {/* A price is a figure and sets in the mono. "Custom" is a
                        word, so it sets in the display face rather than
                        wearing the mono as a costume. */}
                    <span
                      className={`leading-none ${
                        plan.price === 'Custom'
                          ? 'display text-[2.1rem]'
                          : 'font-mono text-[2.9rem] font-light'
                      } ${plan.featured ? 'text-white' : 'text-ink'}`}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`text-[12.5px] ${plan.featured ? 'text-white/60' : 'text-ink-2'}`}
                    >
                      {plan.price === 'Custom' ? '' : '/ month'}
                    </span>
                  </div>
                </div>

                <p
                  className={`mt-4 min-h-[3.4rem] text-[13.5px] leading-relaxed ${
                    plan.featured ? 'text-white/70' : 'text-ink-2'
                  }`}
                >
                  {plan.description}
                </p>

                <p
                  className={`mt-5 border-y py-3 text-[13px] font-semibold ${
                    plan.featured ? 'border-white/20 text-white' : 'border-rule text-ink'
                  }`}
                >
                  {plan.capacity}
                </p>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-2.5 text-[13px] leading-snug ${
                        plan.featured ? 'text-white/85' : 'text-ink-2'
                      }`}
                    >
                      <Check
                        aria-hidden
                        className={`mt-[2px] shrink-0 text-[13px] ${
                          plan.featured ? 'text-white/50' : 'text-ink-3'
                        }`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  to={actionHref}
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-sm px-4 text-[13.5px] font-medium transition-colors ${
                    plan.featured
                      ? 'bg-white text-ink hover:bg-paper'
                      : 'border border-edge bg-sheet text-ink hover:border-edgeStrong hover:bg-paper'
                  }`}
                >
                  {`Buy ${plan.name}`}
                </Link>
              </article>
            ))}
          </div>

          <p className="mt-5 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-2">
            Every plan starts monthly and includes the shared operating picture: people, work,
            knowledge and live updates. Move up when your team needs more room — without replacing
            the system your company already relies on.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- FAQ */}
      <section className="border-b border-edge">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="display max-w-[13ch] text-[2rem] leading-[1.02] sm:text-[2.7rem]">
                Before you pick a plan.
              </h2>
              <p className="mt-6 max-w-[40ch] text-[14.5px] leading-relaxed text-ink-2">
                The questions that decide whether Atlas fits the way your company already works.
              </p>
            </div>

            <dl>
              {PRICING_FAQ.map(([question, answer], index) => (
                <div
                  key={question}
                  className="grid gap-x-6 gap-y-2 border-b border-rule py-6 first:border-t first:border-rule sm:grid-cols-[3rem_1fr]"
                >
                  <span aria-hidden className="font-mono text-[11px] text-ink-2">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <dt className="title text-[16px]">{question}</dt>
                    <dd className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
                      {answer}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <ClosingActions signedIn={signedIn} />
    </>
  );
}
