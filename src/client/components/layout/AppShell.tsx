import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NotificationCenter } from './NotificationCenter';
import { AtlasyButton, AtlasyPanel } from '@/components/assistant/AtlasyPanel';
import { LogoMark } from '@/components/Logo';
import {
  Activity,
  BookOpen,
  Building,
  Chat,
  Calendar,
  CaretUpDown,
  CheckSquare,
  Envelope,
  Gear,
  House,
  List,
  SignOut,
  SunHorizon,
  TreeStructure,
  User,
  Users,
  X,
} from '@/components/icons';
import {
  Avatar,
  DRAFT_EASE,
  Menu,
  MenuDivider,
  MenuItem,
  MenuLabel,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtime } from '@/providers/RealtimeProvider';

interface NavItem {
  to: string;
  label: string;
  icon: typeof House;
}

/**
 * Two navigations, not one with things hidden. An owner is running a company;
 * a worker is running a shift. Giving the worker a trimmed owner dashboard is
 * the mistake this split exists to avoid.
 */
const OWNER_NAV: NavItem[] = [
  { to: '/app/home', label: 'Home', icon: House },
  { to: '/app/organization', label: 'Organization map', icon: TreeStructure },
  { to: '/app/people', label: 'People', icon: Users },
  { to: '/app/chat', label: 'Chat', icon: Chat },
  { to: '/app/work', label: 'Work', icon: CheckSquare },
  { to: '/app/schedule', label: 'Schedule', icon: Calendar },
  { to: '/app/knowledge', label: 'Knowledge base', icon: BookOpen },
  { to: '/app/activity', label: 'Activity', icon: Activity },
  { to: '/app/invitations', label: 'Invitations', icon: Envelope },
  { to: '/app/settings', label: 'Company settings', icon: Building },
];

const WORKER_NAV: NavItem[] = [
  { to: '/app/my-day', label: 'My day', icon: SunHorizon },
  { to: '/app/work', label: 'My work', icon: CheckSquare },
  { to: '/app/schedule', label: 'Schedule', icon: Calendar },
  { to: '/app/organization', label: 'Company map', icon: TreeStructure },
  { to: '/app/people', label: 'People', icon: Users },
  { to: '/app/chat', label: 'Chat', icon: Chat },
  { to: '/app/knowledge', label: 'Knowledge base', icon: BookOpen },
  { to: '/app/activity', label: 'Activity', icon: Activity },
];

