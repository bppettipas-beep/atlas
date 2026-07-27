import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthDivider, GoogleButton, useGoogleEnabled } from '@/components/auth/GoogleSignIn';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, LoadingState } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export function SignInPage() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const googleEnabled = useGoogleEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // A failed Google round trip comes back as a redirect carrying its reason.
  const [error, setError] = useState<string | null>(params.get('error'));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingState className="h-screen" label="Loading" />;
  if (session) return <Navigate to="/app" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/app', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('We could not sign you in. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      sheet="Sign in"
      drawingNo="A-00"
      title="Welcome back."
      description="Use the email address your company account was created with."
      footer={
        <>
          New here?{' '}
          <Link
            to="/start"
            className="font-medium text-ink underline decoration-edge underline-offset-4 hover:decoration-ink"
          >
            Tell us who you are
          </Link>
        </>
      }
    >
      {googleEnabled && (
        <div className="mb-6 space-y-5">
          <GoogleButton intent="signin" label="Sign in with Google" />
          <AuthDivider />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <InlineError message={error} />}

        <Field label="Email address" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            invalid={Boolean(fieldErrors.email)}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" error={fieldErrors.password} required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            invalid={Boolean(fieldErrors.password)}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={submitting}
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
