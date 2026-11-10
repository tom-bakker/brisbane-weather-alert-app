import {screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {makeAlert} from '../domain/test_fixtures';
import type {EmailAuditEntry, FeedLogEntry} from '../domain/types';
import {AlertsPage} from './alerts/alerts_page';
import {AuditPage} from './audit/audit_page';
import {SHARED_RUN_WINDOW_MS} from './audit/resend_button';
import {readWebConfig} from './config';
import {isValidEmail, latestPerSource} from './data/api';
import {FakeApi, renderWithApi} from './test_api';

function auditRow(
  id: number,
  overrides: Partial<EmailAuditEntry> = {},
): EmailAuditEntry {
  return {
    id,
    sentAt: '2026-11-09T12:00:00Z',
    groupId: 'g',
    groupName: 'Ramp supervisors',
    recipients: ['a@x.com', 'b@x.com'],
    subject: `[WATCH] Wind gust 27 kt at Brisbane (YBBN) #${id}`,
    body: 'Watch: Wind gust at Brisbane (YBBN).',
    alertId: 'x',
    airport: 'YBBN',
    category: 'wind',
    level: 'watch',
    event: 'raised',
    status: 'sent',
    error: null,
    resendOf: null,
    ...overrides,
  };
}

describe('AuditPage', () => {
  it('lists sent and failed emails', async () => {
    const api = new FakeApi();
    api.audit = [
      auditRow(1),
      auditRow(2, {status: 'failed', error: 'SMTP 535 bad credentials'}),
    ];
    renderWithApi(<AuditPage />, api);

    expect(await screen.findByText(/#1$/)).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: 'Sent'})).toBeInTheDocument();
    expect(
      screen.getByText('Failed: SMTP 535 bad credentials'),
    ).toBeInTheDocument();
    expect(screen.getAllByTitle('a@x.com, b@x.com')[0]).toHaveTextContent('2');
    expect(screen.getByText('Page 1 of 1 (2 emails)')).toBeInTheDocument();
  });

  it('filters by status and pages through results', async () => {
    const api = new FakeApi();
    api.audit = Array.from({length: 30}, (_, i) => auditRow(i + 1));
    renderWithApi(<AuditPage />, api);

    expect(
      await screen.findByText('Page 1 of 2 (30 emails)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Newer'})).toBeDisabled();
    await userEvent.click(screen.getByRole('button', {name: 'Older'}));
    expect(
      await screen.findByText('Page 2 of 2 (30 emails)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Older'})).toBeDisabled();
    await userEvent.click(screen.getByRole('button', {name: 'Newer'}));
    expect(
      await screen.findByText('Page 1 of 2 (30 emails)'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'Older'}));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'failed');
    expect(api.loadAudit).toHaveBeenLastCalledWith({
      status: 'failed',
      page: 0,
      pageSize: 25,
    });
    expect(await screen.findByText('No emails recorded.')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 (0 emails)')).toBeInTheDocument();
  });

  describe('resend', () => {
    let api: FakeApi;
    let confirm: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      api = new FakeApi();
      api.audit = [auditRow(1), auditRow(2, {resendOf: 1})];
      confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => confirm.mockRestore());

    const resendButton = async (id: number) =>
      screen.findByRole('button', {
        name: `Resend [WATCH] Wind gust 27 kt at Brisbane (YBBN) #${id}`,
      });

    it('marks resent copies', async () => {
      renderWithApi(<AuditPage />, api);
      await resendButton(1);
      expect(screen.getAllByText('Resent copy')).toHaveLength(1);
    });

    it('queues a resend after confirming and starts a run', async () => {
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(1));

      expect(confirm).toHaveBeenCalledWith(
        'Resend this email to its 2 original recipients?',
      );
      expect(api.resendEmail).toHaveBeenCalledWith(1);
      expect(api.refreshFeeds).toHaveBeenCalled();
      expect(
        await screen.findByText('Queued. Sends in a few minutes.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {name: /#1$/}),
      ).not.toBeInTheDocument();
    });

    it('asks for one run for several resends in a row', async () => {
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(1));
      await userEvent.click(await resendButton(2));
      expect(api.resendEmail).toHaveBeenCalledTimes(2);
      expect(api.refreshFeeds).toHaveBeenCalledTimes(1);
      expect(
        await screen.findAllByText('Queued. Sends in a few minutes.'),
      ).toHaveLength(2);
    });

    it('shares a run request that is still in flight', async () => {
      let finish = () => {};
      api.refreshFeeds.mockImplementationOnce(
        () => new Promise<void>((resolve) => (finish = resolve)),
      );
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(1));
      await userEvent.click(await resendButton(2));
      expect(api.resendEmail).toHaveBeenCalledTimes(2);
      expect(api.refreshFeeds).toHaveBeenCalledTimes(1);
      finish();
      expect(
        await screen.findAllByText('Queued. Sends in a few minutes.'),
      ).toHaveLength(2);
    });

    it('asks for a new run once the shared window has passed', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(1));
      now.mockReturnValue(1_000_000 + SHARED_RUN_WINDOW_MS);
      await userEvent.click(await resendButton(2));
      expect(api.refreshFeeds).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });

    it('does nothing when the admin cancels', async () => {
      confirm.mockReturnValue(false);
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(1));
      expect(api.resendEmail).not.toHaveBeenCalled();
    });

    it('waits for the next scheduled run when one cannot be started', async () => {
      api.refreshFeeds.mockRejectedValueOnce(new Error('Not authorised'));
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(1));
      expect(
        await screen.findByText(
          'Queued. Sends on the next scheduled run (within 10 minutes).',
        ),
      ).toBeInTheDocument();
    });

    it('shows why a resend could not be queued', async () => {
      api.resendEmail.mockRejectedValueOnce(
        new Error('A resend of this email is already queued.'),
      );
      renderWithApi(<AuditPage />, api);
      await userEvent.click(await resendButton(2));
      expect(
        await screen.findByText('A resend of this email is already queued.'),
      ).toBeInTheDocument();
      expect(api.refreshFeeds).not.toHaveBeenCalled();
      expect(await resendButton(2)).toBeEnabled();
    });
  });
});

