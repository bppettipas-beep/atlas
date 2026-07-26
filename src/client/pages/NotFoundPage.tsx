import { Link } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons';
import { LogoMark } from '@/components/Logo';
import { useAuth } from '@/providers/AuthProvider';

export function NotFoundPage() {
  const { session } = useAuth();
  const home = session ? '/app' : '/';

  return (
    <div className="drafting-grid flex min-h-full items-center justify-center px-5 py-16">
      <div className="ticked w-full max-w-md border border-edge bg-sheet">
        <div className="flex items-center justify-between border-b border-rule px-5 py-2.5">
          <span className="edge-sm inline-flex items-center gap-2">
            <LogoMark className="h-4 w-4 text-ink-3" />
            Sheet not found
          </span>
          <span className="font-mono text-[11px] text-ink-4">404</span>
        </div>
        <div className="px-5 py-8">
          <h1 className="display text-[30px] leading-none">Nothing drawn here.</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-3">
            That page does not exist, or it belonged to a company you are no longer part of.
          </p>
          <Link
            to={home}
            className="edge mt-7 inline-flex items-center gap-2 text-ink transition-colors hover:text-mark"
          >
            <ArrowLeft className="text-[13px]" />
            Back to {session ? 'your workspace' : 'the start'}
          </Link>
        </div>
      </div>
    </div>
  );
}
