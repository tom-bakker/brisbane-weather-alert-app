// @vitest-environment node
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe, expect, it, vi} from 'vitest';
import {createSupabaseApi, unwrap} from './supabase_api';

interface Call {
  table: string;
  steps: [string, unknown[]][];
}

type QueryResult = {
  data: unknown;
  error: {message: string} | null;
  count?: number;
};

/** Supabase stand-in: records query chains; auth methods are spies. */
function fakeSupabase(results: Record<string, QueryResult[]> = {}) {
  const calls: Call[] = [];
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({
      data: {session: {user: {email: 'admin@example.com'}}},
    })),
    signInWithPassword: vi.fn(async () => ({
      data: {},
      error: null as {message: string; code?: string; status?: number} | null,
    })),
    signOut: vi.fn(async () => ({error: null})),
    onAuthStateChange: vi.fn((cb: () => void) => {
      cb();
      return {data: {subscription: {unsubscribe}}};
    }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({
        data: {currentLevel: 'aal2'},
        error: null,
      })),
      listFactors: vi.fn(async () => ({
        data: {
          totp: [] as {id: string; status: string}[],
          all: [] as {id: string; status: string}[],
        },
        error: null,
      })),
      unenroll: vi.fn(async () => ({data: {}, error: null})),
      enroll: vi.fn(async () => ({
        data: {
          id: 'f1',
          totp: {qr_code: 'data:image/svg+xml,<svg/>', secret: 'S3CRET'},
        },
        error: null,
      })),
      challengeAndVerify: vi.fn(async () => ({data: {}, error: null})),
    },
  };
  const rpc = vi.fn(async () => ({data: true, error: null}));
  const from = (table: string) => {
    const call: Call = {table, steps: []};
    calls.push(call);
    const chain: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const result = results[table]?.shift() ?? {data: [], error: null};
            return (resolve: (v: unknown) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            call.steps.push([prop, args]);
            return chain;
          };
        },
      },
    );
    return chain;
  };
  const functions = {
    invoke: vi.fn(
      async (): Promise<{
        data: unknown;
        error: {message: string; context?: unknown} | null;
      }> => ({data: {}, error: null}),
    ),
  };
  const sb = {auth, rpc, from, functions} as unknown as SupabaseClient;
  return {sb, auth, rpc, calls, unsubscribe, functions};
}

const steps = (call: Call | undefined) =>
  call?.steps.map((s) => s[0]).join('.');

describe('unwrap', () => {
  it('returns data or throws the error message', () => {
    expect(unwrap({data: 1, error: null})).toBe(1);
    expect(() => unwrap({data: null, error: {message: 'nope'}})).toThrow(
      'nope',
    );
  });
});

