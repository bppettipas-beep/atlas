import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, Field, InlineError, Input, LoadingState, Modal, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export function PublicAccountPage() {
  const { account, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (loading) return <LoadingState className="h-screen" label="Loading…" />;
  if (!account) return <Navigate to="/signin" replace />;

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
      sheet="Account"
      drawingNo="A-03"
      title={account.user.fullName}
      description={account.user.email}
    >
      <div className="space-y-6 text-[13px] text-ink-2">
        <div className="space-y-2 border-b border-rule pb-6">
          <p>Plan: {account.plan ? account.plan.toLowerCase() : 'Free account'}</p>
          <p>Panel: {account.hasPanel ? 'Created' : 'Not created yet'}</p>
        </div>
        {!account.hasPanel && account.subscriptionActive && (
          <Link
            to="/setup-panel"
            className="inline-flex h-9 items-center rounded-sm bg-ink px-4 font-medium text-white"
          >
            Set up panel
          </Link>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void logOut()}>Log out</Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
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
