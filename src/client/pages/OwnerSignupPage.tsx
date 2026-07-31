import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AuthDivider,
  GoogleButton,
  GoogleIdentityCard,
  useGoogleEnabled,
  useGoogleGrant,
} from '@/components/auth/GoogleSignIn';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, LoadingState } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import type { AccountSessionDto } from '@shared/types';

/** Account creation deliberately stops before company or panel creation. */
export function OwnerSignupPage() {
  const { account, loading, setAccount } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const googleEnabled = useGoogleEnabled();
  const { grant, loading: grantLoading } = useGoogleGrant(params.get('google') === '1');
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (loading || grantLoading) return <LoadingState className="h-screen" label="Loading…" />;
  if (account) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const next = await api.post<AccountSessionDto>(
        '/auth/account-signup',
        grant ? { useGoogle: true } : form,
      );
      setAccount(next);
      const selectedPlan = params.get('plan')?.toUpperCase();
      const nextPath = selectedPlan ? `/checkout?plan=${encodeURIComponent(selectedPlan)}` : '/';
      navigate(
        next.user.emailVerified ? nextPath : `/verify-email?next=${encodeURIComponent(nextPath)}`,
        {
          replace: true,
        },
      );
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('We could not create your account. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      sheet="Account sign-up"
      drawingNo="A-01"
      title="Create your account."
      description="Start with your personal Atlas account. You will choose a plan before creating a business panel."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/signin"
            className="font-medium text-ink underline decoration-edge underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      {googleEnabled && !grant && (
        <div className="mb-6 space-y-5">
          <GoogleButton intent="signup" label="Sign up with Google" />
          <AuthDivider />
        </div>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <InlineError message={error} />}
        {grant ? (
          <GoogleIdentityCard grant={grant} />
        ) : (
          <>
            <Field label="Full name" htmlFor="fullName" error={fieldErrors.fullName} required>
              <Input
                id="fullName"
                autoComplete="name"
                autoFocus
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              />
            </Field>
            <Field label="Email address" htmlFor="email" error={fieldErrors.email} required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              error={fieldErrors.password}
              hint="At least 8 characters."
              required
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
          </>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={submitting}
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
