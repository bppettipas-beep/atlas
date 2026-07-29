import { Link, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoadingState } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

export function PublicAccountPage() {
  const { account, loading } = useAuth();
  if (loading) return <LoadingState className="h-screen" label="Loading…" />;
  if (!account) return <Navigate to="/signin" replace />;
  return (
    <AuthLayout
      sheet="Account"
      drawingNo="A-03"
      title={account.user.fullName}
      description={account.user.email}
    >
      <div className="space-y-4 text-[13px] text-ink-2">
        <p>Plan: {account.plan ? account.plan.toLowerCase() : 'No active plan'}</p>
        <p>Panel: {account.hasPanel ? 'Created' : 'Not created yet'}</p>
        {!account.hasPanel && account.subscriptionActive && (
          <Link
            to="/setup-panel"
            className="inline-flex h-9 items-center rounded-sm bg-ink px-4 font-medium text-white"
          >
            Set up panel
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