describe('createSupabaseApi auth', () => {
  it('reports signed out without a session', async () => {
    const f = fakeSupabase();
    f.auth.getSession.mockResolvedValueOnce({data: {session: null}} as never);
    expect(await createSupabaseApi(f.sb).authStep()).toEqual({
      kind: 'signed_out',
    });
  });

  it('asks for enrolment when there is no verified factor', async () => {
    const f = fakeSupabase();
    f.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: {currentLevel: 'aal1'},
      error: null,
    });
    f.auth.mfa.listFactors.mockResolvedValueOnce({
      data: {totp: [{id: 'u', status: 'unverified'}], all: []},
      error: null,
    });
    expect(await createSupabaseApi(f.sb).authStep()).toEqual({
      kind: 'enrol_mfa',
    });
  });

  it('asks for a code when a verified factor exists', async () => {
    const f = fakeSupabase();
    f.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: {currentLevel: 'aal1'},
      error: null,
    });
    f.auth.mfa.listFactors.mockResolvedValueOnce({
      data: {totp: [{id: 'v', status: 'verified'}], all: []},
      error: null,
    });
    expect(await createSupabaseApi(f.sb).authStep()).toEqual({
      kind: 'verify_mfa',
      factorId: 'v',
    });
  });

  it('lets in the listed admin and turns away anyone else', async () => {
    const f = fakeSupabase();
    const api = createSupabaseApi(f.sb);
    expect(await api.authStep()).toEqual({
      kind: 'signed_in',
      email: 'admin@example.com',
    });
    f.rpc.mockResolvedValueOnce({data: false, error: null});
    expect(await api.authStep()).toEqual({
      kind: 'not_admin',
      email: 'admin@example.com',
    });
    expect(f.rpc).toHaveBeenCalledWith('is_admin');
  });

  it('copes with a session user without an email', async () => {
    const f = fakeSupabase();
    f.auth.getSession.mockResolvedValueOnce({
      data: {session: {user: {}}},
    } as never);
    expect(await createSupabaseApi(f.sb).authStep()).toEqual({
      kind: 'signed_in',
      email: '',
    });
  });

  it('signs in and out and surfaces sign-in errors', async () => {
    const f = fakeSupabase();
    const api = createSupabaseApi(f.sb);
    await api.signIn('a@b.co', 'pw');
    expect(f.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pw',
    });
    f.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: {
        message: 'Invalid login credentials',
        code: 'invalid_credentials',
        status: 400,
      },
    });
    await expect(api.signIn('a@b.co', 'bad')).rejects.toMatchObject({
      name: 'SignInError',
      reason: 'credentials',
      message: 'Invalid login credentials',
    });
    await api.signOut();
    expect(f.auth.signOut).toHaveBeenCalled();
  });

  it('subscribes to auth changes and can unsubscribe', () => {
    const f = fakeSupabase();
    const listener = vi.fn();
    const stop = createSupabaseApi(f.sb).onAuthChange(listener);
    expect(listener).toHaveBeenCalled();
    stop();
    expect(f.unsubscribe).toHaveBeenCalled();
  });

  it('enrols TOTP after clearing unfinished factors, then verifies', async () => {
    const f = fakeSupabase();
    f.auth.mfa.listFactors.mockResolvedValueOnce({
      data: {
        totp: [],
        all: [
          {id: 'old', status: 'unverified'},
          {id: 'keep', status: 'verified'},
        ],
      },
      error: null,
    });
    const api = createSupabaseApi(f.sb);

    expect(await api.enrolMfa()).toEqual({
      factorId: 'f1',
      qrCode: 'data:image/svg+xml,<svg/>',
      secret: 'S3CRET',
    });
    expect(f.auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(f.auth.mfa.unenroll).toHaveBeenCalledWith({factorId: 'old'});
    expect(f.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Admin authenticator',
    });

    await api.verifyMfa('f1', '123456');
    expect(f.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'f1',
      code: '123456',
    });
  });
});

