import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout
      sheet="Account recovery"
      drawingNo="A-03"
      title="Reset your password."
      description="Enter your account email and we’ll send a one-use reset link if the account supports password sign-in."
      footer={
        <Link to="/signin" className="underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Notice>
          <strong>Check your inbox.</strong> If an eligible Atlas account uses that address, its
          reset link is on the way. It expires in one hour.
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && <InlineError message={error} />}
          <Field label="Email address" htmlFor="recovery-email" required>
            <Input
              id="recovery-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            loading={sending}
          >
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      sheet="Account recovery"
      drawingNo="A-04"
      title={done ? 'Password updated.' : 'Choose a new password.'}
      description={
        done
          ? 'Your other Atlas sessions were signed out for security.'
          : 'This reset link can only be used once.'
      }
      footer={
        <Link to="/signin" className="underline underline-offset-4">
          Go to sign in
        </Link>
      }
    >
      {done ? (
        <Notice>
          <strong>You’re ready.</strong> Sign in with your new password.
        </Notice>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && <InlineError message={error} />}
          {!token && <InlineError message="This reset link is missing its token." />}
          <Field
            label="New password"
            htmlFor="reset-password"
            hint="At least 8 characters."
            required
          >
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Confirm password" htmlFor="reset-confirm" required>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            loading={saving}
            disabled={!token}
          >
            Set new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { account, loading, refresh } = useAuth();
  const token = params.get('token') ?? '';
  const requestedNext = params.get('next') ?? '/';
  const next =
    requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>(
    token ? 'working' : 'idle',
  );
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    void api
      .post('/auth/verify-email', { token })
      .then(() => setStatus('done'))
      .catch((caught) => {
        setMessage(errorMessage(caught));
        setStatus('error');
      });
  }, [token]);

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('working');
    setMessage('');
    try {
      await api.post('/auth/verify-email-code', { code });
      await refresh();
      setStatus('done');
      window.setTimeout(() => navigate(next, { replace: true }), 500);
    } catch (caught) {
      setMessage(errorMessage(caught));
      setStatus('error');
    }
  };

  const resend = async () => {
    setResending(true);
    setMessage('');
    setResent(false);
    try {
      await api.post('/auth/resend-verification');
      setResent(true);
      setCode('');
      setStatus('idle');
    } catch (caught) {
      setMessage(errorMessage(caught));
      setStatus('error');
    } finally {
      setResending(false);
    }
  };

  if (!token && !loading && !account) return <Navigate to="/signin" replace />;
  if (!token && account?.user.emailVerified && status !== 'done') {
    return <Navigate to={next} replace />;
  }

  const linkMode = Boolean(token);

  return (
    <AuthLayout
      sheet="Email verification"
      drawingNo="A-02"
      title={
        status === 'done'
          ? 'Email verified.'
          : linkMode
            ? status === 'error'
              ? 'That link did not work.'
              : 'Verifying your email…'
            : 'Check your email.'
      }
      description={
        status === 'done'
          ? 'Your Atlas account email is confirmed.'
          : linkMode
            ? message || 'This should only take a moment.'
            : `Enter the six-digit code sent to ${account?.user.email ?? 'your email address'}.`
      }
      footer={
        linkMode ? (
          <Link to="/account-settings" className="underline underline-offset-4">
            Open account settings
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending}
            className="underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? 'Sending a new code…' : 'Send a new code'}
          </button>
        )
      }
    >
      {linkMode || status === 'done' ? (
        <Notice>
          <strong>{status === 'done' ? 'All set. ' : 'Checking verification. '}</strong>
          {status === 'done'
            ? 'Continuing to Atlas.'
            : message || 'Atlas is validating this one-use link.'}
        </Notice>
      ) : (
        <form onSubmit={submitCode} className="space-y-5" noValidate>
          {message && <InlineError message={message} />}
          {resent && (
            <Notice>
              <strong>New code sent.</strong> Check your inbox and spam folder.
            </Notice>
          )}
          <Field
            label="Verification code"
            htmlFor="email-code"
            hint="The code expires in 10 minutes."
            required
          >
            <Input
              id="email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center font-mono text-[1.25rem] tracking-[0.35em]"
              required
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            loading={status === 'working'}
            disabled={code.length !== 6}
          >
            Verify email
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
