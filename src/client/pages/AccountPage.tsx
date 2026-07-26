import { useEffect, useState } from 'react';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import {
  Button,
  Field,
  InlineError,
  Input,
  Notice,
  PageHeader,
  RuledHead,
  Sheet,
  Toggle,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useQuery } from '@/lib/useQuery';
import { useAuth, useSession } from '@/providers/AuthProvider';

interface Preferences {
  taskAssigned: boolean;
  mentions: boolean;
  teamChanges: boolean;
  knowledgeUpdates: boolean;
  dueDateChanges: boolean;
  announcements: boolean;
}

const PREFERENCE_COPY: { key: keyof Preferences; label: string; description: string }[] = [
  {
    key: 'taskAssigned',
    label: 'Work assigned to me',
    description: 'When somebody puts a task on your plate.',
  },
  { key: 'mentions', label: 'Mentions', description: 'When somebody @mentions you in a comment.' },
  {
    key: 'dueDateChanges',
    label: 'Deadline changes',
    description: 'When the due date on one of your tasks moves.',
  },
  {
    key: 'teamChanges',
    label: 'Team changes',
    description: 'When you are added to a team, or somebody joins the company.',
  },
  {
    key: 'knowledgeUpdates',
    label: 'Knowledge base',
    description: 'New documents, and anything you are asked to acknowledge.',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    description: 'Company-wide messages from your owner or manager.',
  },
];

export function AccountPage() {
  const session = useSession();
  const { signOut } = useAuth();
  const toast = useToast();
  const hasPassword = session.user.hasPassword;

  const prefsQuery = useQuery<Preferences>(
    (signal) => api.get('/notifications/preferences', undefined, signal),
    [],
  );
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  useEffect(() => setPrefs(prefsQuery.data), [prefsQuery.data]);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const updatePreference = async (key: keyof Preferences, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value }); // optimistic — a toggle must feel instant
    try {
      await api.patch('/notifications/preferences', { [key]: value });
    } catch (error) {
      setPrefs(previous);
      toast.error(errorMessage(error));
    }
  };

  const changePassword = async () => {
    setPasswordError(null);
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError('The two new passwords do not match.');
      return;
    }
    setChanging(true);
    try {
      await api.patch('/auth/password', {
        currentPassword: hasPassword ? passwords.currentPassword : undefined,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setChanging(false);
    }
  };

  return (
    <PageTransition>
      <PageBody className="max-w-[720px]">
        <PageHeader
          eyebrow="Your account"
          title="Settings"
          description="Sign-in details and what Atlas is allowed to interrupt you about."
        />

        {/* ------------------------------ identity -------------------------- */}
        <Sheet className="p-5">
          <RuledHead title="Signed in as" className="mb-4" />
          <dl className="space-y-2 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-4">Name</dt>
              <dd className="text-ink-2">{session.user.fullName}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-4">Email</dt>
              <dd className="font-mono text-[12px] text-ink-2">{session.user.email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-4">Company</dt>
              <dd className="text-ink-2">
                {session.company.name}{' '}
                <span className="text-ink-4">({session.membership.role.toLowerCase()})</span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-rule pt-3 text-[12px] text-ink-3">
            Your name and job title live on your{' '}
            <a
              href="/app/profile"
              className="text-mark underline decoration-mark/30 underline-offset-2 hover:decoration-mark"
            >
              profile
            </a>
            , where the rest of the company sees them.
          </p>
        </Sheet>

        {/* ---------------------------- notifications ----------------------- */}
        <Sheet className="p-5">
          <RuledHead
            title="Notifications"
            description="Turning something off stops the notification, not the work. Assignments and blockers still appear on your pages."
            className="mb-2"
          />
          {prefs ? (
            <div>
              {PREFERENCE_COPY.map((item) => (
                <Toggle
                  key={item.key}
                  checked={prefs[item.key]}
                  onChange={(value) => void updatePreference(item.key, value)}
                  label={item.label}
                  description={item.description}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-[13px] text-ink-3">Loading your preferences…</p>
          )}
        </Sheet>

        {/* ------------------------------ password -------------------------- */}
        <Sheet className="p-5">
          <RuledHead title={hasPassword ? 'Change password' : 'Set a password'} className="mb-4" />
          <div className="max-w-sm space-y-4">
            {passwordError && <InlineError message={passwordError} />}

            {/* A Google-only account has no current password to prove; its
                session is the proof. Asking for one would be a dead end. */}
            {hasPassword ? (
              <Field label="Current password" htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) =>
                    setPasswords({ ...passwords, currentPassword: event.target.value })
                  }
                />
              </Field>
            ) : (
              <Notice tone="info">
                You sign in with Google. Setting a password adds a second way in — it does not
                remove Google.
              </Notice>
            )}

            <Field
              label="New password"
              htmlFor="new-password"
              hint="At least 8 characters."
              required
            >
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={passwords.newPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, newPassword: event.target.value })
                }
              />
            </Field>

            <Field label="Confirm new password" htmlFor="confirm-password" required>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={passwords.confirm}
                onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
              />
            </Field>

            <Notice tone="info">
              Changing your password signs you out everywhere else. That is deliberate.
            </Notice>

            <Button
              variant="primary"
              loading={changing}
              disabled={(hasPassword && !passwords.currentPassword) || passwords.newPassword.length < 8}
              onClick={() => void changePassword()}
            >
              {hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </div>
        </Sheet>

        <div className="flex justify-end border-t border-rule pt-5">
          <Button
            variant="ghost"
            className="text-alert hover:bg-alert-wash"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </PageBody>
    </PageTransition>
  );
}
