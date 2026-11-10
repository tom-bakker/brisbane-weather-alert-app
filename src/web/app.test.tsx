import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {App} from './app';
import {SignInError} from './data/api';
import {useApi} from './data/api_context';
import {FakeApi, renderWithApi} from './test_api';

describe('App sign-in flow', () => {
  it('signs in with email and password', async () => {
    const api = new FakeApi();
    api.step = {kind: 'signed_out'};
    renderWithApi(<App />, api);

    await userEvent.type(
      await screen.findByLabelText('Email'),
      ' admin@example.com ',
    );
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', {name: 'Sign in'}));

    expect(api.signIn).toHaveBeenCalledWith('admin@example.com', 'pw');
  });

  it('shows a generic message for an unexpected sign-in error', async () => {
    const api = new FakeApi();
    api.step = {kind: 'signed_out'};
    api.signIn.mockRejectedValueOnce(new Error('boom'));
    renderWithApi(<App />, api);

    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', {name: 'Sign in'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in failed. Please try again.',
    );
  });

  it.each([
    ['credentials', 'Check your email and password.'],
    ['unconfirmed', 'This account has not been confirmed.'],
    ['rate_limited', 'Too many sign-in attempts.'],
    ['unreachable', 'Could not reach the sign-in service.'],
    ['unknown', 'Sign-in failed. Please try again.'],
  ] as const)('explains a %s sign-in failure', async (reason, text) => {
    const api = new FakeApi();
    api.step = {kind: 'signed_out'};
    api.signIn.mockRejectedValueOnce(new SignInError(reason, 'x'));
    renderWithApi(<App />, api);

    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', {name: 'Sign in'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('makes a new admin enrol an authenticator, then lets them in', async () => {
    const api = new FakeApi();
    api.step = {kind: 'enrol_mfa'};
    renderWithApi(<App />, api);

    await userEvent.click(
      await screen.findByRole('button', {name: 'Set up authenticator'}),
    );
    expect(
      screen.getByRole('img', {name: 'QR code for your authenticator app'}),
    ).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();

    api.step = {kind: 'signed_in', email: 'admin@example.com', role: 'admin'};
    await userEvent.type(screen.getByLabelText('6-digit code'), '123 456');
    await userEvent.click(screen.getByRole('button', {name: 'Verify'}));

    expect(api.verifyMfa).toHaveBeenCalledWith('f1', '123456');
    expect(
      await screen.findByRole('navigation', {name: 'Main'}),
    ).toBeInTheDocument();
  });

  it('reports a failed enrolment start', async () => {
    const api = new FakeApi();
    api.step = {kind: 'enrol_mfa'};
    api.enrolMfa.mockRejectedValueOnce(new Error('MFA disabled'));
    renderWithApi(<App />, api);

    await userEvent.click(
      await screen.findByRole('button', {name: 'Set up authenticator'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('MFA disabled');
  });

  it('asks a returning admin for a code and rejects a bad one', async () => {
    const api = new FakeApi();
    api.step = {kind: 'verify_mfa', factorId: 'f9'};
    api.verifyMfa.mockRejectedValueOnce(new Error('Invalid TOTP code'));
    renderWithApi(<App />, api);

    await userEvent.type(
      await screen.findByLabelText('6-digit code'),
      '000000',
    );
    await userEvent.click(screen.getByRole('button', {name: 'Verify'}));

    expect(api.verifyMfa).toHaveBeenCalledWith('f9', '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code did not work',
    );
    await userEvent.click(
      screen.getByRole('button', {name: 'Cancel and sign out'}),
    );
    expect(api.signOut).toHaveBeenCalled();
  });

  it('turns away a signed-in user who was never invited', async () => {
    const api = new FakeApi();
    api.step = {kind: 'not_authorised', email: 'someone@example.com'};
    renderWithApi(<App />, api);

    expect(
      await screen.findByText(
        /someone@example\.com does not have access to this app/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Sign out'}));
    expect(api.signOut).toHaveBeenCalled();
  });

  it('re-checks the auth step when Supabase reports a change', async () => {
    const api = new FakeApi();
    renderWithApi(<App />, api);
    await screen.findByRole('navigation', {name: 'Main'});

    api.step = {kind: 'signed_out'};
    api.emitAuthChange();

    expect(
      await screen.findByRole('button', {name: 'Sign in'}),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry when the auth check fails', async () => {
    const api = new FakeApi();
    api.authStep.mockRejectedValueOnce(new Error('Network down'));
    renderWithApi(<App />, api);

    expect(await screen.findByText('Network down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Try again'}));
    expect(
      await screen.findByRole('navigation', {name: 'Main'}),
    ).toBeInTheDocument();
  });
});

describe('App navigation', () => {
  it('moves between pages and signs out', async () => {
    const api = new FakeApi();
    renderWithApi(<App />, api);
    const nav = await screen.findByRole('navigation', {name: 'Main'});
    expect(screen.getByRole('button', {name: 'Dashboard'})).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(screen.getByRole('button', {name: 'Settings'}));
    expect(
      await screen.findByRole('heading', {name: 'Email sections'}),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Mail groups'}));
    expect(
      await screen.findByRole('heading', {name: 'Mail groups'}),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Email audit'}));
    expect(
      await screen.findByRole('heading', {name: 'Email audit'}),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Alerts'}));
    expect(
      await screen.findByRole('heading', {name: 'Alerts'}),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Dashboard'}));
    await waitFor(() => expect(api.loadDashboard).toHaveBeenCalledTimes(2));

    expect(nav).toBeInTheDocument();
    expect(screen.getByText(/Advisory only/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Sign out'}));
    expect(api.signOut).toHaveBeenCalled();
  });
});

describe('Leaving unsaved email sections', () => {
  async function editSection(api: FakeApi) {
    renderWithApi(<App />, api);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Settings'}),
    );
    await userEvent.type(await screen.findByLabelText('Title'), ' x');
  }

  it('asks before leaving, and stays when told to', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = new FakeApi();
    await editSection(api);

    await userEvent.click(screen.getByRole('button', {name: 'Dashboard'}));
    expect(confirm).toHaveBeenCalledWith(
      'You have unsaved changes. Leave this page and discard them?',
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Wind gust x');
    await userEvent.click(screen.getByRole('button', {name: 'Sign out'}));
    expect(api.signOut).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', {name: 'Alerts'}));
    expect(
      await screen.findByRole('heading', {name: 'Alerts'}),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('warns the browser on reload only while edits are unsaved', async () => {
    const api = new FakeApi();
    renderWithApi(<App />, api);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Settings'}),
    );
    const clean = new Event('beforeunload', {cancelable: true});
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await userEvent.type(await screen.findByLabelText('Title'), ' x');
    const dirty = new Event('beforeunload', {cancelable: true});
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('does not ask when nothing is unsaved', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderWithApi(<App />, new FakeApi());
    await userEvent.click(
      await screen.findByRole('button', {name: 'Settings'}),
    );
    await userEvent.click(screen.getByRole('button', {name: 'Alerts'}));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe('App invite and reset links', () => {
  it('has an invited user choose a password, then moves on', async () => {
    const api = new FakeApi();
    api.step = {
      kind: 'set_password',
      email: 'jo@example.com',
      intent: 'invite',
    };
    renderWithApi(<App />, api);

    expect(
      await screen.findByRole('heading', {name: 'Welcome aboard'}),
    ).toBeInTheDocument();
    expect(screen.getByText('jo@example.com')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('New password'), 'short');
    expect(screen.getByText('Strength: Too short')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Save password'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use at least 12 characters.',
    );
    expect(api.setPassword).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('New password'), 'Er-Long-9!');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'shortEr-Long-9!',
    );
    expect(screen.getByText('Strength: Good')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New password'), 'x');
    expect(screen.getByText('Strength: Strong')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Confirm password'), 'x');
    api.step = {kind: 'enrol_mfa'};
    await userEvent.click(screen.getByRole('button', {name: 'Save password'}));
    expect(api.setPassword).toHaveBeenCalledWith('shortEr-Long-9!x');
    expect(
      await screen.findByRole('button', {name: 'Set up authenticator'}),
    ).toBeInTheDocument();
  });

  it('refuses mismatched passwords and shows server errors', async () => {
    const api = new FakeApi();
    api.step = {
      kind: 'set_password',
      email: 'jo@example.com',
      intent: 'recovery',
    };
    api.setPassword.mockRejectedValueOnce(new Error('Password is too common'));
    renderWithApi(<App />, api);

    await screen.findByRole('heading', {name: 'Choose a new password'});
    await userEvent.type(screen.getByLabelText('New password'), 'abcdefghijkl');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'abcdefghijkm',
    );
    await userEvent.click(screen.getByRole('button', {name: 'Save password'}));
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');

    await userEvent.clear(screen.getByLabelText('Confirm password'));
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'abcdefghijkl',
    );
    expect(screen.getByText('Strength: Weak')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Save password'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password is too common',
    );
    await userEvent.click(
      screen.getByRole('button', {name: 'Cancel and sign out'}),
    );
    expect(api.signOut).toHaveBeenCalled();
  });

  it('explains an expired link on the sign-in screen', async () => {
    const api = new FakeApi();
    api.step = {kind: 'signed_out', linkError: 'This link has expired.'};
    renderWithApi(<App />, api);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This link has expired.',
    );
  });

  it('shows the signed-in role in the header', async () => {
    const api = new FakeApi();
    api.step = {
      kind: 'signed_in',
      email: 'sam@example.com',
      role: 'power_user',
    };
    renderWithApi(<App />, api);
    await screen.findByRole('navigation', {name: 'Main'});
    expect(screen.getByText('Power user')).toBeInTheDocument();
  });
});

describe('useApi', () => {
  it('fails loudly outside a provider', () => {
    function Orphan() {
      useApi();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      'useApi must be used inside an ApiProvider',
    );
  });
});
