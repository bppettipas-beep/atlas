import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckSquare,
  ShieldCheck,
  TreeStructure,
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

const STEPS = [
  {
    index: '01',
    title: 'Create your company',
    body: 'Your name, your business, and a password. About a minute. You become the owner.',
  },
  {
    index: '02',
    title: 'Invite your people',
    body: 'Generate an invitation code and send it. They join with the code — no licences to assign, no seats to buy.',
  },
  {
    index: '03',
    title: 'Assign the first job',
    body: 'The map draws itself as people arrive. Give someone a task and the whole thing starts working.',
  },
];

export function LandingPage() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingState className="h-screen" label="Loading Atlas" />;
  if (session) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-full bg-paper">
      {/* ============================ title block ============================ */}
      <header className="sticky top-0 z-30 border-b border-edge bg-paper/92 backdrop-blur-[3px]">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-5 py-3 sm:px-10">
          <Logo markClassName="h-[25px] w-[25px]" wordClassName="text-[15px]" />

          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Account">
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
                to="/start"
                className="group inline-flex h-11 items-center gap-2.5 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
              >
                Set up your company
                <ArrowRight className="text-[14px] transition-transform duration-300 ease-draft group-hover:translate-x-1" />
              </Link>
              <Link
                to="/join"
                className="inline-flex h-11 items-center rounded-sm border border-edge bg-sheet px-5 text-[14px] font-medium text-ink transition-colors duration-150 ease-draft hover:border-edgeStrong hover:bg-paper"
              >
                I have an invitation code
              </Link>
            </div>

            <p className="edge-sm mt-6 text-ink-4">
              No credit card · Your data stays in your own database
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

        {/* ------------------------------ how it works ----------------------- */}
        <Section index="03" label="Getting started">
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

        {/* ------------------------------ ownership -------------------------- */}
        <Section index="04" label="Ownership">
          <div className="ticked border border-edge bg-sheet">
            <div className="flex items-center justify-between border-b border-rule px-5 py-2.5 sm:px-7">
              <span className="edge-sm inline-flex items-center gap-2">
                <ShieldCheck className="text-[14px] text-ink-3" />
                Your data
              </span>
              <span className="font-mono text-[11px] text-ink-4">N-01</span>
            </div>
            <div className="grid gap-8 px-5 py-8 sm:grid-cols-2 sm:px-7">
              <div>
                <h3 className="title text-[16px] leading-snug">It lives in your own database.</h3>
                <p className="mt-3 max-w-[44ch] text-[13.5px] leading-relaxed text-ink-3">
                  Atlas runs as one service against one PostgreSQL database that you own. Not a
                  third-party platform holding your company's records hostage behind a per-seat
                  price.
                </p>
              </div>
              <div>
                <h3 className="title text-[16px] leading-snug">Passwords are never stored.</h3>
                <p className="mt-3 max-w-[44ch] text-[13.5px] leading-relaxed text-ink-3">
                  Only a bcrypt hash of them. Sessions are HTTP-only cookies, permissions are
                  enforced on the server rather than merely hidden in the interface, and invitation
                  codes are visible only to owners and managers.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------ final call ------------------------- */}
        <section className="border-t border-edge py-20 text-center sm:py-28">
          <LogoMark className="mx-auto h-8 w-8 text-ink" />
          <h2 className="display mx-auto mt-7 max-w-[16ch] text-[2rem] leading-[1.03] sm:text-[2.8rem]">
            Stop being the only person who knows.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            Set up your company, invite your first worker, and see the map draw itself.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/start"
              className="group inline-flex h-11 items-center gap-2.5 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors duration-150 ease-draft hover:bg-ink-2"
            >
              Get started
              <ArrowRight className="text-[14px] transition-transform duration-300 ease-draft group-hover:translate-x-1" />
            </Link>
            <Link
              to="/signin"
              className="inline-flex h-11 items-center rounded-sm border border-edge bg-sheet px-5 text-[14px] font-medium text-ink transition-colors duration-150 ease-draft hover:border-edgeStrong hover:bg-paper"
            >
              Sign in
            </Link>
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
