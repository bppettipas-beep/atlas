import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from '@/components/icons';
import { Button } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { CodeChip } from './PromoBanner';

const FIRST_DELAY_MS = 5_000;
const REPEAT_DELAY_MS = 2 * 60_000;

/**
 * A recurring nag for the ATLAS26 promotion: first appearance 5 seconds
 * after load, then every 2 minutes for as long as the visitor's company has
 * not paid for a plan. Mounted once at the app root so the schedule survives
 * client-side navigation instead of restarting on every page.
 */
export function PromoPopup() {
  const { loading, isPaidPlan, session, account } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hasPaidAccess = isPaidPlan || account?.subscriptionActive === true;

  useEffect(() => {
    if (loading || hasPaidAccess) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    const schedule = (delay: number) => {
      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        setOpen(true);
        schedule(REPEAT_DELAY_MS);
      }, delay);
    };
    schedule(FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [loading, hasPaidAccess]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (hasPaidAccess) return null;

  const claim = () => {
    setOpen(false);
    navigate(session ? '/app/settings' : '/start');
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.button
            type="button"
            aria-label="Close promotion"
            className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-[2px]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          />

          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="atlas26-title"
            initial={reduceMotion ? false : { opacity: 0, y: 34, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[94dvh] w-full max-w-[920px] overflow-y-auto border border-white/25 bg-paper shadow-[0_32px_90px_rgba(0,0,0,0.34)] sm:max-h-[88dvh]"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center border border-ink/15 bg-paper/90 text-ink backdrop-blur-sm transition-colors hover:bg-white active:scale-[0.97]"
              aria-label="Close promotion"
            >
              <X className="text-[15px]" />
            </button>

            <div className="relative md:min-h-[560px]">
              <img
                src="/campaigns/atlas26-growth-promo.jpg"
                alt="Folded operational maps with cobalt routes and a chrome compass"
                width="1536"
                height="1024"
                className="h-[280px] w-full object-cover object-[36%_42%] md:absolute md:inset-0 md:h-full md:object-center"
              />

              <div className="relative bg-paper px-6 py-7 sm:px-8 md:ml-[57%] md:flex md:min-h-[560px] md:flex-col md:bg-transparent md:px-9 md:pb-9 md:pt-14">
                <p className="edge-sm text-mark">Atlas Growth promotion</p>
                <h2
                  id="atlas26-title"
                  className="display mt-4 max-w-[8ch] text-[2.75rem] leading-[0.92] tracking-[-0.045em] text-ink sm:text-[3.35rem]"
                >
                  One month. Zero cost.
                </h2>
                <p className="mt-5 max-w-[30ch] text-[14px] leading-relaxed text-ink-2">
                  Unlock Atlasy, scheduling, knowledge, and reporting with one limited-use code.
                </p>

                <div className="mt-6 flex items-center gap-3 border-y border-ink/15 py-4">
                  <span className="edge-sm text-ink-3">Your code</span>
                  <CodeChip />
                </div>

                <div className="min-h-8 flex-1 md:min-h-14" aria-hidden="true" />

                <Button
                  variant="mark"
                  size="lg"
                  className="w-full justify-between whitespace-nowrap"
                  onClick={claim}
                >
                  {session ? 'Redeem free month' : 'Claim free month'}
                  <ArrowRight className="text-[15px]" />
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full py-2 text-center text-[12px] text-ink-3 transition-colors hover:text-ink"
                >
                  Not right now
                </button>
              </div>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}
