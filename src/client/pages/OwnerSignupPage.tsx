import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, LoadingState, Select } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import type { SessionUserDto } from '@shared/types';

const INDUSTRIES = [
  'Facilities & Cleaning Services',
  'Construction & Trades',
  'Hospitality & Food',
  'Retail',
  'Healthcare & Care',
  'Professional Services',
  'Logistics & Transport',
  'Manufacturing',
  'Landscaping & Grounds',
  'Other',
];

const SIZES = ['1-5', '6-10', '10-25', '25-50', '50-100', '100+'];

/** A small, sensible timezone list — the full IANA list is overwhelming. */
const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Asia/Singapore',
  'Asia/Dubai',
  'UTC',
];

export function OwnerSignupPage() {
  const { session, loading, setSession } = useAuth();
  const navigate = useNavigate();

  const guessedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    companyName: '',
    industry: INDUSTRIES[0],
    sizeRange: SIZES[2],
    location: '',
    timezone: TIMEZONES.includes(guessedTimezone) ? guessedTimezone : 'UTC',
    logoUrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (loading) return <LoadingState className="h-screen" label="Loading…" />;
  if (session) return <Navigate to="/app" replace />;

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      // The upload endpoint requires a session, so before sign-up we keep the
      // logo as a data URL and send it with the form.
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      if (dataUrl.length > 400_000) {
        setError('That logo is too large. Choose an image under about 300KB.');
        return;
      }
      update('logoUrl')(dataUrl);
      setError(null);
    } catch {
      setError('We could not read that image. Try a different file.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const next = await api.post<SessionUserDto>('/auth/owner-signup', form);
      setSession(next);
      navigate('/app/organization', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('We could not create your company. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      sheet="Owner sign-up"
      drawingNo="A-01"
      title="Set up your company."
      description="This creates your company, makes you the owner, and gives you a Leadership team to build from."
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

        <fieldset className="space-y-4">
          <legend className="edge mb-4">About you</legend>

          <Field label="Full name" htmlFor="fullName" error={fieldErrors.fullName} required>
            <Input
              id="fullName"
              autoComplete="name"
              required
              autoFocus
              value={form.fullName}
              invalid={Boolean(fieldErrors.fullName)}
              onChange={(event) => update('fullName')(event.target.value)}
              placeholder="Ada Whitfield"
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
              placeholder="you@company.com"
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
        </fieldset>

        <fieldset className="space-y-4 border-t border-rule pt-6">
          <legend className="edge mb-4">About the business</legend>

          <Field
            label="Company name"
            htmlFor="companyName"
            error={fieldErrors.companyName}
            required
          >
            <Input
              id="companyName"
              required
              value={form.companyName}
              invalid={Boolean(fieldErrors.companyName)}
              onChange={(event) => update('companyName')(event.target.value)}
              placeholder="Northstar Facilities"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry" htmlFor="industry">
              <Select
                id="industry"
                value={form.industry}
                onChange={(event) => update('industry')(event.target.value)}
              >
                {INDUSTRIES.map((industry) => (
                  <option key={industry}>{industry}</option>
                ))}
              </Select>
            </Field>

            <Field label="Company size" htmlFor="sizeRange">
              <Select
                id="sizeRange"
                value={form.sizeRange}
                onChange={(event) => update('sizeRange')(event.target.value)}
              >
                {SIZES.map((size) => (
                  <option key={size}>{size} people</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Main location" htmlFor="location" hint="City or region.">
              <Input
                id="location"
                value={form.location}
                onChange={(event) => update('location')(event.target.value)}
                placeholder="Portland, Oregon"
              />
            </Field>

            <Field label="Timezone" htmlFor="timezone">
              <Select
                id="timezone"
                value={form.timezone}
                onChange={(event) => update('timezone')(event.target.value)}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Company logo" htmlFor="logo" hint="Optional. PNG or JPG, under 300KB.">
            <div className="flex items-center gap-3">
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Company logo preview"
                  className="h-11 w-11 border border-edge object-cover"
                />
              )}
              <input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => void handleLogo(event.target.files?.[0])}
                className="block w-full text-[12.5px] text-ink-3 file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-edge file:bg-sheet file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-ink hover:file:bg-paper"
              />
              {form.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update('logoUrl')('')}
                >
                  Remove
                </Button>
              )}
            </div>
          </Field>
        </fieldset>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full justify-center"
          loading={submitting || uploading}
        >
          Create company
        </Button>
      </form>
    </AuthLayout>
  );
}
