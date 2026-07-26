import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Google's "G", drawn to their brand guidelines.
 *
 * This is the one place the schematic sheet gives up its black and white. The
 * mark belongs to Google and their terms do not allow recolouring it, and a
 * recognisable G is the whole reason the button is trusted at a glance.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={cn('shrink-0', className)} aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Whether this Atlas instance has Google credentials configured.
 *
 * Returns `null` while unknown so callers can render nothing rather than
 * flashing a button that may be about to disappear. A button that cannot work
 * is worse than no button, so it is never shown on a hunch.
 */
export function useGoogleEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ google: boolean }>('/auth/config')
      .then((config) => {
        if (!cancelled) setEnabled(config.google);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

/**
 * Starts the Google round trip.
 *
 * A plain link, not a fetch: the browser has to navigate to Google and come
 * back, and the server needs to set the state cookie on the way out.
 */
export function GoogleButton({
  intent,
  code,
  label = 'Continue with Google',
  className,
}: {
  intent: 'signin' | 'signup' | 'join';
  /** Invitation code to carry through the round trip, for the join flow. */
  code?: string;
  label?: string;
  className?: string;
}) {
  const params = new URLSearchParams({ intent });
  if (code) params.set('code', code);

  return (
    <a
      href={`/api/auth/google/start?${params.toString()}`}
      className={cn(
        'inline-flex h-10 w-full select-none items-center justify-center gap-2.5 rounded-sm',
        'border border-edge bg-sheet text-[14px] font-medium text-ink',
        'transition-colors duration-150 ease-draft hover:border-edgeStrong hover:bg-paper',
        className,
      )}
    >
      <GoogleMark className="h-[17px] w-[17px]" />
      {label}
    </a>
  );
}

/** A ruled "or" divider, in the language of the rest of the sheet. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-rule" />
      <span className="edge-sm text-ink-4">{label}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

export interface GoogleGrant {
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Loads the Google profile waiting to become an account.
 *
 * The sign-up screens call this when they arrive back with `?google=1`. If the
 * grant has expired the person simply fills the form in by hand, so a failure
 * here is not an error worth showing.
 */
export function useGoogleGrant(active: boolean): { grant: GoogleGrant | null; loading: boolean } {
  const [grant, setGrant] = useState<GoogleGrant | null>(null);
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    if (!active) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<GoogleGrant>('/auth/google/grant')
      .then((value) => {
        if (!cancelled) setGrant(value);
      })
      .catch(() => {
        if (!cancelled) setGrant(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { grant, loading };
}

/** Shows whose Google account is about to become an Atlas account. */
export function GoogleIdentityCard({ grant }: { grant: GoogleGrant }) {
  return (
    <div className="flex items-center gap-3 border border-edge bg-paper px-3 py-2.5">
      {grant.avatarUrl ? (
        <img
          src={grant.avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-sm object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <GoogleMark className="h-5 w-5" />
      )}
      <div className="min-w-0 flex-1">
        <p className="title truncate text-[13px] leading-tight">{grant.fullName}</p>
        <p className="truncate text-[11.5px] leading-tight text-ink-3">{grant.email}</p>
      </div>
      <span className="edge-sm shrink-0 text-ink-4">via Google</span>
    </div>
  );
}
