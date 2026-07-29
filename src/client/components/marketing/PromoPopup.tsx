import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone } from '@/components/icons';
import { Button, Modal } from '@/components/ui';
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
  const { loading, isPaidPlan, session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading || isPaidPlan) {
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
  }, [loading, isPaidPlan]);

  if (isPaidPlan) return null;

  const claim = () => {
    setOpen(false);
    navigate(session ? '/app/settings' : '/start');
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      size="sm"
      title={
        <span className="inline-flex items-center gap-2">
          <Megaphone className="text-[15px] text-mark" />
          Limited-time offer
        </span>
      }
      description="Not a standing discount — this code is being pulled once the promotion window closes."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Maybe later
          </Button>
          <Button variant="mark" onClick={claim}>
            {session ? 'Redeem now' : 'Claim my free month'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="edge-sm text-mark">For a limited time only</p>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Use code <CodeChip /> to get a <strong className="text-ink">full month of the
          Growth plan, completely free</strong>. Atlasy, scheduling, the Knowledge Base, and
          reporting — on us, once. It won&apos;t stay available.
        </p>
      </div>
    </Modal>
  );
}