describe('createSupabaseApi data', () => {
  const alertRow = {
    id: 'a',
    airport: 'YBBN',
    category: 'wind',
    level: 'watch',
    peak_level: 'watch',
    status: 'active',
    trigger_value: '27 kt',
    message: 'm',
    started_at: 's',
    updated_at: 'u',
    cleared_at: null,
    below_since: null,
  };

  it('assembles the dashboard per airport', async () => {
    const obs = {
      airport: 'YBBN',
      observed_at: '2026-11-09T12:00:00Z',
      raw_metar: 'M',
      wind_dir_deg: 80,
      wind_kt: 4,
      gust_kt: null,
      visibility_m: 10000,
      weather_codes: '',
      cloud: '',
      temp_c: 21,
      dewpoint_c: 17,
      qnh_hpa: 1019,
      apparent_temp_c: 22,
      uv_index: 0,
    };
    const f = fakeSupabase({
      forecasts: [
        {
          data: [{airport: 'YBCS', issued_at: 'i', raw_taf: 'TAF', hours: []}],
          error: null,
        },
      ],
      alerts: [{data: [alertRow], error: null}],
      warnings: [{data: [], error: null}],
      feed_log: [
        {
          data: [{source: 'm', run_at: 'r', ok: true, records: 1, error: null}],
          error: null,
        },
      ],
      observations: [
        {data: [obs], error: null},
        {data: [], error: null},
      ],
    });

    const data = await createSupabaseApi(f.sb).loadDashboard();

    expect(
      data.airports.map((a) => [
        a.code,
        a.observation?.windKt ?? null,
        a.forecast?.rawTaf ?? null,
        a.alerts.length,
      ]),
    ).toEqual([
      ['YBBN', 4, null, 1],
      ['YBCS', null, 'TAF', 0],
    ]);
    expect(data.feeds).toHaveLength(1);
    expect(steps(f.calls.find((c) => c.table === 'warnings'))).toBe(
      'select.or',
    );
  });

  it('throws when a dashboard query fails', async () => {
    const f = fakeSupabase({
      alerts: [{data: null, error: {message: 'permission denied'}}],
    });
    await expect(createSupabaseApi(f.sb).loadDashboard()).rejects.toThrow(
      'permission denied',
    );
  });

  it('asks the edge function to start an alert cycle', async () => {
    const f = fakeSupabase();
    await createSupabaseApi(f.sb).refreshFeeds();
    expect(f.functions.invoke).toHaveBeenCalledWith('trigger-alert-cycle', {
      method: 'POST',
    });
  });

  it('reports the edge function error body when it has one', async () => {
    const f = fakeSupabase();
    f.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({error: 'Not authorised'}), {
          status: 403,
        }),
      },
    });
    await expect(createSupabaseApi(f.sb).refreshFeeds()).rejects.toThrow(
      'Not authorised',
    );
  });

  it('falls back to the error message when the body is not JSON', async () => {
    const f = fakeSupabase();
    f.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: {message: 'Failed to send a request', context: new Response('x')},
    });
    await expect(createSupabaseApi(f.sb).refreshFeeds()).rejects.toThrow(
      'Failed to send a request',
    );
  });

  it('loads alert history newest first', async () => {
    const f = fakeSupabase({alerts: [{data: [alertRow], error: null}]});
    const rows = await createSupabaseApi(f.sb).loadAlertHistory(50);
    expect(rows[0]?.triggerValue).toBe('27 kt');
    expect(f.calls[0]?.steps).toEqual([
      ['select', ['*']],
      ['order', ['started_at', {ascending: false}]],
      ['limit', [50]],
    ]);
  });

  it('manages groups and members', async () => {
    const f = fakeSupabase({
      mail_groups: [
        {
          data: [
            {
              id: 'g',
              name: 'Ramp',
              enabled: true,
              airports: ['YBBN'],
              categories: [],
              min_level: 'watch',
            },
          ],
          error: null,
        },
      ],
    });
    const api = createSupabaseApi(f.sb);

    expect((await api.listGroups())[0]?.members).toEqual([]);
    await api.createGroup('  Night shift ');
    await api.updateGroup('g', {
      enabled: false,
      airports: ['YBCS'],
      categories: ['uv'],
      minLevel: 'warning',
    });
    await api.updateGroup('g', {});
    await api.deleteGroup('g');
    await api.addMember('g', ' A@B.co ');
    await api.removeMember('m');

    expect(f.calls.map((c) => `${c.table}:${steps(c)}`)).toEqual([
      'mail_groups:select.order',
      'mail_groups:insert',
      'mail_groups:update.eq',
      'mail_groups:update.eq',
      'mail_groups:delete.eq',
      'group_members:insert',
      'group_members:delete.eq',
    ]);
    expect(f.calls[1]?.steps[0]?.[1]).toEqual([{name: 'Night shift'}]);
    expect(f.calls[2]?.steps[0]?.[1]).toEqual([
      {
        enabled: false,
        airports: ['YBCS'],
        categories: ['uv'],
        min_level: 'warning',
      },
    ]);
    expect(f.calls[3]?.steps[0]?.[1]).toEqual([{}]);
    expect(f.calls[5]?.steps[0]?.[1]).toEqual([
      {group_id: 'g', email: 'a@b.co'},
    ]);
  });

  it('pages the audit log with an optional status filter', async () => {
    const row = {
      id: 1,
      sent_at: 's',
      group_id: 'g',
      group_name: 'Ramp',
      recipients: ['a@b.co'],
      subject: 'S',
      body: 'B',
      alert_id: 'a',
      airport: 'YBBN',
      category: 'wind',
      level: 'watch',
      event: 'raised',
      status: 'sent',
      error: null,
    };
    const f = fakeSupabase({
      email_audit: [
        {data: [row], error: null, count: 40},
        {data: [row], error: null},
      ],
    });
    const api = createSupabaseApi(f.sb);

    expect(
      await api.loadAudit({status: 'all', page: 1, pageSize: 25}),
    ).toMatchObject({total: 40});
    expect(
      await api.loadAudit({status: 'failed', page: 0, pageSize: 25}),
    ).toMatchObject({total: 1});
    expect(f.calls[0]?.steps[2]).toEqual(['range', [25, 49]]);
    expect(steps(f.calls[0])).toBe('select.order.range');
    expect(steps(f.calls[1])).toBe('select.order.range.eq');
  });
});
