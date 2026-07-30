import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

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
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'This verification link is missing its token.',
  );

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

  return (
    <AuthLayout
      sheet="Email verification"
      drawingNo="A-02"
      title={
        status === 'done'
          ? 'Email verified.'
          : status === 'working'
            ? 'Verifying your email…'
            : 'That link did not work.'
      }
      description={
        status === 'done'
          ? 'Your Atlas account email is confirmed.'
          : status === 'working'
            ? 'This should only take a moment.'
            : message
      }
      footer={
        <Link to="/account-settings" className="underline underline-offset-4">
          Open account settings
        </Link>
      }
    >
      <Notice>
        <strong>
          {status === 'done'
            ? 'All set. '
            : status === 'working'
              ? 'Checking link. '
              : 'Request another link. '}
        </strong>
        {status === 'done'
          ? 'You can safely close this page or continue to Atlas.'
          : status === 'working'
            ? 'Atlas is validating this one-use link.'
            : 'Sign in and request a fresh verification email from Account Settings.'}
      </Notice>
    </AuthLayout>
  );
}
