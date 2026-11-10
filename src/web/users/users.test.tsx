import {screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {SettingsPage} from '../settings/settings_page';
import {FakeApi, makeUser, renderWithApi} from '../test_api';
import {hashIndex, initials} from './role_badge';
import {UserAuditPage} from './user_audit_page';
import {UsersPage} from './users_page';

async function openUsers(api = new FakeApi()) {
  renderWithApi(<UsersPage currentEmail="admin@example.com" />, api);
  await screen.findByText('sam@example.com');
  return api;
}

function rowFor(email: string) {
  const item = screen.getByText(email).closest('li');
  if (item === null) throw new Error(`no row for ${email}`);
  return within(item);
}

describe('Settings tabs by role', () => {
  it('shows Users and User audit to admins only', async () => {
    renderWithApi(
      <SettingsPage user={{email: 'admin@example.com', role: 'admin'}} />,
    );
    const tabs = await screen.findByRole('navigation', {name: 'Settings'});
    await userEvent.click(within(tabs).getByRole('button', {name: 'Users'}));
    expect(
      await screen.findByRole('heading', {name: 'Users'}),
    ).toBeInTheDocument();
    await userEvent.click(
      within(tabs).getByRole('button', {name: 'User audit'}),
    );
    expect(
      await screen.findByRole('heading', {name: 'User audit'}),
    ).toBeInTheDocument();
  });

  it('hides them from power users', async () => {
    renderWithApi(
      <SettingsPage user={{email: 'sam@example.com', role: 'power_user'}} />,
    );
    const tabs = await screen.findByRole('navigation', {name: 'Settings'});
    expect(
      within(tabs).queryByRole('button', {name: 'Users'}),
    ).not.toBeInTheDocument();
    expect(
      within(tabs).queryByRole('button', {name: 'User audit'}),
    ).not.toBeInTheDocument();
    expect(
      within(tabs).getByRole('button', {name: 'Mail groups'}),
    ).toBeInTheDocument();
  });
});

describe('UsersPage', () => {
  it('lists users with role and status, but never a password', async () => {
    const api = new FakeApi();
    api.users.push(
      makeUser({id: 'u3', email: 'new@example.com', emailConfirmed: false}),
      makeUser({id: 'u4', email: 'half@example.com', mfaEnrolled: false}),
    );
    await openUsers(api);
    expect(rowFor('new@example.com').getByText('Invite sent')).toBeVisible();
    expect(
      rowFor('half@example.com').getByText('MFA not set up'),
    ).toBeVisible();
    expect(rowFor('sam@example.com').getByText('Active')).toBeVisible();
    expect(rowFor('admin@example.com').getByText('You')).toBeVisible();
    expect(screen.queryByText(/password:/i)).not.toBeInTheDocument();
    expect(
      screen.getByText('Awaiting set-up').previousSibling,
    ).toHaveTextContent('2');
  });

  it('invites a user with the chosen role', async () => {
    const api = await openUsers();
    await userEvent.type(
      screen.getByLabelText('Email address'),
      'jo@example.com',
    );
    await userEvent.click(screen.getByRole('radio', {name: /^Admin/}));
    await userEvent.click(screen.getByRole('button', {name: 'Send invite'}));
    expect(api.inviteUser).toHaveBeenCalledWith('jo@example.com', 'admin');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Invitation sent to jo@example.com as Admin.',
    );
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(api.listUsers).toHaveBeenCalledTimes(2);
  });

  it('defaults invites to power user and rejects a bad email', async () => {
    const api = await openUsers();
    expect(screen.getByRole('radio', {name: /^Power user/})).toBeChecked();
    await userEvent.type(screen.getByLabelText('Email address'), 'nope');
    await userEvent.click(screen.getByRole('button', {name: 'Send invite'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid email address.',
    );
    expect(api.inviteUser).not.toHaveBeenCalled();
  });

  it('keeps the email and shows the reason when an invite fails', async () => {
    const api = new FakeApi();
    api.inviteUser.mockRejectedValueOnce(
      new Error('That email already has an account.'),
    );
    await openUsers(api);
    await userEvent.type(
      screen.getByLabelText('Email address'),
      'sam@example.com',
    );
    await userEvent.click(screen.getByRole('button', {name: 'Send invite'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email already has an account.',
    );
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'sam@example.com',
    );
  });

  it.each([
    [
      'Reset password for sam@example.com',
      'Send reset email',
      'resetUserPassword',
      'Password reset email sent to sam@example.com.',
    ],
    [
      'Reset MFA for sam@example.com',
      'Reset MFA',
      'resetUserMfa',
      'MFA reset for sam@example.com.',
    ],
    [
      'Remove sam@example.com',
      'Remove user',
      'removeUser',
      'sam@example.com has been removed.',
    ],
  ] as const)('%s after confirming', async (button, yes, method, done) => {
    const api = await openUsers();
    await userEvent.click(screen.getByRole('button', {name: button}));
    const confirm = screen.getByRole('group', {name: 'Confirm'});
    await userEvent.click(within(confirm).getByRole('button', {name: yes}));
    expect(api[method]).toHaveBeenCalledWith('u2');
    expect(await screen.findByRole('status')).toHaveTextContent(done);
    expect(
      screen.queryByRole('group', {name: 'Confirm'}),
    ).not.toBeInTheDocument();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const api = await openUsers();
    await userEvent.click(
      screen.getByRole('button', {name: 'Remove sam@example.com'}),
    );
    await userEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(api.removeUser).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('group', {name: 'Confirm'}),
    ).not.toBeInTheDocument();
  });

  it('changes a role', async () => {
    const api = await openUsers();
    await userEvent.selectOptions(
      screen.getByLabelText('Role for sam@example.com'),
      'admin',
    );
    expect(api.setUserRole).toHaveBeenCalledWith('u2', 'admin');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'sam@example.com is now Admin.',
    );
  });

  it('stops an admin removing or demoting themselves', async () => {
    await openUsers();
    expect(
      screen.getByRole('button', {name: 'Remove admin@example.com'}),
    ).toBeDisabled();
    expect(screen.getByLabelText('Role for admin@example.com')).toBeDisabled();
  });

  it('only offers an MFA reset once an authenticator exists', async () => {
    const api = new FakeApi();
    api.users[1] = makeUser({
      id: 'u2',
      email: 'sam@example.com',
      mfaEnrolled: false,
    });
    await openUsers(api);
    expect(
      screen.getByRole('button', {name: 'Reset MFA for sam@example.com'}),
    ).toBeDisabled();
  });

  it('shows a failed action', async () => {
    const api = new FakeApi();
    api.resetUserPassword.mockRejectedValueOnce(new Error('SMTP down'));
    await openUsers(api);
    await userEvent.click(
      screen.getByRole('button', {name: 'Reset password for sam@example.com'}),
    );
    await userEvent.click(
      screen.getByRole('button', {name: 'Send reset email'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('SMTP down');
  });

  it('shows a load failure', async () => {
    const api = new FakeApi();
    api.listUsers.mockRejectedValueOnce(
      new Error('Only an admin can list users.'),
    );
    renderWithApi(<UsersPage currentEmail="x@y.z" />, api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only an admin can list users.',
    );
  });
});

describe('UserAuditPage', () => {
  function entry(id: number, action: 'user_invited' | 'email_confirmed') {
    const invited = action === 'user_invited';
    return {
      id,
      occurredAt: '2026-11-10T02:00:00Z',
      action,
      actorEmail: invited ? 'admin@example.com' : 'sam@example.com',
      targetEmail: 'sam@example.com',
      detail: invited ? 'Invited as Power user' : 'Accepted the invitation',
    };
  }

  it('lists what happened, to whom, by whom and when', async () => {
    const api = new FakeApi();
    api.userAudit = [entry(2, 'email_confirmed'), entry(1, 'user_invited')];
    renderWithApi(<UserAuditPage />, api);
    expect(await screen.findByText('User added')).toBeInTheDocument();
    const list = within(screen.getByRole('list'));
    expect(list.getByText('Email confirmed')).toBeInTheDocument();
    expect(
      screen.getByText('Invited as Power user · by admin@example.com'),
    ).toBeInTheDocument();
    // A self-service row doesn't repeat the user as the actor.
    expect(screen.getByText('Accepted the invitation')).toBeInTheDocument();
    expect(
      screen.getAllByText('2026-11-10 12:00 AEST / 02:00 UTC'),
    ).toHaveLength(2);
  });

  it('filters by action and pages', async () => {
    const api = new FakeApi();
    api.userAudit = Array.from({length: 30}, (_, i) =>
      entry(i, 'user_invited'),
    );
    renderWithApi(<UserAuditPage />, api);
    expect(
      await screen.findByText('Page 1 of 2 (30 entries)'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: /Older/}));
    expect(
      await screen.findByText('Page 2 of 2 (30 entries)'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: /Newer/}));
    await userEvent.selectOptions(
      screen.getByLabelText('Action'),
      'email_confirmed',
    );
    expect(api.loadUserAudit).toHaveBeenLastCalledWith({
      action: 'email_confirmed',
      page: 0,
      pageSize: 25,
    });
    expect(
      await screen.findByText('Nothing recorded yet.'),
    ).toBeInTheDocument();
  });
});

describe('avatar helpers', () => {
  it('makes initials from the email name', () => {
    expect(initials('sam.nguyen@example.com')).toBe('SN');
    expect(initials('ops@example.com')).toBe('OP');
    expect(initials('@example.com')).toBe('?');
  });

  it('picks a stable colour index', () => {
    expect(hashIndex('a@b.co', 6)).toBe(hashIndex('a@b.co', 6));
    expect(hashIndex('a@b.co', 6)).toBeLessThan(6);
  });
});
