import { motion } from 'framer-motion';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building, HardHat } from '@/components/icons';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { DRAFT_EASE, LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

const PATHS = [
  {
    to: '/signup/owner',
    index: '01',
    icon: Building,
    title: 'I own or manage a business',
    description:
      'Creates only your Atlas account. You will choose a plan before setting up a business panel.',
    action: 'Create my account',
  },
  {
    to: '/join',
    index: '02',
    icon: HardHat,
    title: 'I work for a business',
    description:
      'Joins a company that already uses Atlas. You will need the invitation code your manager gave you.',
    action: 'Enter my invitation code',
  },
];

/**
 * The fork in the road.
 *
 * Owners and workers need different things from their first minute — one is
 * creating a company, the other is joining one — and asking which of the two
 * they are is far kinder than a single form that half applies to everybody.
 */
export function StartPage() {
  const { account, loading } = useAuth();

  if (loading) return <LoadingState className="h-screen" label="Loading Atlas" />;
  if (account) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      sheet="Get started"
      drawingNo="A-02"
      title="Which one are you?"
      description="This decides what the next screen asks you for. Nothing is created yet."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/signin"
            className="font-medium text-ink underline decoration-edge underline-offset-4 hover:decoration-ink"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="grid border-t border-edge">
        {PATHS.map((path, index) => (
          <motion.div
            key={path.to}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 + index * 0.08, ease: DRAFT_EASE }}
          >
            <Link
              to={path.to}
              className="group relative flex flex-col border-b border-edge py-6 transition-colors duration-200 hover:bg-paper"
            >
              {/* The rule above fills with ink on hover. That is the whole
                  hover state — no lift, no shadow. */}
              <span
                aria-hidden
                className="absolute -top-px left-0 h-[2px] w-0 bg-ink transition-[width] duration-500 ease-draft group-hover:w-full"
              />
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[11px] text-ink-4">{path.index}</span>
                <path.icon className="text-[19px] text-ink-3 transition-colors group-hover:text-ink" />
              </div>
              <h2 className="title text-[16px] leading-snug">{path.title}</h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3">{path.description}</p>
              <span className="edge mt-5 inline-flex items-center gap-2 text-ink">
                {path.action}
                <ArrowRight className="text-[13px] transition-transform duration-300 ease-draft group-hover:translate-x-1" />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </AuthLayout>
  );
}
