// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AIRPORTS} from '../domain/airports';
import type {MetNoResponse} from '../domain/met_no';
import type {AwcMetar} from '../domain/metar';
import {makeGroup} from '../domain/test_fixtures';
import type {AirportCode} from '../domain/types';
import {errorMessage, runAlertCycle, type AlertCycleDeps} from './alert_cycle';
import {MemoryStore} from './memory_store';
import type {AwcTaf, Mailer, OutgoingEmail, WeatherFeeds} from './ports';

const NOW = new Date('2026-11-09T12:10:00Z');

function metar(
  icaoId: AirportCode,
  overrides: Partial<AwcMetar> = {},
): AwcMetar {
  return {
    icaoId,
    obsTime: Date.parse('2026-11-09T12:00:00Z') / 1000,
    rawOb: `METAR ${icaoId} 091200Z 08004KT 9999 FEW030 21/17 Q1019`,
    wdir: 80,
    wspd: 4,
    temp: 21,
    dewp: 17,
    altim: 1019,
    ...overrides,
  };
}

const MET_NO: MetNoResponse = {
  properties: {
    meta: {updated_at: '2026-11-09T11:00:00Z'},
    timeseries: [
      {
        time: '2026-11-09T12:00:00Z',
        data: {
          instant: {
            details: {ultraviolet_index_clear_sky: 1, air_temperature: 20},
          },
          next_1_hours: {summary: {symbol_code: 'cloudy'}},
        },
      },
    ],
  },
};

const STORM_XML = `<amoc><identifier>IDQ21033</identifier>
  <expiry-time>2026-11-09T18:00:00Z</expiry-time>
  <hazard index="1"><headline>Severe Thunderstorm Warning for Brisbane</headline></hazard>
</amoc>`;

class FakeFeeds implements WeatherFeeds {
  metars: AwcMetar[] = [metar('YBBN'), metar('YBCS')];
  tafs: AwcTaf[] = [
    {icaoId: 'YBBN', rawTAF: 'TAF YBBN ...', issueTime: '2026-11-09T11:00:00Z'},
  ];
  bomDocs: string[] = [];
  metNo: MetNoResponse = MET_NO;
  metNoCalls = 0;
  failing = new Set<string>();

  private maybeFail(name: string) {
    if (this.failing.has(name)) throw new Error(`${name} down`);
  }
  async fetchMetars() {
    this.maybeFail('metar');
    return this.metars;
  }
  async fetchTafs() {
    this.maybeFail('taf');
    return this.tafs;
  }
  async fetchMetNo() {
    this.metNoCalls++;
    this.maybeFail('metno');
    return this.metNo;
  }
  async fetchBomWarningDocuments() {
    this.maybeFail('bom');
    return this.bomDocs;
  }
}

class FakeMailer implements Mailer {
  sent: OutgoingEmail[] = [];
  fail = false;
  async send(email: OutgoingEmail) {
    if (this.fail) throw new Error('SMTP 454 4.7.0 quota');
    this.sent.push(email);
  }
}