describe('AlertsPage', () => {
  it('shows active and cleared alerts with their peak', async () => {
    const api = new FakeApi();
    api.history = [
      makeAlert({id: '1'}),
      makeAlert({
        id: '2',
        airport: 'YBCS',
        level: 'watch',
        peakLevel: 'standdown',
        status: 'cleared',
        clearedAt: '2026-11-09T14:00:00Z',
      }),
      makeAlert({
        id: '3',
        status: 'cleared',
        clearedAt: null,
        updatedAt: '2026-11-09T13:00:00Z',
      }),
    ];
    renderWithApi(<AlertsPage />, api);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Cairns')).toBeInTheDocument();
    expect(screen.getByText('Stand-down')).toBeInTheDocument();
    expect(
      screen.getByText('Cleared 2026-11-10 00:00 AEST / 14:00 UTC'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cleared 2026-11-09 23:00 AEST / 13:00 UTC'),
    ).toBeInTheDocument();
    expect(api.loadAlertHistory).toHaveBeenCalledWith(200);
  });

  it('shows an empty state', async () => {
    renderWithApi(<AlertsPage />, new FakeApi());
    expect(await screen.findByText('No alerts yet.')).toBeInTheDocument();
  });
});

describe('web helpers', () => {
  it('reads the build config', () => {
    expect(readWebConfig({})).toBeNull();
    expect(
      readWebConfig({
        VITE_SUPABASE_URL: 'u',
        VITE_SUPABASE_PUBLISHABLE_KEY: ' ',
      }),
    ).toBeNull();
    expect(
      readWebConfig({
        VITE_SUPABASE_URL: ' u ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toEqual({
      supabaseUrl: 'u',
      supabasePublishableKey: 'k',
    });
  });

  it('keeps the latest run per feed', () => {
    const run = (source: string, runAt: string): FeedLogEntry => ({
      source,
      runAt,
      ok: true,
      records: 1,
      error: null,
    });
    expect(
      latestPerSource([
        run('b', '2026-11-09T12:00Z'),
        run('a', '2026-11-09T11:00Z'),
        run('b', '2026-11-09T13:00Z'),
        run('b', '2026-11-09T10:00Z'),
      ]),
    ).toEqual([run('a', '2026-11-09T11:00Z'), run('b', '2026-11-09T13:00Z')]);
  });

  it('checks email addresses loosely', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
});
