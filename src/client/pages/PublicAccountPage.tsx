import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import {
  Avatar,
  Button,
  Field,
  InlineError,
  Input,
  LoadingState,
  Modal,
  Notice,
  Textarea,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import type { AccountSessionDto } from '@shared/types';

export function PublicAccountPage() {
  const { account, loading } = useAuth();
  if (loading) return <LoadingState className="min-h-[100dvh]" label="Loading settings" />;
  if (!account) return <Navigate to="/signin" replace />;
  return <AccountSettings account={account} />;
}

function AccountSettings({ account }: { account: AccountSessionDto }) {
  const { setAccount, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(() => ({
    fullName: account.user.fullName,
    email: account.user.email,
    phone: account.user.phone ?? '',
    location: account.user.location ?? '',
    timezone: account.user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    bio: account.user.bio ?? '',
    avatarUrl: account.user.avatarUrl,
  }));
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      const updated = await api.patch<AccountSessionDto>('/auth/account', {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone || null,
        location: profile.location || null,
        timezone: profile.timezone || null,
        bio: profile.bio || null,
        avatarUrl: profile.avatarUrl,
      });
      setAccount(updated);
      toast.success('Account details saved.');
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setProfileError(null);
    try {
      const uploaded = await api.upload<{ url: string }>('/auth/account/avatar', file);
      setProfile((current) => ({ ...current, avatarUrl: uploaded.url }));
      toast.success('Picture ready. Save your changes to keep it.');
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await api.patch('/auth/password', {
        currentPassword: account.user.hasPassword ? passwords.currentPassword : undefined,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await refresh();
      toast.success(
        account.user.hasPassword
          ? 'Password changed. Other devices were signed out.'
          : 'Password added to your account.',
      );
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setChangingPassword(false);
    }
  };

  const logOut = async () => {
    await signOut();
    navigate('/');
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.post('/auth/account/delete', {
        password: account.user.hasPassword ? confirmText : undefined,
        confirmEmail: account.user.hasPassword ? undefined : confirmText,
      });
      await signOut();
      navigate('/');
    } catch (error) {
      setDeleteError(errorMessage(error));
      setDeleting(false);
    }
  };

  return (
    <AuthLayout
      sheet="Account settings"
      drawingNo="A-03"
      title="Your account."
      description="Personal details, sign-in security, and account controls. These settings do not require a plan or belong to a company."
    >
      <div className="space-y-8">
        <section>
          <div className="mb-4 flex items-center justify-between border-b border-rule pb-2">
            <h2 className="edge">Personal profile</h2>
            <span className="font-mono text-[10px] text-ink-4">PERSONAL</span>
          </div>

          <form onSubmit={saveProfile} className="space-y-5">
            {profileError && <InlineError message={profileError} />}

            <div className="flex items-center gap-4 border border-rule bg-paper p-4">
              <Avatar
                name={profile.fullName || account.user.fullName}
                src={profile.avatarUrl}
                size="xl"
              />
              <div className="min-w-0 flex-1">
                <p className="title text-[13.5px]">Profile picture</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                  Use a square JPG, PNG, WebP, GIF, or SVG.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={uploadingAvatar}
                    onClick={() => fileInput.current?.click()}
                  >
                    Choose picture
                  </Button>
                  {profile.avatarUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setProfile({ ...profile, avatarUrl: null })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="sr-only"
                  onChange={(event) => void uploadAvatar(event)}
                />
              </div>
            </div>

            <Field label="Full name" htmlFor="account-name" required>
              <Input
                id="account-name"
                autoComplete="name"
                value={profile.fullName}
                onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                required
              />
            </Field>

            <Field
              label="Email address"
              htmlFor="account-email"
              hint={
                account.user.hasGoogle
                  ? 'Changing this does not disconnect your linked Google account.'
                  : 'This becomes the email you use to sign in.'
              }
              required
            >
              <Input
                id="account-email"
                type="email"
                autoComplete="email"
                value={profile.email}
                onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number" htmlFor="account-phone">
                <Input
                  id="account-phone"
                  type="tel"
                  autoComplete="tel"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  placeholder="+1 506 555 0123"
                />
              </Field>
              <Field label="Location" htmlFor="account-location">
                <Input
                  id="account-location"
                  autoComplete="address-level2"
                  value={profile.location}
                  onChange={(event) => setProfile({ ...profile, location: event.target.value })}
                  placeholder="Moncton, NB"
                />
              </Field>
            </div>

            <Field
              label="Timezone"
              htmlFor="account-timezone"
              hint="Used for personal dates and reminders."
            >
              <Input
                id="account-timezone"
                value={profile.timezone}
                onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}
                placeholder="America/Moncton"
              />
            </Field>

            <Field
              label="About you"
              htmlFor="account-bio"
              hint={`${profile.bio.length}/1000 characters`}
            >
              <Textarea
                id="account-bio"
                maxLength={1000}
                value={profile.bio}
                onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                placeholder="A short personal introduction."
                className="min-h-[110px]"
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              loading={savingProfile}
              disabled={!profile.fullName.trim() || !profile.email.trim()}
            >
              Save personal details
            </Button>
          </form>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between border-b border-rule pb-2">
            <h2 className="edge">Plan and panel</h2>
            <span className="font-mono text-[10px] text-ink-4">ACCESS</span>
          </div>
          <div className="space-y-3 border border-rule bg-paper p-4 text-[13px] text-ink-2">
            <div className="flex justify-between gap-4">
              <span className="text-ink-4">Plan</span>
              <span>{account.plan ? account.plan.toLowerCase() : 'No active plan'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ink-4">Panel</span>
              <span>{account.hasPanel ? 'Created' : 'Not created yet'}</span>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
              {!account.subscriptionActive && (
                <Link
                  to="/explore/pricing"
                  className="inline-flex h-8 items-center rounded-sm bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2"
                >
                  View plans
                </Link>
              )}
              {!account.hasPanel && account.subscriptionActive && (
                <Link
                  to="/setup-panel"
                  className="inline-flex h-8 items-center rounded-sm bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2"
                >
                  Set up panel
                </Link>
              )}
              {account.hasPanel && (
                <Link
                  to="/app"
                  className="inline-flex h-8 items-center rounded-sm bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2"
                >
                  Open panel
                </Link>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between border-b border-rule pb-2">
            <h2 className="edge">
              {account.user.hasPassword ? 'Change password' : 'Add a password'}
            </h2>
            <span className="font-mono text-[10px] text-ink-4">SECURITY</span>
          </div>
          <form onSubmit={changePassword} className="space-y-4">
            {passwordError && <InlineError message={passwordError} />}
            {!account.user.hasPassword && (
              <Notice tone="info">
                You currently sign in with Google. Adding a password gives you another way to sign
                in without disconnecting Google.
              </Notice>
            )}
            {account.user.hasPassword && (
              <Field label="Current password" htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) =>
                    setPasswords({ ...passwords, currentPassword: event.target.value })
                  }
                  required
                />
              </Field>
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
                required
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-password" required>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={passwords.confirmPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, confirmPassword: event.target.value })
                }
                required
              />
            </Field>
            <Button
              type="submit"
              loading={changingPassword}
              disabled={
                passwords.newPassword.length < 8 ||
                (account.user.hasPassword && !passwords.currentPassword)
              }
            >
              {account.user.hasPassword ? 'Change password' : 'Add password'}
            </Button>
          </form>
        </section>

        <section className="space-y-3 border-t border-rule pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="title text-[13.5px]">Log out</p>
              <p className="mt-1 text-[12px] text-ink-3">End this session on this device.</p>
            </div>
            <Button onClick={() => void logOut()}>Log out</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
            <div className="max-w-[300px]">
              <p className="title text-[13.5px] text-alert">Delete account</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
                Permanently remove your login and personal account data.
              </p>
            </div>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          </div>
        </section>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        title="Delete your account?"
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
            Your account and access will be removed immediately. The email address can then be used
            to create a new account.
          </Notice>
          {account.user.hasPassword ? (
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
              hint={account.user.email}
              required
            >
              <Input
                id="delete-email"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={account.user.email}
              />
            </Field>
          )}
        </div>
      </Modal>
    </AuthLayout>
  );
}