export function AppShell() {
  const { session, signOut, isLeadership, switchCompany } = useAuth();
  const { connected } = useRealtime();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarTransitioning, setSidebarTransitioning] = useState(false);
  const [atlasyOpen, setAtlasyOpen] = useState(false);

  if (!session) return null;

  const items = isLeadership ? OWNER_NAV : WORKER_NAV;
  // Schedule is a working board, not another document in the app. It earns the
  // whole canvas; navigation remains one click away as an overlay.
  const scheduleMode = location.pathname === '/app/schedule';

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const handleNavigation = () => {
    // Desktop hands the Schedule overlay straight to the destination sidebar.
    // Running its exit animation first is what created the visual "pop".
    // Phones retain the normal close-after-navigation behaviour because the
    // navigation is modal there.
    if (scheduleMode && window.innerWidth >= 1024) {
      setSidebarTransitioning(true);
      setMobileOpen(false);
      return;
    }
    setMobileOpen(false);
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-sheet">
      {/* ---------------------------- title block --------------------------- */}
      <div className="relative border-b border-rule px-4 py-4">
        {/* The connection light sits in the corner rather than in the stack, so
            it cannot pull the centred mark and company name off axis. */}
        <span
          title={connected ? 'Live updates connected' : 'Reconnecting'}
          className={cn(
            'absolute right-3 top-3 h-[6px] w-[6px] transition-colors duration-300',
            connected ? 'bg-done' : 'bg-edgeStrong',
          )}
        />
        <span className="sr-only" role="status">
          {connected ? 'Live updates connected' : 'Live updates reconnecting'}
        </span>

        {/* Mark only — the company name below is the label that matters here,
            and the product name does not need repeating on every screen. The
            mark goes back out to the public page, the way a masthead does. */}
        <div className="flex flex-col items-center">
          <Link
            to="/"
            aria-label="Atlas home"
            className="rounded-sm text-ink transition-colors duration-150 ease-draft hover:text-ink-3"
          >
            <LogoMark className="h-6 w-6" />
          </Link>
          <p
            className="edge-sm mt-2.5 max-w-full truncate text-center"
            title={session.company.name}
          >
            {session.company.name}
          </p>
        </div>
      </div>

      {/* ---------------------------- navigation ---------------------------- */}
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto py-2">
        {items.map((item, index) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={handleNavigation}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 py-[7px] pl-4 pr-3 text-[13px]',
                'transition-colors duration-150 ease-draft',
                isActive ? 'text-ink' : 'text-ink-2 hover:bg-paper hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* The nav mark draws in — the product's one authored motion. */}
                {isActive && (
                  <motion.span
                    layoutId="atlas-nav-mark"
                    className="absolute left-0 top-0 h-full w-[3px] bg-ink"
                    transition={{ duration: 0.3, ease: DRAFT_EASE }}
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    'w-[18px] shrink-0 font-mono text-[10px] leading-none',
                    isActive ? 'text-ink-3' : 'text-ink-4',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <item.icon
                  className={cn(
                    'shrink-0 text-[16px] transition-colors',
                    isActive ? 'text-ink' : 'text-ink-4 group-hover:text-ink-2',
                  )}
                />
                <span className={cn('truncate', isActive && 'font-medium')}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ---------------------- current user, bottom left -------------------- */}
      <div className="border-t border-rule p-2">
        <Menu
          align="left"
          side="top"
          trigger={({ toggle, open }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="menu"
              className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-paper"
            >
              <Avatar name={session.user.fullName} src={session.user.avatarUrl} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {session.user.fullName}
                </span>
                <span className="edge-sm mt-0.5 block truncate">{session.membership.role}</span>
              </span>
              <CaretUpDown className="shrink-0 text-[13px] text-ink-4" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={<User />}
                onClick={() => {
                  close();
                  navigate('/app/profile');
                }}
              >
                Profile
              </MenuItem>
              <MenuItem
                icon={<Gear />}
                onClick={() => {
                  close();
                  navigate('/app/account');
                }}
              >
                Settings
              </MenuItem>

              {session.memberships.length > 1 && (
                <>
                  <MenuDivider />
                  <MenuLabel>Switch company</MenuLabel>
                  {session.memberships.map((membership) => (
                    <MenuItem
                      key={membership.id}
                      icon={<Building />}
                      disabled={membership.id === session.membership.id}
                      onClick={async () => {
                        close();
                        try {
                          await switchCompany(membership.id);
                          navigate('/app');
                        } catch {
                          toast.error('We could not switch company. Please try again.');
                        }
                      }}
                    >
                      {membership.companyName}
                    </MenuItem>
                  ))}
                </>
              )}

              <MenuDivider />
              <MenuItem danger icon={<SignOut />} onClick={() => void handleSignOut()}>
                Sign out
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-w-0 overflow-x-hidden bg-paper">
      <aside
        className={cn(
          'hidden w-sidebar shrink-0 border-r border-edge lg:block',
          (scheduleMode || sidebarTransitioning) && 'lg:hidden',
        )}
      >
        {sidebar}
      </aside>

      {scheduleMode && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-sm border border-edge bg-sheet text-ink shadow-lift transition-colors hover:bg-paper"
        >
          <List className="text-[16px]" />
        </button>
      )}

      <AnimatePresence onExitComplete={() => setSidebarTransitioning(false)}>
        {mobileOpen && (
          <div
            className={cn(
              'fixed inset-0 z-50',
              !scheduleMode && !sidebarTransitioning && 'lg:hidden',
            )}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={sidebarTransitioning ? undefined : { opacity: 0 }}
              className="absolute inset-0 bg-ink/20"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={sidebarTransitioning ? undefined : { x: '-100%' }}
              transition={{ duration: 0.3, ease: DRAFT_EASE }}
              className="absolute inset-y-0 left-0 w-[268px] border-r border-edge shadow-panel"
            >
              {sidebar}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {!scheduleMode && (
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-edge bg-sheet px-2 sm:px-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-2 hover:bg-paper lg:hidden"
            >
              {mobileOpen ? <X className="text-[16px]" /> : <List className="text-[16px]" />}
            </button>

            <p className="edge-sm ml-2 hidden truncate sm:block lg:hidden">
              {session.company.name}
            </p>

            <div className="flex-1" />
            <AtlasyButton open={atlasyOpen} onClick={() => setAtlasyOpen((value) => !value)} />
            <NotificationCenter />
          </header>
        )}

        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      <AtlasyPanel open={atlasyOpen} onClose={() => setAtlasyOpen(false)} />
    </div>
  );
}

/** Route-level fade. Never a slide — pages are sheets being laid down, not swiped. */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: DRAFT_EASE }}
      className={cn('h-full', className)}
    >
      {children}
    </motion.div>
  );
}

/** Standard scrollable page body. One measure, consistently. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'mx-auto w-full max-w-[1180px] space-y-8 px-5 py-7 sm:px-8 sm:py-10',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
