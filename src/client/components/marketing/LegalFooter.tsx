import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

export function LegalFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-edge py-5">
      <Logo markClassName="h-[18px] w-[18px]" wordClassName="text-[13px]" />
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3" aria-label="Legal">
        <Link to="/legal/privacy" className="transition-colors hover:text-ink">Privacy</Link>
        <Link to="/legal/terms" className="transition-colors hover:text-ink">Terms</Link>
        <Link to="/legal/cookies" className="transition-colors hover:text-ink">Cookies</Link>
      </nav>
      <p className="edge-sm text-ink-4">© {new Date().getFullYear()} Atlas</p>
    </footer>
  );
}
