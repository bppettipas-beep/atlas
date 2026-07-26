import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { SealCheck } from '@/components/icons';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, LoadingState, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useDebounced } from '@/lib/useQuery';
import { useAuth } from '@/providers/AuthProvider';
import type { SessionUserDto } from '@shared/types';

interface InvitePreview {
  companyName: string;
  companyLogoUrl: string | null;
  teamName: string | null;
  role: string;
}

export function WorkerJoinPage() {
  const { session, loading, setSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    code: (params.get('code') ?? '').toUpperCase(),
    jobTitle: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const debouncedCode = useDebounced(form.code, 400);

  // Look the code up as it is typed so the person can see which company they
  // are about to join before they hand over a password.
  useEffect(() => {
    if (debouncedCode.length < 4) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    api
      .get<InvitePreview>('/auth/invite-preview', { code: debouncedCode })
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setPreviewError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(
          caught instanceof ApiError ? caught.message : 'We could not check that code.',
        );
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedCode]);

  if (loading) return <LoadingState className="h-screen" label="Loading…" />;
  if (session) return <Navigate to="/app" replace />;

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const next = await api.post<SessionUserDto>('/auth/worker-join', form);
      setSession(next);
      navigate('/app', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('We could not complete your sign-up. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      sheet="Worker join"
      drawingNo="A-02"
      title="Join your team."
      description="You need the invitation code from your manager or business owner."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/signin"
            className="font-medium text-ink underline decoration-edge underline-offset-4 hover:decoration-ink"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <InlineError message={error} />}

        <Field
          label="Invitation code"
          htmlFor="code"
          error={
            fieldErrors.code ?? (form.code.length >= 4 ? (previewError ?? undefined) : undefined)
          }
          hint="Ask your manager if you do not have one."
          required
        >
          <div className="relative">
            <Input
              id="code"
              required
              autoFocus={!form.code}
              value={form.code}
              invalid={Boolean(fieldErrors.code || (form.code.length >= 4 && previewError))}
              onChange={(event) => update('code')(event.target.value.toUpperCase())}
              placeholder="NORTHSTAR"
              className="pr-9 font-mono tracking-[0.16em]"
              autoComplete="off"
              spellCheck={false}
            />
            {checking && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner />
              </span>
            )}
          </div>
        </Field>

        {preview && (
          <div className="flex items-center gap-2.5 border border-done/30 bg-done-wash px-3 py-2.5">
            <SealCheck className="shrink-0 text-[15px] text-done" />
            <p className="text-[13px] leading-relaxed text-ink-2">
              You are joining <strong className="font-semibold">{preview.companyName}</strong>
              {preview.teamName && (
                <>
                  {' '}
                  on the <strong className="font-semibold">{preview.teamName}</strong> team
                </>
              )}
              .
            </p>
          </div>
        )}

        <Field label="Full name" htmlFor="fullName" error={fieldErrors.fullName} required>
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={form.fullName}
            invalid={Boolean(fieldErrors.fullName)}
            onChange={(event) => update('fullName')(event.target.value)}
            placeholder="Theo Banda"
          />
        </Field>

        <Field label="Email address" htmlFor="email" error={fieldErrors.email} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            invalid={Boolean(fieldErrors.email)}
            onChange={(event) => update('email')(event.target.value)}
            placeholder="you@example.com"
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
            required
            minLength={8}
            value={form.password}
            invalid={Boolean(fieldErrors.password)}
            onChange={(event) => update('password')(event.target.value)}
          />
        </Field>

        <Field
          label="Job title"
          htmlFor="jobTitle"
          hint="Optional — your manager can set this later."
        >
          <Input
            id="jobTitle"
            value={form.jobTitle}
            onChange={(event) => update('jobTitle')(event.target.value)}
            placeholder="Cleaning Technician"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={submitting}
        >
          Join company
        </Button>
      </form>
    </AuthLayout>
  );
}
