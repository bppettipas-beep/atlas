import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, LoadingState } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import type { SessionUserDto } from '@shared/types';

export function PanelSetupPage() {
  const { account, loading, setSession, refresh } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingState className="h-screen" label="Loading…" />;
  if (!account) return <Navigate to="/signin" replace />;
  if (account.hasPanel) return <Navigate to="/app" replace />;
  if (!account.subscriptionActive) return <Navigate to="/explore/pricing" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await api.post<SessionUserDto>('/auth/owner-signup', {
        companyName,
        location,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      setSession(session);
      await refresh();
      navigate('/app/organization', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not set up your panel.');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      sheet="Panel setup"
      drawingNo="A-02"
      title="Set up your panel."
      description={`Your ${account.plan?.toLowerCase()} plan is active. Now create the business it belongs to.`}
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <InlineError message={error} />}
        <Field label="Company name" htmlFor="companyName" required>
          <Input
            id="companyName"
            autoFocus
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </Field>
        <Field label="Main location" htmlFor="location" hint="Optional city or region.">
          <Input
            id="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={submitting}
        >
          Create panel
        </Button>
      </form>
    </AuthLayout>
  );
}
