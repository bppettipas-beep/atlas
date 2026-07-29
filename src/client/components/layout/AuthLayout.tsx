import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { PromoBanner } from '@/components/marketing/PromoBanner';
import { DRAFT_EASE } from '@/components/ui';

/**
 * Shared frame for sign in, owner sign-up and worker join.
 *
 * Composed as a sheet laid on the drafting ground, with a real title block:
 * sheet name on the left, drawing number on the right. It is the same
 * furniture the app itself uses, so signing in already teaches the language.
 */
export function AuthLayout({
  sheet,
  drawingNo,
  title,
  description,
  children,
  footer,
  backTo = '/',
}: {
  /** Sheet name printed in the title block, e.g. "Owner sign-up". */
  sheet: string;
  /** Drawing number printed on the right of the title block, e.g. "A-01". */
  drawingNo: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  backTo?: string;
}) {
  return (
    <div className="drafting-grid min-h-full">
      <PromoBanner variant="marketing" />
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 flex items-center justify-between">
          <Link
            to={backTo}
            className="edge-sm inline-flex items-center gap-1.5 py-1 text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft className="text-[12px]" />
            Back
          </Link>
          <Logo markClassName="h-5 w-5" wordClassName="text-[13px]" />
        </header>

        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: DRAFT_EASE }}
          className="ticked flex flex-1 flex-col border border-edge bg-sheet"
        >
          {/* ------------------------- title block ------------------------- */}
          <div className="flex items-center justify-between border-b border-rule px-6 py-2.5">
            <span className="edge-sm">{sheet}</span>
            <span className="font-mono text-[11px] text-ink-4">{drawingNo}</span>
          </div>

          <div className="flex flex-1 flex-col px-6 py-8 sm:px-8">
            <h1 className="display text-[28px] leading-[1.05]">{title}</h1>
            {description && (
              <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-3">
                {description}
              </p>
            )}
            <div className="mt-8 flex-1">{children}</div>
          </div>

          {footer && (
            <div className="border-t border-rule bg-paper px-6 py-3.5 text-center text-[12.5px] text-ink-3 sm:px-8">
              {footer}
            </div>
          )}
        </motion.main>
      </div>
    </div>
  );
}
