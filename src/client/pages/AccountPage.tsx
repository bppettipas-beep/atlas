import { useEffect, useState } from 'react';
import { SignOut, Trash } from '@/components/icons';
import { PageBody, PageTransition } from '@/components/layout/AppShell';
import {
  Button,
  Field,
  InlineError,
  Input,
  Modal,
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
  taskComments: boolean;
  companyActivity: boolean;
  emailNotifications: boolean;
}

const PREFERENCE_COPY: {
  key: keyof Preferences;
  label: string;
  description: string;
  /** Hidden from workers, who are never sent this kind of notification. */
  leadershipOnly?: boolean;
}[] = [
  {
    key: 'taskAssigned',
    label: 'Work assigned to me',
    description: 'When somebody puts a task on your plate.',
  },
  { key: 'mentions', label: 'Mentions', description: 'When somebody @mentions you in a comment.' },
  {
    key: 'taskComments',
    label: 'Comments on my work',
    description: 'When somebody comments on a task you were given or created.',
  },
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
  {
    key: 'companyActivity',
    label: 'Everything happening in the company',
    description:
      'Tasks created and finished, and people joining or leaving — including work you are not part of.',
    leadershipOnly: true,
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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** Their password, or their typed email address — whichever proves it is them. */
  const [confirmText, setConfirmText] = useState('');

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.post('/auth/account/delete', {
        password: hasPassword ? confirmText : undefined,
        confirmEmail: hasPassword ? undefined : confirmText,
      });
      // The server has already cleared the cookies; this clears the client and
      // sends them back to the landing page.
      await signOut();
    } catch (error) {
      setDeleteError(errorMessage(error));
      setDeleting(false);
    }
  };

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
              {PREFERENCE_COPY.filter(
                (item) => !item.leadershipOnly || session.membership.role !== 'WORKER',
              ).map((item) => (
                <Toggle
                  key={item.key}
                  checked={prefs[item.key]}
                  onChange={(value) => void updatePreference(item.key, value)}
                  label={item.label}
                  description={item.description}
                />
              ))}

              {/* The switches above decide what you are told about at all.
                  This one only decides whether it also reaches your inbox, so
                  it sits apart from them rather than reading as another
                  category of notification. */}
              <div className="mt-4 border-t border-rule pt-2">
                <Toggle
                  checked={prefs.emailNotifications}
                  onChange={(value) => void updatePreference('emailNotifications', value)}
                  label="Email me these too"
                  description="Sends a copy of everything above to your email address, so you still hear about it when Atlas is closed."
                />
              </div>
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
              disabled={
                (hasPassword && !passwords.currentPassword) || passwords.newPassword.length < 8
              }
              onClick={() => void changePassword()}
            >
              {hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </div>
        </Sheet>

        {/* ------------------------------ sign out -------------------------- */}
        <Sheet className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="title text-[13.5px] leading-tight">Sign out</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              Ends this session on this device. Everything stays where it is.
            </p>
          </div>
          <Button icon={<SignOut />} onClick={() => void signOut()}>
            Sign out
          </Button>
        </Sheet>

        {/* ---------------------------- danger zone ------------------------- */}
        <Sheet className="border-alert/40 p-5">
          <RuledHead title="Delete account" className="mb-4" />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-prose text-[12.5px] leading-relaxed text-ink-3">
              Permanently deletes your login, your sessions and your place in{' '}
              {session.memberships.length === 1
                ? session.company.name
                : `${session.memberships.length} companies`}
              . Work you created — tasks, comments, documents — stays with the company, but stops
              being attributed to you. This cannot be undone.
            </p>
            <Button
              variant="danger"
              icon={<Trash />}
              onClick={() => {
                setDeleteError(null);
                setConfirmText('');
                setDeleteOpen(true);
              }}
            >
              Delete account
            </Button>
          </div>
        </Sheet>
      </PageBody>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        size="sm"
        title="Delete your account?"
        description="This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={confirmText.length === 0}
              onClick={() => void deleteAccount()}
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {deleteError && <InlineError message={deleteError} />}

          <Notice tone="alert">
            You will be signed out immediately and will not be able to sign back in.
          </Notice>

          {/* A password account re-enters its password. A Google account has
              none, so it types its own address — the same deliberate friction. */}
          {hasPassword ? (
            <Field label="Confirm your password" htmlFor="delete-password" required>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
              />
            </Field>
          ) : (
            <Field
              label="Type your email address to confirm"
              htmlFor="delete-email"
              hint={session.user.email}
              required
            >
              <Input
                id="delete-email"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={session.user.email}
              />
            </Field>
          )}
        </div>
      </Modal>
    </PageTransition>
  );
}
