import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/icons';
import { Logo, LogoMark } from '@/components/Logo';
import { DRAFT_EASE, LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

const MARKETING_TABS = [
  ['problem', 'Problem'],
  ['product', 'Product'],
  ['roles', 'Teams'],
  ['details', 'Details'],
  ['pricing', 'Pricing'],
  ['getting-started', 'Start'],
] as const;

const EXPLORE_CARDS = [
  ['01', 'Problem', 'The operating gaps Atlas is built to remove.', 'problem'],
  ['02', 'Product', 'One connected place for people, work, schedules, and knowledge.', 'product'],
  ['03', 'Teams', 'Focused views and permissions for every role in the company.', 'roles'],
  ['04', 'Details', 'The practical touches that make daily operations actually stick.', 'details'],
  ['05', 'Pricing', 'Simple plans with the room and operational tools to grow.', 'pricing'],
  ['06', 'Getting started', 'From a blank company to useful work in a few clear steps.', 'getting-started'],
] as const;

export function LandingPage() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingState className="h-screen" label="Loading Atlas" />;
  const signedIn = Boolean(session);
  const primaryHref = signedIn ? '/app' : '/start';

  return (
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-30 border-b border-edge bg-paper/92 backdrop-blur-[3px]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-y-2 px-5 py-3 sm:px-10">
          <Logo markClassName="h-[25px] w-[25px]" wordClassName="text-[15px]" />
          <nav
            className="order-3 flex w-full gap-1 overflow-x-auto pb-0.5 md:order-none md:w-auto md:overflow-visible"
            aria-label="Explore Atlas"
          >
            {MARKETING_TABS.map(([section, label]) => (
              <Link
                key={section}
                to={`/explore/${section}`}
                className="shrink-0 border-b border-transparent px-2 py-1.5 text-[12px] font-medium text-ink-3 transition-colors hover:border-ink hover:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Account">
            {signedIn ? (
              <Link
                to="/app"
                className="group inline-flex h-8 items-center gap-2 rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-2"
              >
                Open panel <ArrowRight className="text-[13px] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <>
                <Link to="/signin" className="px-2 py-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
                  Sign in
                </Link>
                <Link to="/start" className="inline-flex h-8 items-center rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white hover:bg-ink-2">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-5 sm:px-10">
        <section className="drafting-grid relative -mx-5 border-b border-edge px-5 sm:-mx-10 sm:px-10">
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
            <div className="mt-9 flex max-w-2xl items-start gap-4">
              <span aria-hidden className="mt-[10px] flex shrink-0 items-center">
                <span className="h-[6px] w-[6px] bg-ink" />
                <span className="h-px w-10 bg-edgeStrong" />
              </span>
              <p className="text-[16px] leading-relaxed text-ink-2">
                Atlas holds the people, knowledge, tasks, and processes that make your company run.
                See the moving parts clearly, then explore the parts that matter to you.
              </p>
            </div>
            <div className="mt-11 flex flex-wrap items-center gap-3">
              <Link to={primaryHref} className="group inline-flex h-11 items-center gap-2.5 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors hover:bg-ink-2">
                {signedIn ? 'Open your panel' : 'Set up your company'}
                <ArrowRight className="text-[14px] transition-transform group-hover:translate-x-1" />
              </Link>
              {!signedIn && (
                <Link to="/join" className="inline-flex h-11 items-center rounded-sm border border-edge bg-sheet px-5 text-[14px] font-medium text-ink hover:border-edgeStrong hover:bg-paper">
                  I have an invitation code
                </Link>
              )}
            </div>
          </motion.div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="edge">Explore Atlas</p>
              <h2 className="display mt-4 max-w-[18ch] text-[2rem] leading-[1.03] sm:text-[2.8rem]">
                Start with the question you need answered.
              </h2>
            </div>
            <p className="max-w-[38ch] text-[14px] leading-relaxed text-ink-3">
              The overview stays intentionally light. Each section has its own page when you want the full story.
            </p>
          </div>

          <div className="mt-12 grid border-l border-t border-edge sm:grid-cols-2 lg:grid-cols-3">
            {EXPLORE_CARDS.map(([index, title, body, section]) => (
              <Link
                key={section}
                to={`/explore/${section}`}
                className="group flex min-h-[190px] flex-col border-b border-r border-edge p-6 transition-colors hover:bg-sheet sm:p-7"
              >
                <span className="font-mono text-[11px] text-ink-4">{index}</span>
                <h3 className="title mt-auto pt-9 text-[19px]">{title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{body}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 group-hover:text-ink">
                  Explore <ArrowRight className="text-[12px] transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-t border-edge py-20 text-center sm:py-28">
          <LogoMark className="mx-auto h-8 w-8 text-ink" />
          <h2 className="display mx-auto mt-7 max-w-[16ch] text-[2rem] leading-[1.03] sm:text-[2.8rem]">
            Stop being the only person who knows.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            {signedIn ? 'Your company is already running. Pick up where you left off.' : 'Set up your company, invite your first worker, and let Atlas make the work visible.'}
          </p>
          <Link to={primaryHref} className="group mt-9 inline-flex h-11 items-center gap-2.5 rounded-sm bg-ink px-5 text-[14px] font-medium text-white transition-colors hover:bg-ink-2">
            {signedIn ? 'Open your panel' : 'Get started'}
            <ArrowRight className="text-[14px] transition-transform group-hover:translate-x-1" />
          </Link>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge py-5">
          <Logo markClassName="h-[18px] w-[18px]" wordClassName="text-[13px]" />
          <p className="edge-sm text-ink-4">Rev. 1.0 · Built to be read, not decoded</p>
        </footer>
      </main>
    </div>
  );
}
