import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Megaphone } from '@/components/icons';
import { useToast } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

export const PROMO_CODE = 'ATLAS26';

function CodeChip({ onCopy }: { onCopy?: () => void }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      toast.success('Code copied.');
      window.setTimeout(() => setCopied(false), 1800);
      onCopy?.();
    } catch {
      toast.error('Could not copy. The code is ' + PROMO_CODE + '.');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 border border-mark/40 bg-mark/10 px-2 py-[3px] font-mono text-[12px] font-medium tracking-wide text-mark transition-colors hover:bg-mark/15"
    >
      {PROMO_CODE}
      <Copy className="text-[11px]" />
      <span className="sr-only">{copied ? 'Copied' : 'Copy code'}</span>
    </button>
  );
}

/**
 * Advertises the ATLAS26 signup promotion. Two variants: `marketing` for
 * signed-out visitors (always shown, points at sign-up), and `app` for
 * signed-in owners whose company is not yet on a paid plan (points at
 * Company settings, where the code is actually redeemed). Never rendered for
 * a company already on a paid plan — the promotion is for new business only.
 */
export function PromoBanner({
  variant,
  className,
}: {
  variant: 'marketing' | 'app';
  className?: string;
}) {
  const { session, isOwner, isPaidPlan } = useAuth();

  if (variant === 'app') {
    if (!session || !isOwner || isPaidPlan) return null;
    return (
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-mark/30 bg-mark/5 px-3 py-2 text-[12.5px] text-ink-2 sm:px-4 ${className ?? ''}`}
      >
        <Megaphone className="shrink-0 text-[13px] text-mark" />
        <span>
          Use code <CodeChip /> for a full month of the Growth plan, completely free.
        </span>
        <Link
          to="/app/settings"
          className="ml-auto shrink-0 text-[12.5px] font-medium text-mark hover:underline"
        >
          Redeem in Company settings
        </Link>
      </div>
    );
  }

  if (isPaidPlan) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-mark/30 bg-mark/5 px-4 py-2 text-center text-[12.5px] text-ink-2 ${className ?? ''}`}
    >
      <Megaphone className="shrink-0 text-[13px] text-mark" />
      <span>
        Sign up and use code <CodeChip /> for a full month of the Growth plan, completely free.
      </span>
      {!session && (
        <Link to="/start" className="shrink-0 text-[12.5px] font-medium text-mark hover:underline">
          Set up your company
        </Link>
      )}
    </div>
  );
}
