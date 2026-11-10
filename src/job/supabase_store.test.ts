// @vitest-environment node
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe, expect, it} from 'vitest';
import {makeAlert, makeObservation} from '../domain/test_fixtures';
import {SupabaseStore, unwrap} from './supabase_store';

interface Call {
  table: string;
  steps: [string, unknown[]][];
}

/**
 * A stand-in for the Supabase query builder: records each chained call and
 * resolves with the next queued result when awaited.
 */
function fakeDb(
  results: {data: unknown; error: {message: string} | null}[] = [],
) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = {table, steps: []};
      calls.push(call);
      const builder: Record<string, unknown> = {};
      const chain = new Proxy(builder, {
        get(_target, prop: string) {
          if (prop === 'then') {
            const result = results.shift() ?? {data: [], error: null};
            return (resolve: (v: unknown) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            call.steps.push([prop, args]);
            return chain;
          };
        },
      });
      return chain;
    },
  };
  return {db: db as unknown as SupabaseClient, calls};
}

const NOW = new Date('2026-11-09T12:00:00Z');

describe('unwrap', () => {
  it('returns data or throws with context', () => {
    expect(unwrap({data: 1, error: null}, 'x')).toBe(1);
    expect(() =>
      unwrap({data: null, error: {message: 'denied'}}, 'read x'),
    ).toThrow('Database read x failed: denied');
  });
});

