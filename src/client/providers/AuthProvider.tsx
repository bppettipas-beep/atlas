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
import type { SessionUserDto } from '@shared/types';

interface AuthContextValue {
  session: SessionUserDto | null;
  loading: boolean;
  /** Re-reads the session from the server (after a profile edit, for example). */
  refresh: () => Promise<void>;
  setSession: (session: SessionUserDto) => void;
  signIn: (email: string, password: string) => Promise<SessionUserDto>;
  signOut: () => Promise<void>;
  switchCompany: (membershipId: string) => Promise<void>;
  isOwner: boolean;
  isManager: boolean;
  isLeadership: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setSession(await api.get<SessionUserDto>('/auth/session'));
    } catch (error) {
      // A 401 simply means "not signed in" — not an error worth surfacing.
      if (!(error instanceof ApiError && error.isUnauthorized)) {
        console.error('Could not load the session:', error);
      }
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await api.post<SessionUserDto>('/auth/login', { email, password });
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setSession(null);
    }
  }, []);

  const switchCompany = useCallback(async (membershipId: string) => {
    setSession(await api.post<SessionUserDto>('/auth/switch-company', { membershipId }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      refresh: load,
      setSession,
      signIn,
      signOut,
      switchCompany,
      isOwner: session?.membership.role === 'OWNER' || session?.membership.role === 'CO_OWNER',
      isManager: session?.membership.role === 'MANAGER',
      isLeadership:
        session?.membership.role === 'OWNER' ||
        session?.membership.role === 'CO_OWNER' ||
        session?.membership.role === 'MANAGER',
    }),
    [session, loading, load, signIn, signOut, switchCompany],
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
