import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { DRAFT_EASE } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

/**
 * The marketing sheet set, in reading order.
 *
 * The numbers are not decoration: these pages are an argument that runs in
 * sequence, and a drawing set numbers its sheets for the same reason. This is
 * the same rule the app sidebar follows.
 */
export const MARKETING_TABS = [
  ['problem', 'Problem'],
  ['product', 'Product'],
  ['roles', 'Teams'],
  ['details', 'Details'],
  ['pricing', 'Pricing'],
  ['getting-started', 'Start'],
] as const;

export type MarketingSection = (typeof MARKETING_TABS)[number][0];

/**
 * One header for every marketing page. Both pages used to carry their own copy
 * of this, which had already drifted apart on padding and backdrop.
 */
export function MarketingHeader({ current }: { current?: string }) {
  const { session } = useAuth();

  return (
    <header className="bg-paper/92 sticky top-0 z-30 border-b border-edge backdrop-blur-[3px]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-y-2 px-5 py-3 sm:px-8">
        <Link to="/" aria-label="Atlas home" className="shrink-0">
          <Logo markClassName="h-[25px] w-[25px]" wordClassName="text-[15px]" />
        </Link>

        <nav
          className="order-3 flex w-full gap-0.5 overflow-x-auto pb-0.5 md:order-none md:w-auto md:overflow-visible"
          aria-label="Explore Atlas"
        >
          {MARKETING_TABS.map(([section, label], index) => {
            const active = section === current;
            return (
              <Link
                key={section}
                to={`/explore/${section}`}
                aria-current={active ? 'page' : undefined}
                className="group relative shrink-0 px-2.5 py-2 transition-colors"
              >
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={`font-mono text-[10px] transition-colors ${
                      active ? 'text-mark' : 'text-ink-2 group-hover:text-ink'
                    }`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`text-[12.5px] font-medium transition-colors ${
                      active ? 'text-ink' : 'text-ink-2 group-hover:text-ink'
                    }`}
                  >
                    {label}
                  </span>
                </span>
                {/* The underline draws from zero on the one curve the
                    interface uses, rather than fading in. */}
                {active ? (
                  <motion.span
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.32, ease: DRAFT_EASE }}
                    style={{ originX: 0 }}
                    className="absolute inset-x-2.5 bottom-0 h-[2px] bg-ink"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 bottom-0 h-px origin-left scale-x-0 bg-edgeStrong transition-transform duration-200 ease-draft group-hover:scale-x-100"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Account">
          {session ? (
            <Link
              to="/app"
              className="group inline-flex h-8 items-center gap-2 rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-2"
            >
              Open panel
              <ArrowRight className="text-[13px] transition-transform duration-200 ease-draft group-hover:translate-x-0.5" />
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
                className="inline-flex h-8 items-center rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-2"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * The title block. A drawing carries its identification in the bottom corner,
 * and so does every sheet in this set.
 */
export function MarketingFooter({ sheet, title }: { sheet: string; title: string }) {
  return (
    <footer className="mx-auto w-full max-w-[1180px] px-5 pb-10 sm:px-8">
      <div className="grid border-l border-t border-edge sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="border-b border-r border-edge p-5">
          <Logo markClassName="h-[18px] w-[18px]" wordClassName="text-[13px]" />
          <p className="mt-2.5 max-w-[34ch] text-[12.5px] leading-relaxed text-ink-2">
            The operating system for a small business — people, work, knowledge and schedule in one
            connected record.
          </p>
        </div>
        <div className="border-b border-r border-edge p-5">
          <p className="edge-sm">Sheet</p>
          <p className="mt-2 font-mono text-[13px] text-ink-2">{sheet}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">{title}</p>
        </div>
        <div className="border-b border-r border-edge p-5">
          <p className="edge-sm">Revision</p>
          <p className="mt-2 font-mono text-[13px] text-ink-2">1.0</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">Built to be read, not decoded</p>
        </div>
      </div>
    </footer>
  );
}