describe('SupabaseStore', () => {
  it('upserts observations on airport and time', async () => {
    const {db, calls} = fakeDb();
    await new SupabaseStore(db).saveObservation(makeObservation());
    expect(calls[0]?.table).toBe('observations');
    expect(calls[0]?.steps[0]?.[0]).toBe('upsert');
    expect(calls[0]?.steps[0]?.[1][1]).toEqual({
      onConflict: 'airport,observed_at',
    });
  });

  it('reads the latest observation or null', async () => {
    const row = {
      airport: 'YBBN',
      observed_at: '2026-11-09T12:00:00+00:00',
      raw_metar: 'M',
      wind_dir_deg: null,
      wind_kt: 5,
      gust_kt: null,
      visibility_m: 9999,
      weather_codes: '',
      cloud: '',
      temp_c: '21.5',
      dewpoint_c: null,
      qnh_hpa: 1019,
      apparent_temp_c: null,
      uv_index: '3',
    };
    const {db} = fakeDb([
      {data: [row], error: null},
      {data: [], error: null},
    ]);
    const store = new SupabaseStore(db);
    expect(await store.latestObservation('YBBN')).toMatchObject({
      observedAt: '2026-11-09T12:00:00.000Z',
      tempC: 21.5,
      uvIndex: 3,
    });
    expect(await store.latestObservation('YBBN')).toBeNull();
  });

  it('omits empty forecast parts so the stored ones are kept', async () => {
    const {db, calls} = fakeDb();
    const store = new SupabaseStore(db);
    await store.saveForecast({
      airport: 'YBBN',
      issuedAt: 'i',
      rawTaf: null,
      hours: [],
      hoursFetchedAt: null,
    });
    await store.saveForecast({
      airport: 'YBBN',
      issuedAt: 'i',
      rawTaf: 'TAF',
      hours: [{} as never],
      hoursFetchedAt: 'f',
    });
    const first = calls[0]?.steps[0]?.[1][0] as Record<string, unknown>;
    const second = calls[1]?.steps[0]?.[1][0] as Record<string, unknown>;
    expect(first).not.toHaveProperty('raw_taf');
    expect(first).not.toHaveProperty('hours');
    expect(first).not.toHaveProperty('hours_fetched_at');
    expect(second).toMatchObject({
      raw_taf: 'TAF',
      hours: [{}],
      hours_fetched_at: 'f',
    });
  });

  it('reads the stored forecast for one airport, or null', async () => {
    const row = {
      airport: 'YBBN',
      issued_at: 'i',
      raw_taf: null,
      hours: [],
      hours_fetched_at: 'f',
    };
    const {db, calls} = fakeDb([
      {data: [row], error: null},
      {data: [], error: null},
    ]);
    const store = new SupabaseStore(db);
    expect(await store.forecast('YBBN')).toMatchObject({hoursFetchedAt: 'f'});
    expect(await store.forecast('YBCS')).toBeNull();
    expect(calls[0]?.steps[1]).toEqual(['eq', ['airport', 'YBBN']]);
  });

  it('replaces warnings, removing ones no longer issued', async () => {
    const {db, calls} = fakeDb();
    const store = new SupabaseStore(db);
    await store.replaceWarnings([
      {
        id: 'a',
        airport: 'YBBN',
        kind: 'thunderstorm',
        level: 'warning',
        headline: 'h',
        issuedAt: 'i',
        expiresAt: null,
      },
    ]);
    await store.replaceWarnings([]);
    expect(calls.map((c) => c.steps.map((s) => s[0]).join('.'))).toEqual([
      'upsert',
      'delete.not',
      'delete.neq',
    ]);
    expect(calls[1]?.steps[1]?.[1]).toEqual(['id', 'in', '("a")']);
  });

  it('reads current warnings and active alerts', async () => {
    const warning = {
      id: 'a',
      airport: 'YBCS',
      kind: 'cyclone',
      level: 'watch',
      headline: 'h',
      issued_at: 'i',
      expires_at: null,
    };
    const alert = {
      id: 'x',
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
    const {db, calls} = fakeDb([
      {data: [warning], error: null},
      {data: [alert], error: null},
    ]);
    const store = new SupabaseStore(db);
    expect((await store.currentWarnings(NOW))[0]).toMatchObject({
      airport: 'YBCS',
      issuedAt: 'i',
    });
    expect((await store.activeAlerts())[0]).toMatchObject({
      peakLevel: 'watch',
      triggerValue: '27 kt',
    });
    expect(calls[0]?.steps[1]).toEqual([
      'or',
      ['expires_at.is.null,expires_at.gt.2026-11-09T12:00:00.000Z'],
    ]);
  });

  it('creates and updates alerts with snake_case columns', async () => {
    const {id: _id, ...fresh} = makeAlert();
    void _id;
    const row = {
      id: 'new',
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
    const {db, calls} = fakeDb([{data: row, error: null}]);
    const store = new SupabaseStore(db);
    expect((await store.createAlert(fresh)).id).toBe('new');
    await store.updateAlert('new', {belowSince: 'b', level: 'warning'});
    expect(calls[0]?.steps[0]?.[1][0]).toMatchObject({
      peak_level: 'watch',
      trigger_value: '27 kt',
    });
    expect(calls[1]?.steps).toEqual([
      ['update', [{below_since: 'b', level: 'warning'}]],
      ['eq', ['id', 'new']],
    ]);
  });

  it('reads mail groups with sorted members', async () => {
    const row = {
      id: 'g',
      name: 'Ramp',
      enabled: true,
      airports: ['YBBN'],
      categories: ['wind'],
      min_level: 'watch',
      group_members: [
        {id: '2', email: 'b@x.com'},
        {id: '1', email: 'a@x.com'},
      ],
    };
    const {db} = fakeDb([{data: [row], error: null}]);
    const [group] = await new SupabaseStore(db).mailGroups();
    expect(group?.members.map((m) => m.email)).toEqual(['a@x.com', 'b@x.com']);
    expect(group?.minLevel).toBe('watch');
  });

  it('reads edited email sections', async () => {
    const row = {
      category: 'uv',
      phase: 'info',
      icon: '😎',
      title: 'Sun',
      guidance: 'Hat.',
    };
    const {db, calls} = fakeDb([{data: [row], error: null}]);
    expect(await new SupabaseStore(db).emailSections()).toEqual([row]);
    expect(calls[0]?.table).toBe('email_sections');
  });

  it('reads edited alert thresholds', async () => {
    const row = {
      category: 'wind',
      info: null,
      watch: '20',
      warning: 30,
      standdown: 40,
    };
    const {db, calls} = fakeDb([{data: [row], error: null}]);
    expect(await new SupabaseStore(db).alertThresholds()).toEqual([
      {
        category: 'wind',
        limits: {info: null, watch: 20, warning: 30, standdown: 40},
      },
    ]);
    expect(calls[0]?.table).toBe('alert_thresholds');
  });

  it('records email audit and feed rows', async () => {
    const {db, calls} = fakeDb();
    const store = new SupabaseStore(db);
    await store.recordEmail({
      groupId: 'g',
      groupName: 'Ramp',
      recipients: ['a@x.com'],
      subject: 's',
      body: 'b',
      alertId: 'x',
      airport: 'YBBN',
      category: 'wind',
      level: 'watch',
      event: 'raised',
      status: 'sent',
      error: null,
      resendOf: 3,
    });
    await store.recordFeed({
      source: 'metar',
      runAt: 'r',
      ok: true,
      records: 2,
      error: null,
    });
    expect(calls[0]?.steps[0]?.[1][0]).toMatchObject({
      group_name: 'Ramp',
      alert_id: 'x',
      status: 'sent',
      resend_of: 3,
    });
    expect(calls[1]?.steps[0]?.[1][0]).toEqual({
      source: 'metar',
      run_at: 'r',
      ok: true,
      records: 2,
      error: null,
    });
  });

  it('purges data after 30 days and audit after about 12 months', async () => {
    const {db, calls} = fakeDb();
    await new SupabaseStore(db).purgeOld(NOW);
    expect(calls.map((c) => c.table)).toEqual([
      'observations',
      'feed_log',
      'email_audit',
      'alerts',
    ]);
    expect(calls[0]?.steps[1]).toEqual([
      'lt',
      ['observed_at', '2026-10-10T12:00:00.000Z'],
    ]);
    expect(calls[2]?.steps[1]).toEqual([
      'lt',
      ['sent_at', '2025-11-08T12:00:00.000Z'],
    ]);
  });

  it('claims pending resends and reads their original emails', async () => {
    const auditRow = {
      id: 7,
      sent_at: '2026-11-09T11:00:00+00:00',
      group_id: 'g',
      group_name: 'Ramp',
      recipients: ['a@x.com'],
      subject: 's',
      body: 'b',
      alert_id: null,
      airport: 'YBBN',
      category: 'wind',
      level: 'watch',
      event: 'raised',
      status: 'failed',
      error: 'x',
      resend_of: null,
    };
    const {db, calls} = fakeDb([
      {data: [{email_audit: auditRow}, {email_audit: null}], error: null},
    ]);

    const claimed = await new SupabaseStore(db).claimResends(NOW);

    expect(claimed.map((e) => [e.id, e.recipients, e.resendOf])).toEqual([
      [7, ['a@x.com'], null],
    ]);
    expect(calls).toEqual([
      {
        table: 'email_resend_requests',
        steps: [
          ['update', [{processed_at: NOW.toISOString()}]],
          ['is', ['processed_at', null]],
          ['select', ['email_audit(*)']],
        ],
      },
    ]);
  });

  it('fails the run when resends cannot be claimed', async () => {
    const {db} = fakeDb([{data: null, error: {message: 'timeout'}}]);
    await expect(new SupabaseStore(db).claimResends(NOW)).rejects.toThrow(
      'Database claim resends failed: timeout',
    );
  });

  it('surfaces database errors', async () => {
    const {db} = fakeDb([{data: null, error: {message: 'permission denied'}}]);
    await expect(new SupabaseStore(db).activeAlerts()).rejects.toThrow(
      'Database read alerts failed: permission denied',
    );
  });
});
