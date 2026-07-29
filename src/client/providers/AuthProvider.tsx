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
import type { AccountSessionDto, SessionUserDto } from '@shared/types';
import { planHasFeature, type PlanFeature } from '@shared/plans';

interface AuthContextValue {
  session: SessionUserDto | null;
  account: AccountSessionDto | null;
  loading: boolean;
  /** Re-reads the session from the server (after a profile edit, for example). */
  refresh: () => Promise<void>;
  setSession: (session: SessionUserDto) => void;
  setAccount: (account: AccountSessionDto) => void;
  signIn: (email: string, password: string) => Promise<SessionUserDto | AccountSessionDto>;
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
  const [session, setSession] = useState<SessionUserDto | null>(null);
  const [account, setAccount] = useState<AccountSessionDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const nextAccount = await api.get<AccountSessionDto>('/auth/account-session');
      setAccount(nextAccount);
      try {
        setSession(await api.get<SessionUserDto>('/auth/session'));
      } catch {
        setSession(null);
      }
    } catch (error) {
      // A 401 simply means "not signed in" — not an error worth surfacing.
      if (!(error instanceof ApiError && error.isUnauthorized)) {
        console.error('Could not load the session:', error);
      }
      setSession(null);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await api.post<SessionUserDto | AccountSessionDto>('/auth/login', {
      email,
      password,
    });
    if ('company' in next) {
      setSession(next);
      setAccount(await api.get<AccountSessionDto>('/auth/account-session'));
    } else {
      setAccount(next);
    }
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setSession(null);
      setAccount(null);
    }
  }, []);

  const switchCompany = useCallback(async (membershipId: string) => {
    setSession(await api.post<SessionUserDto>('/auth/switch-company', { membershipId }));
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
    [session, account, loading, load, signIn, signOut, switchCompany],
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
