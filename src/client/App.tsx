import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingState, ToastProvider } from '@/components/ui';
import { PromoPopup } from '@/components/marketing/PromoPopup';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { lazy, Suspense, type ReactNode } from 'react';
import type { PlanFeature } from '@shared/plans';

const AccountPage = lazy(() =>
  import('@/pages/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ActivityPage = lazy(() =>
  import('@/pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const CompanySettingsPage = lazy(() =>
  import('@/pages/CompanySettingsPage').then((m) => ({ default: m.CompanySettingsPage })),
);
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const InvitationsPage = lazy(() =>
  import('@/pages/InvitationsPage').then((m) => ({ default: m.InvitationsPage })),
);
const KnowledgeDocPage = lazy(() =>
  import('@/pages/KnowledgeDocPage').then((m) => ({ default: m.KnowledgeDocPage })),
);
const KnowledgePage = lazy(() =>
  import('@/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })),
);
const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LegalPage = lazy(() => import('@/pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const MarketingDetailPage = lazy(() =>
  import('@/pages/MarketingDetailPage').then((m) => ({ default: m.MarketingDetailPage })),
);
const MyDayPage = lazy(() => import('@/pages/MyDayPage').then((m) => ({ default: m.MyDayPage })));
const MockCheckoutPage = lazy(() =>
  import('@/pages/MockCheckoutPage').then((m) => ({ default: m.MockCheckoutPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const OrganizationMapPage = lazy(() =>
  import('@/pages/OrganizationMapPage').then((m) => ({ default: m.OrganizationMapPage })),
);
const OwnerSignupPage = lazy(() =>
  import('@/pages/OwnerSignupPage').then((m) => ({ default: m.OwnerSignupPage })),
);
const PanelSetupPage = lazy(() =>
  import('@/pages/PanelSetupPage').then((m) => ({ default: m.PanelSetupPage })),
);
const PublicAccountPage = lazy(() =>
  import('@/pages/PublicAccountPage').then((m) => ({ default: m.PublicAccountPage })),
);
const PeoplePage = lazy(() =>
  import('@/pages/PeoplePage').then((m) => ({ default: m.PeoplePage })),
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const SchedulePage = lazy(() =>
  import('@/pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const SignInPage = lazy(() =>
  import('@/pages/SignInPage').then((m) => ({ default: m.SignInPage })),
);
const StartPage = lazy(() => import('@/pages/StartPage').then((m) => ({ default: m.StartPage })));
const WorkPage = lazy(() => import('@/pages/WorkPage').then((m) => ({ default: m.WorkPage })));
const WorkerJoinPage = lazy(() =>
  import('@/pages/WorkerJoinPage').then((m) => ({ default: m.WorkerJoinPage })),
);

/** Blocks a route until the session is known, then redirects if signed out. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, account, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState className="h-screen" label="Loading your workspace" />;
  if (!session) {
    return account ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate to="/signin" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}

/** Owner-only routes. The server enforces this too — this is only the UI half. */
function RequireLeadership({ children }: { children: ReactNode }) {
  const { isLeadership } = useAuth();
  if (!isLeadership) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session?.user.isPlatformAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RequirePlanFeature({ feature, children }: { feature: PlanFeature; children: ReactNode }) {
  const { hasPlanFeature } = useAuth();
  if (!hasPlanFeature(feature)) return <Navigate to="/app/settings" replace />;
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

/**
 * Marketing pages share one component, but each topic is its own document.
 * Keying it by the route parameter guarantees a clean page instance when a
 * visitor moves directly from one top tab to another.
 */
function MarketingRoute() {
  const { section } = useParams();
  return <MarketingDetailPage key={section} />;
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <RealtimeProvider>
            <PromoPopup />
            <Suspense fallback={<LoadingState className="h-screen" label="Loading this sheet" />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/explore/:section" element={<MarketingRoute />} />
                <Route path="/legal/:document" element={<LegalPage />} />
                <Route path="/start" element={<StartPage />} />
                <Route path="/signin" element={<SignInPage />} />
                <Route path="/signup/owner" element={<OwnerSignupPage />} />
                <Route path="/setup-panel" element={<PanelSetupPage />} />
                <Route path="/account-settings" element={<PublicAccountPage />} />
                <Route path="/checkout" element={<MockCheckoutPage />} />
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
                  <Route path="chat" element={<ChatPage />} />
                  <Route path="work" element={<WorkPage />} />
                  <Route
                    path="schedule"
                    element={
                      <RequirePlanFeature feature="SCHEDULING">
                        <SchedulePage />
                      </RequirePlanFeature>
                    }
                  />
                  <Route
                    path="knowledge"
                    element={
                      <RequireLeadership>
                        <RequirePlanFeature feature="KNOWLEDGE">
                          <KnowledgePage />
                        </RequirePlanFeature>
                      </RequireLeadership>
                    }
                  />
                  <Route
                    path="knowledge/:id"
                    element={
                      <RequireLeadership>
                        <RequirePlanFeature feature="KNOWLEDGE">
                          <KnowledgeDocPage />
                        </RequirePlanFeature>
                      </RequireLeadership>
                    }
                  />
                  <Route
                    path="activity"
                    element={
                      <RequireLeadership>
                        <RequirePlanFeature feature="REPORTING">
                          <ActivityPage />
                        </RequirePlanFeature>
                      </RequireLeadership>
                    }
                  />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="account" element={<AccountPage />} />
                  <Route
                    path="admin"
                    element={
                      <RequirePlatformAdmin>
                        <AdminPage />
                      </RequirePlatformAdmin>
                    }
                  />
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
            </Suspense>
          </RealtimeProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
