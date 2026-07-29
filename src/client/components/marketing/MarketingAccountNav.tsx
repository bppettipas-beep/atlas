import { useNavigate } from 'react-router-dom';
import { ArrowRight, Gear, SignOut, User } from '@/components/icons';
import { Avatar, Menu, MenuDivider, MenuItem } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

export function MarketingAccountNav() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();

  if (!account) {
    return (
      <>
        <button
          className="px-2 py-1.5 text-[13px] font-medium text-ink-2"
          onClick={() => navigate('/signin')}
        >
          Sign in
        </button>
        <button
          className="inline-flex h-8 items-center rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white"
          onClick={() => navigate('/signup/owner')}
        >
          Sign up
        </button>
      </>
    );
  }

  const panelHref = account.hasPanel ? '/app' : '/setup-panel';
  const showPanelAction = account.hasPanel || account.subscriptionActive;

  return (
    <>
      {showPanelAction && (
        <button
          type="button"
          onClick={() => navigate(panelHref)}
          className="group inline-flex h-8 items-center gap-2 rounded-sm bg-ink px-3.5 text-[13px] font-medium text-white"
        >
          {account.hasPanel ? 'Open panel' : 'Set up panel'}
          <ArrowRight className="text-[12px] transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
      <Menu
        align="right"
        openOnHover
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Account menu"
            className="rounded-sm border border-edge p-0.5 hover:border-edgeStrong"
          >
            <Avatar name={account.user.fullName} src={account.user.avatarUrl} size="sm" />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <MenuItem
              icon={<User />}
              onClick={() => {
                close();
                navigate('/account-settings');
              }}
            >
              Profile
            </MenuItem>
            <MenuItem
              icon={<Gear />}
              onClick={() => {
                close();
                navigate('/account-settings');
              }}
            >
              Settings
            </MenuItem>
            <MenuDivider />
            <MenuItem
              danger
              icon={<SignOut />}
              onClick={() => void signOut().then(() => navigate('/'))}
            >
              Log out
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
}
