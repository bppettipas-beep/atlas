import { motion } from 'framer-motion';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building, HardHat } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { DRAFT_EASE, LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

const PATHS = [
  {
    to: '/signup/owner',
    index: '01',
    icon: Building,
    title: 'I own or manage a business',
    description:
      'Create your company, map who does what, and see everything that is due, late or blocked in one place.',
  },
  {
    to: '/join',
    index: '02',
    icon: HardHat,
    title: 'I work for a business',
    description:
      'Join with the invitation code your manager gave you. Atlas shows you exactly what to do today.',
  },
];

/**
 * The first screen is drawn as the cover sheet of a drawing set: a title block
 * at the top, the drawing itself in the middle, a revision note at the foot.
 */
export function LandingPage() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingState className="h-screen" label="Loading Atlas" />;
  if (session) return <Navigate to="/app" replace />;

  return (
    <div className="drafting-grid relative min-h-full">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1080px] flex-col px-5 sm:px-10">
        {/* ---------------------------- title block --------------------------- */}
        <header className="flex items-center justify-between border-b border-edge py-4">
          <Logo markClassName="h-[26px] w-[26px]" wordClassName="text-[15px]" />
          <div className="flex items-center gap-5">
            <span className="edge-sm hidden sm:block">Rev. 1.0</span>
            <Link
              to="/signin"
              className="text-[13px] font-medium text-ink-2 underline decoration-edge underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            >
              Sign in
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center py-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: DRAFT_EASE }}
            className="relative"
          >
            <p className="edge mb-5">The operating system for small business</p>

            <h1 className="display max-w-[16ch] text-[2.6rem] leading-[0.98] sm:text-[4.2rem]">
              Build the operating system for your business.
            </h1>

            {/* A leader line to an annotation — the vocabulary of the org map,
                introduced here so the product's language starts on screen one. */}
            <div className="mt-8 flex max-w-xl items-start gap-4">
              <span aria-hidden className="mt-[9px] flex shrink-0 items-center">
                <span className="h-[6px] w-[6px] bg-ink" />
                <span className="h-px w-10 bg-edgeStrong" />
              </span>
              <p className="text-[15px] leading-relaxed text-ink-2">
                Atlas holds the people, knowledge, tasks and processes that make your company run —
                and draws the lines between them.
              </p>
            </div>
          </motion.div>

          {/* ------------------------------ the two paths --------------------- */}
          <div className="mt-16 grid border-t border-edge sm:grid-cols-2">
            {PATHS.map((path, index) => (
              <motion.div
                key={path.to}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.14 + index * 0.09, ease: DRAFT_EASE }}
                className={index === 0 ? 'sm:border-r sm:border-edge' : ''}
              >
                <Link
                  to={path.to}
                  className="group relative flex h-full flex-col border-b border-edge px-1 py-7 transition-colors duration-200 hover:bg-sheet sm:border-b-0 sm:px-7"
                >
                  {/* The rule above the card fills with ink on hover — the
                      whole hover state, no lift and no shadow. */}
                  <span
                    aria-hidden
                    className="absolute -top-px left-0 h-[2px] w-0 bg-ink transition-[width] duration-500 ease-draft group-hover:w-full"
                  />
                  <div className="mb-6 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-ink-4">{path.index}</span>
                    <path.icon className="text-[20px] text-ink-3 transition-colors group-hover:text-ink" />
                  </div>
                  <h2 className="title text-[17px] leading-snug">{path.title}</h2>
                  <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-3">
                    {path.description}
                  </p>
                  <span className="edge mt-7 inline-flex items-center gap-2 text-ink transition-colors">
                    Continue
                    <ArrowRight className="text-[13px] transition-transform duration-300 ease-draft group-hover:translate-x-1" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge py-4">
          <p className="edge-sm">Your data lives in your own PostgreSQL database</p>
          <p className="text-[12px] text-ink-3">
            Already have an account?{' '}
            <Link
              to="/signin"
              className="font-medium text-ink underline decoration-edge underline-offset-4 hover:decoration-ink"
            >
              Sign in
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