describe('runAlertCycle', () => {
  let feeds: FakeFeeds;
  let store: MemoryStore;
  let mailer: FakeMailer;
  let now: Date;
  let deps: AlertCycleDeps;

  beforeEach(() => {
    feeds = new FakeFeeds();
    store = new MemoryStore();
    store.groups = [makeGroup({categories: ['wind', 'thunderstorm']})];
    mailer = new FakeMailer();
    now = NOW;
    deps = {
      feeds,
      store,
      mailer,
      airports: AIRPORTS,
      now: () => now,
      appUrl: 'https://example.github.io/app/',
      log: vi.fn(),
    };
  });

  it('stores readings and sends nothing on a quiet day', async () => {
    const summary = await runAlertCycle(deps);

    expect(summary).toEqual({
      events: [],
      emailsSent: 0,
      emailsFailed: 0,
      auditFailures: 0,
      failedFeeds: [],
    });
    expect(store.observations.map((o) => [o.airport, o.uvIndex])).toEqual([
      ['YBBN', 1],
      ['YBCS', 1],
    ]);
    expect(store.forecasts.get('YBBN')).toMatchObject({
      rawTaf: 'TAF YBBN ...',
      issuedAt: '2026-11-09T11:00:00Z',
      hoursFetchedAt: NOW.toISOString(),
    });
    expect(store.forecasts.get('YBCS')).toMatchObject({
      rawTaf: null,
      issuedAt: NOW.toISOString(),
    });
    expect(store.feeds.map((f) => [f.source, f.ok, f.records])).toEqual([
      ['aviationweather-metar', true, 2],
      ['aviationweather-taf', true, 1],
      ['bom-warnings', true, 0],
      ['met-no-YBBN', true, 1],
      ['met-no-YBCS', true, 1],
    ]);
    expect(store.purgedAt).toEqual(NOW);
  });

  it('raises an alert, emails the subscribed group and audits it', async () => {
    feeds.metars = [metar('YBBN', {wspd: 22, wgst: 38}), metar('YBCS')];

    const summary = await runAlertCycle(deps);

    expect(summary.events).toHaveLength(1);
    expect(summary.emailsSent).toBe(1);
    expect(mailer.sent[0]).toMatchObject({
      bcc: ['sup@example.com'],
      subject: '[WARNING] Wind gust 38 kt at Brisbane (YBBN)',
    });
    expect(store.emails[0]).toMatchObject({
      groupId: 'group-1',
      groupName: 'Ramp supervisors',
      recipients: ['sup@example.com'],
      alertId: 'alert-1',
      airport: 'YBBN',
      category: 'wind',
      level: 'warning',
      event: 'raised',
      status: 'sent',
      error: null,
    });
    expect(store.emails[0]?.body).toContain(
      'Dashboard: https://example.github.io/app/',
    );
  });

  it('does not repeat an unchanged alert, then escalates, then clears after the hold', async () => {
    feeds.metars = [metar('YBBN', {wspd: 26})];
    await runAlertCycle(deps);
    await runAlertCycle(deps);
    expect(mailer.sent).toHaveLength(1);

    feeds.metars = [metar('YBBN', {wspd: 26, wgst: 46})];
    await runAlertCycle(deps);
    expect(mailer.sent[1]?.subject).toBe(
      '[STAND-DOWN] Wind gust 46 kt at Brisbane (YBBN)',
    );

    feeds.metars = [metar('YBBN')];
    await runAlertCycle(deps);
    now = new Date(NOW.getTime() + 31 * 60_000);
    feeds.metars = [metar('YBBN', {obsTime: now.getTime() / 1000})];
    const summary = await runAlertCycle(deps);

    expect(summary.events.map((e) => e.kind)).toEqual(['cleared']);
    expect(mailer.sent[2]?.subject).toBe(
      '[ALL CLEAR] Wind gust at Brisbane (YBBN)',
    );
    expect(store.emails.map((e) => [e.event, e.level])).toEqual([
      ['raised', 'watch'],
      ['escalated', 'standdown'],
      ['cleared', 'standdown'],
    ]);
  });

  it('audits a failed send', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    mailer.fail = true;

    const summary = await runAlertCycle(deps);

    expect(summary).toMatchObject({emailsSent: 0, emailsFailed: 1});
    expect(store.emails[0]).toMatchObject({
      status: 'failed',
      error: 'SMTP 454 4.7.0 quota',
    });
    expect(deps.log).toHaveBeenCalledWith(
      'Email to group "Ramp supervisors" failed: SMTP 454 4.7.0 quota',
    );
  });

  it('turns BoM warnings into alerts and stores them', async () => {
    feeds.bomDocs = [STORM_XML, STORM_XML, '<not-xml'];

    const summary = await runAlertCycle(deps);

    expect(store.warnings).toHaveLength(1);
    expect(summary.events[0]?.alert).toMatchObject({
      category: 'thunderstorm',
      airport: 'YBBN',
    });
  });

  it('logs and skips a BoM document that cannot be parsed', async () => {
    feeds.bomDocs = ['<amoc><hazard>'];
    const parse = await import('../domain/bom_warnings');
    const spy = vi.spyOn(parse, 'parseAmocWarnings').mockImplementation(() => {
      throw new Error('bad xml');
    });

    await runAlertCycle(deps);

    expect(deps.log).toHaveBeenCalledWith(
      'Skipped unreadable BoM document: bad xml',
    );
    spy.mockRestore();
  });

  it('falls back to stored data when feeds fail', async () => {
    await runAlertCycle(deps);
    now = new Date(NOW.getTime() + 31 * 60_000);
    feeds.failing = new Set(['metar', 'taf', 'metno', 'bom']);
    store.warnings = [
      {
        id: 'w',
        airport: 'YBCS',
        kind: 'cyclone',
        level: 'watch',
        headline: 'TC Watch',
        issuedAt: '',
        expiresAt: null,
      },
    ];

    const summary = await runAlertCycle(deps);

    expect(summary.failedFeeds).toEqual([
      'aviationweather-metar',
      'aviationweather-taf',
      'bom-warnings',
      'met-no-YBBN',
      'met-no-YBCS',
    ]);
    expect(store.feeds.at(-1)).toMatchObject({
      ok: false,
      error: 'metno down',
      records: 0,
    });
    expect(summary.events.map((e) => e.alert.category)).toEqual(['cyclone']);
  });

  it('raises a stale-data alert when there has never been an observation', async () => {
    feeds.failing = new Set(['metar']);
    store.groups = [makeGroup({categories: ['data_stale'], minLevel: 'info'})];

    const summary = await runAlertCycle(deps);

    expect(
      summary.events.map((e) => [e.alert.airport, e.alert.category]),
    ).toEqual([
      ['YBBN', 'data_stale'],
      ['YBCS', 'data_stale'],
    ]);
    expect(summary.emailsSent).toBe(2);
  });

  it('reuses a fresh stored forecast instead of calling MET Norway again', async () => {
    await runAlertCycle(deps);
    expect(feeds.metNoCalls).toBe(2);

    now = new Date(NOW.getTime() + 29 * 60_000);
    await runAlertCycle(deps);
    expect(feeds.metNoCalls).toBe(2);
    expect(store.observations.at(-1)?.uvIndex).toBe(1);

    now = new Date(NOW.getTime() + 31 * 60_000);
    await runAlertCycle(deps);
    expect(feeds.metNoCalls).toBe(4);
  });

  it('never sends a false all-clear while UV data is missing', async () => {
    store.groups = [makeGroup({categories: ['uv'], minLevel: 'info'})];
    feeds.metNo = {
      properties: {
        meta: {updated_at: ''},
        timeseries: [
          {
            time: '2026-11-09T12:00:00Z',
            data: {
              instant: {details: {ultraviolet_index_clear_sky: 9}},
              next_1_hours: {summary: {symbol_code: 'clearsky_day'}},
            },
          },
        ],
      },
    };
    await runAlertCycle(deps);
    expect(mailer.sent.map((m) => m.subject)).toEqual([
      '[WATCH] UV exposure UV 9 at Brisbane (YBBN)',
      '[WATCH] UV exposure UV 9 at Cairns (YBCS)',
    ]);

    // MET Norway goes down and the stored hours no longer cover "now".
    feeds.failing = new Set(['metno']);
    now = new Date(NOW.getTime() + 90 * 60_000);
    await runAlertCycle(deps);
    now = new Date(NOW.getTime() + 150 * 60_000);
    await runAlertCycle(deps);

    expect(mailer.sent).toHaveLength(2);
    expect(store.alerts.filter((a) => a.category === 'uv')).toEqual([
      expect.objectContaining({status: 'active', belowSince: null}),
      expect.objectContaining({status: 'active', belowSince: null}),
    ]);
  });

  it('loads mail groups before writing alerts, so a database fault loses nothing', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    vi.spyOn(store, 'mailGroups').mockRejectedValueOnce(new Error('db down'));

    await expect(runAlertCycle(deps)).rejects.toThrow('db down');
    expect(store.alerts).toEqual([]);

    const summary = await runAlertCycle(deps);
    expect(summary.emailsSent).toBe(1);
  });

  it('keeps emailing other groups when an audit write fails', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    store.groups = [
      makeGroup({id: 'g1', name: 'One'}),
      makeGroup({id: 'g2', name: 'Two'}),
    ];
    vi.spyOn(store, 'recordEmail').mockRejectedValueOnce(
      new Error('insert failed'),
    );

    const summary = await runAlertCycle(deps);

    expect(mailer.sent).toHaveLength(2);
    expect(summary).toMatchObject({
      emailsSent: 2,
      emailsFailed: 0,
      auditFailures: 1,
    });
    expect(deps.log).toHaveBeenCalledWith(
      'Audit write failed for "[WARNING] Wind gust 40 kt at Brisbane (YBBN)" to group "One": insert failed',
    );
  });
});

describe('errorMessage', () => {
  it('reads Error messages and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage(42)).toBe('42');
  });
});
