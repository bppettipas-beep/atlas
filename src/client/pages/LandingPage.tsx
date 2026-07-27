import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  Building,
  Calendar,
  Certificate,
  Check,
  CheckSquare,
  HardHat,
  Paperclip,
  Pulse,
  SealCheck,
  ShieldCheck,
  TreeStructure,
  UserPlus,
  Warning,
} from '@/components/icons';
import { Logo, LogoMark } from '@/components/Logo';
import { DRAFT_EASE, LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

/**
 * The pitch.
 *
 * Drawn as the cover sheet of a drawing set, because that is what the product
 * is: a general arrangement of a business. Every claim here is something the
 * app actually does — there are no invented customers, no invented numbers,
 * and nothing that would have to be quietly removed before showing it to a
 * real buyer.
 */

const SYMPTOMS = [
  'The answer to “who does this?” lives in one person’s head.',
  'A job is blocked for three days before anyone hears about it.',
  'The person who knows the process is the person who is on holiday.',
  'Nobody can name what is late right now without asking around.',
];

const CAPABILITIES: {
  index: string;
  icon: (props: { className?: string }) => ReactNode;
  title: string;
  body: string;
}[] = [
  {
    index: '01',
    icon: TreeStructure,
    title: 'The organisation map',
    body: 'Everyone in the business as nodes, with the reporting lines, teams, shared skills and areas of ownership drawn between them. Atlas derives the lines from your data, so they cannot drift out of date.',
  },
  {
    index: '02',
    icon: CheckSquare,
    title: 'Work that cannot go quiet',
    body: 'Tasks carry subtasks, comments and deadlines. Blocking one requires an explanation, and escalates to a manager the moment it happens. Recurring work generates itself on schedule.',
  },
  {
    index: '03',
    icon: BookOpen,
    title: 'Knowledge that outlives people',
    body: 'Documented processes with version history and read acknowledgements, owned by a named person. You can see who has actually read the thing they are meant to follow.',
  },
  {
    index: '04',
    icon: Activity,
    title: 'One honest activity feed',
    body: 'Every assignment, completion, block and document change in one filterable stream — so a Monday morning starts with reading, not interrogating.',
  },
];

const AUDIENCES: {
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  title: string;
  points: string[];
}[] = [
  {
    label: 'Owners and managers',
    icon: Building,
    title: 'The whole business on one sheet',
    points: [
      'The organisation map, with live counts of what is active, late and unassigned',
      'Every person’s workload before you hand them another job',
      'Private notes on a profile that only managers can read',
      'Blocked work escalated to you the moment somebody flags it',
    ],
  },
  {
    label: 'Workers',
    icon: HardHat,
    title: 'My Day, and nothing else',
    points: [
      'The jobs that are actually yours today, in order',
      'Tick off subtasks as you go; the progress bar is the status report',
      'Flag a blocker with a reason and your manager knows immediately',
      'The process document for the job, attached to the job',
    ],
  },
];

const EXTRAS: {
  icon: (props: { className?: string }) => ReactNode;
  title: string;
  body: string;
}[] = [
  {
    icon: Pulse,
    title: 'Live for everyone',
    body: 'Assign a task and it appears on their screen. No refreshing, no wondering if they saw it.',
  },
  {
    icon: Bell,
    title: '@mention anybody',
    body: 'Pull a specific person into a comment thread and they get notified about that, not everything.',
  },
  {
    icon: Calendar,
    title: 'Recurring work',
    body: 'Weekly, monthly or on your own schedule. Atlas creates the job so nobody has to remember to.',
  },
  {
    icon: SealCheck,
    title: 'Work that needs sign-off',
    body: 'Mark a task as needing review and it waits for a manager instead of quietly marking itself done.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles that actually hold',
    body: 'Owner, manager, worker. Enforced on the server, not just hidden in the interface.',
  },
  {
    icon: UserPlus,
    title: 'Invitation codes',
    body: 'Set an expiry and a use limit, copy it in one click, and turn it off the moment it leaks.',
  },
  {
    icon: Certificate,
    title: 'Sign in with Google',
    body: 'One click, and their name and photo come with them. Or a plain password — their choice.',
  },
  {
    icon: Paperclip,
    title: 'Attachments on the job',
    body: 'The photo of the broken part belongs on the task, not in somebody’s camera roll.',
  },
  {
    icon: Building,
    title: 'More than one business',
    body: 'Run several companies from one login and switch between them without signing out.',
  },
];

const STEPS = [
  {
    index: '01',
    title: 'Create your company',
    body: 'Your name, your business, and a password. About a minute. You become the owner.',
  },
  {
    index: '02',
    title: 'Invite your people',
    body: 'Generate an invitation code and send it. They join with the code and appear on the map, reporting to the right person.',
  },
  {
    index: '03',
    title: 'Assign the first job',
    body: 'The map draws itself as people arrive. Give someone a task and the whole thing starts working.',
  },
];

const PLANS = [
  {
    name: 'Base',
    price: '$200',
    description: 'The essentials for getting your company organised.',
    features: ['Organisation map', 'People, work and knowledge', 'Real-time updates'],
  },
  {
    name: 'Growth',
    price: '$500',
    description: 'More room for a growing team and its day-to-day work.',
    features: ['Everything in Base', 'Manager workflows and approvals', 'Recurring work and activity history'],
  },
  {
    name: 'Scale',
    price: '$1,000',
    description: 'A complete operating system for a larger operation.',
    features: ['Everything in Growth', 'Multi-company support', 'Priority onboarding support'],
  },
];

export function LandingPage() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingState className="h-screen" label="Loading Atlas" />;

  // Signed-in people are deliberately *not* redirected away. This is the page
  // the mark in their sidebar links back to, and bouncing them to /app would
  // make that link look broken. They get a way back in instead.
  const signedIn = Boolean(session);

  return (
    <div className="min-h-full bg-paper">
      {/* ============================ title block ============================ */}
      <header className="sticky top-0 z-30 border-b border-edge bg-paper/92 backdrop-blur-[3px]">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-5 py-3 sm:px-10">
          <Logo markClassName="h-[25px] w-[25px]" wordClassName="text-[15px]" />

          {/* Signed in, this is the way back to your company. Signed out, it is
              the way in. Only one of the two is ever true. */}
          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Account">
            {signedIn ? (
              <Link
                to="/app"
                className="group inline-flex h-8 items-center gap-2 rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
              >
                Open panel
                <ArrowRight className="text-[13px] transition-transform duration-300 ease-draft group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/signin"
                  className="px-2 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
                >
                  Sign in
                </Link>
                <Link
                  to="/start"
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-10">
        {/* ------------------------------- hero ------------------------------ */}
        <section className="drafting-grid relative -mx-5 px-5 sm:-mx-10 sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: DRAFT_EASE }}
            className="py-20 sm:py-28"
          >
            <p className="edge mb-6">The operating system for small business</p>

            <h1 className="display max-w-[15ch] text-[2.6rem] leading-[0.96] sm:text-[4.4rem]">
              Build the operating system for your business.
            </h1>

            {/* A leader line to an annotation — the vocabulary of the org map,
                introduced on screen one so the language starts here. */}
            <div className="mt-9 flex max-w-2xl items-start gap-4">
              <span aria-hidden className="mt-[10px] flex shrink-0 items-center">
                <span className="h-[6px] w-[6px] bg-ink" />
                <span className="h-px w-10 bg-edgeStrong" />
              </span>
              <p className="text-[16px] leading-relaxed text-ink-2">
                Atlas holds the people, knowledge, tasks and processes that make your company run —
                and draws the lines between them. One place to see who does what, what is late, and
                what would break if somebody left.
              </p>
            </div>

            <div className="mt-11 flex flex-wrap items-center gap-3">
              <Link
                to={signedIn ? '/app' : '/start'}
                className="group inline-flex h-11 items-center gap-2.5 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
              >
                {signedIn ? 'Open your panel' : 'Set up your company'}
                <ArrowRight className="text-[14px] transition-transform duration-300 ease-draft group-hover:translate-x-1" />
              </Link>
              {!signedIn && (
                <Link
                  to="/join"
                  className="inline-flex h-11 items-center rounded-sm border border-edge bg-sheet px-5 text-[14px] font-medium text-ink transition-colors duration-150 ease-draft hover:border-edgeStrong hover:bg-paper"
                >
                  I have an invitation code
                </Link>
              )}
            </div>

            <p className="edge-sm mt-6 text-ink-4">
              Owners get the map · Workers get their day · One source underneath
            </p>
          </motion.div>
        </section>

        {/* ------------------------------ the problem ------------------------ */}
        <Section index="01" label="The problem">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <h2 className="display max-w-[14ch] text-[2rem] leading-[1.03] sm:text-[2.6rem]">
              A business that only runs because you remember everything.
            </h2>
            <div>
              <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
                Small companies do not fail because the work is hard. They stall because the
                knowledge is scattered — across heads, group chats, a whiteboard, and a spreadsheet
                somebody stopped updating in March.
              </p>
              <ul className="mt-8 border-t border-rule">
                {SYMPTOMS.map((symptom) => (
                  <li
                    key={symptom}
                    className="flex items-start gap-3 border-b border-rule py-3.5 text-[14px] leading-snug text-ink-2"
                  >
                    <Warning className="mt-[3px] shrink-0 text-[14px] text-alert" />
                    {symptom}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ---------------------------- capabilities ------------------------- */}
        <Section index="02" label="What Atlas does">
          <h2 className="display max-w-[18ch] text-[2rem] leading-[1.03] sm:text-[2.6rem]">
            Four things, drawn properly.
          </h2>

          <div className="mt-12 grid border-t border-edge sm:grid-cols-2">
            {CAPABILITIES.map((item, index) => (
              <div
                key={item.index}
                className={[
                  'group relative border-b border-edge px-0 py-8 sm:px-7',
                  index % 2 === 0 ? 'sm:border-r sm:border-edge sm:pl-0' : '',
                ].join(' ')}
              >
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-ink-4">{item.index}</span>
                  <item.icon className="text-[20px] text-ink-3" />
                </div>
                <h3 className="title text-[17px] leading-snug">{item.title}</h3>
                <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-3">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </Section>


        {/* ---------------------------- two audiences ------------------------ */}
        <Section index="03" label="Two views, one company">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)]">
            <h2 className="display max-w-[13ch] text-[2rem] leading-[1.03] sm:text-[2.6rem]">
              The boss and the crew need different screens.
            </h2>

            <div className="grid border-t border-edge sm:grid-cols-2">
              {AUDIENCES.map((audience, index) => (
                <div
                  key={audience.title}
                  className={[
                    'border-b border-edge py-7 sm:py-8',
                    index === 0 ? 'sm:border-r sm:border-edge sm:pr-7' : 'sm:pl-7',
                  ].join(' ')}
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="edge-sm">{audience.label}</span>
                    <audience.icon className="text-[19px] text-ink-3" />
                  </div>
                  <h3 className="title text-[16px] leading-snug">{audience.title}</h3>
                  <ul className="mt-4 space-y-2.5">
                    {audience.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-3"
                      >
                        <Check className="mt-[3px] shrink-0 text-[12px] text-ink" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ------------------------------ the rest --------------------------- */}
        <Section index="04" label="Everything else">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display max-w-[16ch] text-[2rem] leading-[1.03] sm:text-[2.6rem]">
              The details that decide whether it gets used.
            </h2>
            <p className="max-w-[38ch] text-[13.5px] leading-relaxed text-ink-3">
              Software gets abandoned in the gaps. These are the gaps.
            </p>
          </div>

          <div className="mt-12 grid border-l border-t border-edge sm:grid-cols-2 lg:grid-cols-3">
            {EXTRAS.map((extra) => (
              <div key={extra.title} className="border-b border-r border-edge p-6">
                <extra.icon className="text-[19px] text-ink-3" />
                <h3 className="title mt-4 text-[14.5px] leading-snug">{extra.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{extra.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------- pricing -------------------------- */}
        <Section index="05" label="Pricing">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display max-w-[15ch] text-[2rem] leading-[1.03] sm:text-[2.6rem]">
              A clear price for a clearer business.
            </h2>
            <p className="max-w-[38ch] text-[13.5px] leading-relaxed text-ink-3">
              Choose the level of support that fits the way your company works today.
            </p>
          </div>

          <div className="mt-12 grid border-l border-t border-edge md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className="flex flex-col border-b border-r border-edge p-6 sm:p-8">
                <p className="edge-sm text-ink-4">{plan.name}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="display text-[2.6rem] leading-none">{plan.price}</span>
                  <span className="text-[13px] text-ink-3">/ month</span>
                </div>
                <p className="mt-5 min-h-[3rem] text-[13.5px] leading-relaxed text-ink-3">
                  {plan.description}
                </p>
                <ul className="mt-7 space-y-3 border-t border-edge pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
                      <Check className="mt-[3px] shrink-0 text-[12px] text-ink" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to={signedIn ? '/app' : '/start'}
                  className="mt-8 inline-flex h-10 items-center justify-center rounded-sm bg-ink px-4 text-[13px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
                >
                  Choose {plan.name}
                </Link>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------ how it works ----------------------- */}
        <Section index="06" label="Getting started">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
            <h2 className="display max-w-[12ch] text-[2rem] leading-[1.03] sm:text-[2.6rem]">
              Running in an afternoon.
            </h2>

            <ol className="border-t border-edge">
              {STEPS.map((step) => (
                <li key={step.index} className="flex gap-6 border-b border-edge py-6">
                  <span className="font-mono text-[11px] leading-[1.6] text-ink-4">
                    {step.index}
                  </span>
                  <div className="min-w-0">
                    <h3 className="title text-[15.5px] leading-snug">{step.title}</h3>
                    <p className="mt-2 max-w-[48ch] text-[13.5px] leading-relaxed text-ink-3">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* ------------------------------ final call ------------------------- */}
        <section className="border-t border-edge py-20 text-center sm:py-28">
          <LogoMark className="mx-auto h-8 w-8 text-ink" />
          <h2 className="display mx-auto mt-7 max-w-[16ch] text-[2rem] leading-[1.03] sm:text-[2.8rem]">
            Stop being the only person who knows.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            {signedIn
              ? 'Your company is already running. Pick up where you left off.'
              : 'Set up your company, invite your first worker, and see the map draw itself.'}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={signedIn ? '/app' : '/start'}
              className="group inline-flex h-11 items-center gap-2.5 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
            >
              {signedIn ? 'Open your panel' : 'Get started'}
              <ArrowRight className="text-[14px] transition-transform duration-300 ease-draft group-hover:translate-x-1" />
            </Link>
            {!signedIn && (
              <Link
                to="/signin"
                className="inline-flex h-11 items-center rounded-sm border border-edge bg-sheet px-5 text-[14px] font-medium text-ink transition-colors duration-150 ease-draft hover:border-edgeStrong hover:bg-paper"
              >
                Sign in
              </Link>
            )}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge py-5">
          <Logo markClassName="h-[18px] w-[18px]" wordClassName="text-[13px]" />
          <p className="edge-sm text-ink-4">Rev. 1.0 · Built to be read, not decoded</p>
        </footer>
      </div>
    </div>
  );
}

/** A numbered sheet division, ruled off like a drawing section. */
function Section({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-edge py-16 sm:py-24">
      <div className="mb-10 flex items-center gap-3">
        <span className="font-mono text-[11px] text-ink-4">{index}</span>
        <span className="h-px w-8 bg-edgeStrong" aria-hidden />
        <span className="edge">{label}</span>
      </div>
      {children}
    </section>
  );
}
