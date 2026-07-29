import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/icons';
import { MarketingFooter, MarketingHeader } from '@/components/marketing/MarketingChrome';
import { LogoMark } from '@/components/Logo';
import { DRAFT_EASE, LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

/**
 * The six questions in PRODUCT.md, and the part of Atlas that answers each.
 * Every one of these is a screen that exists — this is a contents page for the
 * product, not a list of aspirations.
 */
const QUESTIONS = [
  ['Who works here?', 'People'],
  ['What is each person carrying right now?', 'People · My Day'],
  ['How do people, teams and responsibilities connect?', 'Organization map'],
  ['What is due, blocked, late or finished?', 'Work'],
  ['Who is doing what, and when?', 'Schedule'],
  ['What changed in the company, and who changed it?', 'Activity'],
] as const;

const SHEETS = [
  ['01', 'Problem', 'The operating gaps Atlas is built to remove.', 'problem'],
  ['02', 'Product', 'One connected place for people, work, schedules and knowledge.', 'product'],
  ['03', 'Teams', 'Focused views and permissions for every role in the company.', 'roles'],
  ['04', 'Details', 'The practical touches that make daily operations stick.', 'details'],
  ['05', 'Pricing', 'Four plans, priced by the size of your company.', 'pricing'],
  [
    '06',
    'Getting started',
    'From a blank company to useful work in an afternoon.',
    'getting-started',
  ],
] as const;

export function LandingPage() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingState className="h-screen" label="Loading Atlas" />;
  const signedIn = Boolean(session);
  const primaryHref = signedIn ? '/app' : '/start';

  return (
    <div className="sheet-set min-h-full bg-paper">
      <MarketingHeader />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="drafting-grid border-b border-edge">
          <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: DRAFT_EASE }}
              className="ticked relative border-x border-edge bg-paper/40 px-5 py-20 sm:px-10 sm:py-28"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-ink-2">SHEET 00</span>
                <span aria-hidden className="h-px w-8 bg-edgeStrong" />
                <p className="edge-sm">The operating system for a small business</p>
              </div>

              {/* Not "Stop running the company from memory" — that is sheet 01's
                  headline, and repeating it here would also rhyme with the
                  closing "Stop being the only person who knows." */}
              <h1 className="display mt-8 max-w-[13ch] text-[2.9rem] leading-[0.93] sm:text-[5.4rem]">
                Build the operating system for your business.
              </h1>

              <div className="mt-10 flex max-w-[62ch] items-start gap-4">
                <span aria-hidden className="mt-[11px] flex shrink-0 items-center">
                  <span className="h-[7px] w-[7px] bg-ink" />
                  <span className="h-px w-12 bg-edgeStrong" />
                </span>
                <p className="text-[16.5px] leading-relaxed text-ink-2">
                  Atlas holds the people, knowledge, tasks and processes that make your company run
                  — and draws the structure connecting them, so nobody has to keep it in their head.
                </p>
              </div>

              <div className="mt-12 flex flex-wrap items-center gap-3">
                <Link
                  to={primaryHref}
                  className="group inline-flex h-12 items-center gap-2.5 rounded-sm bg-ink px-6 text-[14.5px] font-medium text-white transition-colors hover:bg-ink-2"
                >
                  {signedIn ? 'Open your panel' : 'Set up your company'}
                  <ArrowRight className="text-[14px] transition-transform duration-200 ease-draft group-hover:translate-x-1" />
                </Link>
                {!signedIn && (
                  <Link
                    to="/join"
                    className="inline-flex h-12 items-center rounded-sm border border-edge bg-sheet px-6 text-[14.5px] font-medium text-ink transition-colors hover:border-edgeStrong hover:bg-paper"
                  >
                    I have an invitation code
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ------------------------------------------------- the six questions */}
        <section className="border-b border-edge">
          <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
              <div className="border-b border-edge py-14 pr-8 lg:border-b-0 lg:border-r lg:py-20">
                <h2 className="display max-w-[14ch] text-[2rem] leading-[1.02] sm:text-[2.7rem]">
                  Six questions an owner asks every week.
                </h2>
                <p className="mt-6 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-2">
                  Right now they get answered by messaging somebody and waiting. Each one has a
                  screen in Atlas that already knows.
                </p>
              </div>

              <ol className="lg:pl-10">
                {QUESTIONS.map(([question, answer], index) => (
                  <li
                    key={question}
                    className="group flex items-baseline gap-5 border-b border-rule py-5 last:border-b-0"
                  >
                    <span className="font-mono text-[11px] text-ink-2">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-[15px] leading-snug text-ink-2">{question}</span>
                    <span className="edge-sm shrink-0 text-ink">{answer}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- the negative print */}
        <section className="negative drafting-grid-negative border-b border-ink">
          <div className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
            <div className="ticked ticked-negative relative border border-white/15 p-6 sm:p-12">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-white/45">WHY IT HOLDS TOGETHER</span>
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

              <h2 className="display mt-8 max-w-[19ch] text-[2.1rem] leading-[1.0] sm:text-[3.4rem]">
                The org chart is not a document. It is the work.
              </h2>

              <div className="mt-10 grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
                <p className="text-[16px] leading-relaxed text-white/75">
                  Most tools give you a task list with an org chart bolted on, and the chart is
                  stale within a month because somebody has to remember to update it. In Atlas the
                  reporting lines, teams and ownership are{' '}
                  <em className="not-italic text-white">derived</em> from the tasks, profiles and
                  documents you were already keeping. There is nothing separate to maintain, so
                  there is nothing separate to forget.
                </p>

                <dl className="grid grid-cols-2 gap-x-8 gap-y-8 self-start">
                  {[
                    ['Sources of truth', '1', 'PostgreSQL. Yours to back up.'],
                    ['Places to update the chart', '0', 'It is drawn from the work.'],
                  ].map(([label, figure, note]) => (
                    <div key={label} className="figure-rule">
                      <p className="edge-sm">{label}</p>
                      <p className="mt-2 font-mono text-[2.6rem] font-light leading-none text-white">
                        {figure}
                      </p>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-white/60">{note}</p>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- the sheet set */}
        <section className="border-b border-edge">
          <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
            <div className="ruled-head">
              <h2 className="title text-[13px] uppercase tracking-[0.12em] text-ink-2">Contents</h2>
            </div>

            <ul className="mt-8">
              {SHEETS.map(([index, title, body, section]) => (
                <li key={section}>
                  <Link
                    to={`/explore/${section}`}
                    className="group grid items-baseline gap-x-6 gap-y-2 border-b border-rule py-6 transition-colors hover:bg-sheet sm:grid-cols-[4.5rem_minmax(0,11rem)_1fr_auto] sm:py-7"
                  >
                    <span className="font-mono text-[1.6rem] font-light leading-none text-ink-3 transition-colors group-hover:text-mark sm:text-[2rem]">
                      {index}
                    </span>
                    <span className="title text-[19px] sm:text-[21px]">{title}</span>
                    <span className="text-[14px] leading-relaxed text-ink-2">{body}</span>
                    <span className="hidden text-ink-3 transition-all duration-200 ease-draft group-hover:translate-x-1 group-hover:text-ink sm:block">
                      <ArrowRight className="text-[16px]" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- close */}
        <section className="border-b border-edge">
          <div className="mx-auto w-full max-w-[1180px] px-5 py-20 text-center sm:px-8 sm:py-28">
            <LogoMark className="mx-auto h-9 w-9 text-ink" />
            <h2 className="display mx-auto mt-8 max-w-[17ch] text-[2.1rem] leading-[1.0] sm:text-[3.2rem]">
              Stop being the only person who knows.
            </h2>
            <p className="mx-auto mt-6 max-w-[48ch] text-[15.5px] leading-relaxed text-ink-2">
              {signedIn
                ? 'Your company is already running. Pick up where you left off.'
                : 'Set up your company, invite your first worker, and let Atlas make the work visible.'}
            </p>
            <Link
              to={primaryHref}
              className="group mt-10 inline-flex h-12 items-center gap-2.5 rounded-sm bg-ink px-6 text-[14.5px] font-medium text-white transition-colors hover:bg-ink-2"
            >
              {signedIn ? 'Open your panel' : 'Get started'}
              <ArrowRight className="text-[14px] transition-transform duration-200 ease-draft group-hover:translate-x-1" />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter sheet="ATL-00" title="Overview" />
    </div>
  );
}
