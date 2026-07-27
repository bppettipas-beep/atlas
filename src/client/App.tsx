import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ToastProvider } from '@/components/ui';
import { AccountPage } from '@/pages/AccountPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { CompanySettingsPage } from '@/pages/CompanySettingsPage';
import { HomePage } from '@/pages/HomePage';
import { InvitationsPage } from '@/pages/InvitationsPage';
import { KnowledgeDocPage } from '@/pages/KnowledgeDocPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { LandingPage } from '@/pages/LandingPage';
import { MyDayPage } from '@/pages/MyDayPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OrganizationMapPage } from '@/pages/OrganizationMapPage';
import { OwnerSignupPage } from '@/pages/OwnerSignupPage';
import { PeoplePage } from '@/pages/PeoplePage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SchedulePage } from '@/pages/SchedulePage';
import { SignInPage } from '@/pages/SignInPage';
import { StartPage } from '@/pages/StartPage';
import { WorkPage } from '@/pages/WorkPage';
import { WorkerJoinPage } from '@/pages/WorkerJoinPage';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import type { ReactNode } from 'react';

/** Blocks a route until the session is known, then redirects if signed out. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState className="h-screen" label="Loading your workspace" />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Owner-only routes. The server enforces this too — this is only the UI half. */
function RequireLeadership({ children }: { children: ReactNode }) {
  const { isLeadership } = useAuth();
  if (!isLeadership) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * Owners land on the organization map; workers land on My Day. The two roles
 * are asking different questions, so they get different front doors.
 */
function AppIndex() {
  const { isLeadership } = useAuth();
  return <Navigate to={isLeadership ? '/app/organization' : '/app/my-day'} replace />;
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/start" element={<StartPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup/owner" element={<OwnerSignupPage />} />
            <Route path="/join" element={<WorkerJoinPage />} />

            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<AppIndex />} />
              <Route path="home" element={<HomePage />} />
              <Route path="my-day" element={<MyDayPage />} />
              <Route path="organization" element={<OrganizationMapPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="work" element={<WorkPage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="knowledge/:id" element={<KnowledgeDocPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="account" element={<AccountPage />} />
              <Route
                path="invitations"
                element={
                  <RequireLeadership>
                    <InvitationsPage />
                  </RequireLeadership>
                }
              />
              <Route
                path="settings"
                element={
                  <RequireLeadership>
                    <CompanySettingsPage />
                  </RequireLeadership>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
