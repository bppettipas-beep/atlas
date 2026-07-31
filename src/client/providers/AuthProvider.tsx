import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/api';
import { isTabSignedOut, markTabSignedIn, markTabSignedOut } from '@/lib/tabSession';
import type { AccountSessionDto, PendingAccountSignupDto, SessionUserDto } from '@shared/types';
import { planHasFeature, type PlanFeature } from '@shared/plans';

interface AuthContextValue {
  session: SessionUserDto | null;
  account: AccountSessionDto | null;
  loading: boolean;
  /** Re-reads the session from the server (after a profile edit, for example). */
  refresh: () => Promise<void>;
  setSession: (session: SessionUserDto) => void;
  setAccount: (account: AccountSessionDto) => void;
  signIn: (
    email: string,
    password: string,
  ) => Promise<SessionUserDto | AccountSessionDto | PendingAccountSignupDto>;
  signOut: () => Promise<void>;
  switchCompany: (membershipId: string) => Promise<void>;
  isOwner: boolean;
  isManager: boolean;
  isLeadership: boolean;
  /** True once the company is on any plan above the default Starter tier. */
  isPaidPlan: boolean;
  hasPlanFeature: (feature: PlanFeature) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionUserDto | null>(null);
  const [account, setAccountState] = useState<AccountSessionDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isTabSignedOut()) {
      setSessionState(null);
      setAccountState(null);
      setLoading(false);
      return;
    }
    try {
      const nextAccount = await api.get<AccountSessionDto>('/auth/account-session');
      setAccountState(nextAccount);
      try {
        const nextSession = await api.get<SessionUserDto>('/auth/session');
        // A preserved panel is not an accessible panel once its subscription
        // has been removed. Keep the account signed in, but present the public
        // account experience until an admin restores paid access.
        setSessionState(
          nextAccount.user.emailVerified && nextSession.company.subscriptionStatus === 'ACTIVE'
            ? nextSession
            : null,
        );
      } catch {
        setSessionState(null);
      }
    } catch (error) {
      // A 401 simply means "not signed in" — not an error worth surfacing.
      if (!(error instanceof ApiError && error.isUnauthorized)) {
        console.error('Could not load the session:', error);
      }
      setSessionState(null);
      setAccountState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const setSession = useCallback((next: SessionUserDto) => {
    markTabSignedIn();
    setSessionState(next);
  }, []);

  const setAccount = useCallback((next: AccountSessionDto) => {
    markTabSignedIn();
    setAccountState(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await api.post<SessionUserDto | AccountSessionDto | PendingAccountSignupDto>(
      '/auth/login',
      { email, password },
    );
    if ('verificationRequired' in next) return next;
    markTabSignedIn();
    if ('company' in next) {
      const nextAccount = await api.get<AccountSessionDto>('/auth/account-session');
      setAccountState(nextAccount);
      if (!nextAccount.user.emailVerified) {
        setSessionState(null);
        return nextAccount;
      }
      if (next.company.subscriptionStatus === 'SUSPENDED') {
        setSessionState(null);
        return nextAccount;
      }
      setSessionState(next);
    } else {
      setAccountState(next);
    }
    return next;
  }, []);

  const signOut = useCallback(async () => {
    // Temporary testing behavior: do not revoke or clear the shared browser
    // cookie. sessionStorage belongs to one tab, so sibling tabs stay signed in
    // while this tab remains signed out even if it is refreshed.
    markTabSignedOut();
    setSessionState(null);
    setAccountState(null);
  }, []);

  const switchCompany = useCallback(async (membershipId: string) => {
    markTabSignedIn();
    setSessionState(await api.post<SessionUserDto>('/auth/switch-company', { membershipId }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      account,
      loading,
      refresh: load,
      setSession,
      setAccount,
      signIn,
      signOut,
      switchCompany,
      isOwner: session?.membership.permissions.includes('company.manage') ?? false,
      isManager: session?.membership.rank.key === 'manager',
      isLeadership: session?.membership.permissions.includes('activity.view') ?? false,
      isPaidPlan: session ? session.company.subscriptionPlan !== 'STARTER' : false,
      hasPlanFeature: (feature) =>
        session ? planHasFeature(session.company.subscriptionPlan, feature) : false,
    }),
    [session, account, loading, load, setSession, setAccount, signIn, signOut, switchCompany],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** Convenience hook for screens that are only rendered when signed in. */
export function useSession(): SessionUserDto {
  const { session } = useAuth();
  if (!session) throw new Error('useSession was called outside an authenticated route.');
  return session;
}
