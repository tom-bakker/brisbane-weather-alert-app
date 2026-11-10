// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AIRPORTS} from '../domain/airports';
import type {EmailSection} from '../domain/email_sections';
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
    expect(store.emails[0]?.body).not.toContain('://');
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

  it('uses the edited email section for the alert category and level', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    store.sections = [
      {
        category: 'wind',
        phase: 'watch',
        icon: '💨',
        title: 'Breezy',
        guidance: 'Not this one.',
      },
      {
        category: 'wind',
        phase: 'warning',
        icon: '🚩',
        title: 'Strong wind',
        guidance: 'Chock it.',
      },
    ];

    await runAlertCycle(deps);

    expect(mailer.sent[0]?.subject).toBe(
      '[WARNING] Strong wind 40 kt at Brisbane (YBBN)',
    );
    expect(mailer.sent[0]?.html).toContain('🚩');
    expect(mailer.sent[0]?.text).toContain('What to do: Chock it.');
  });

  it('ignores and logs sections saved before the phase migration', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    // A row read from the old table has no phase column.
    store.sections = [
      {
        category: 'wind',
        icon: '🚩',
        title: 'Old wording',
        guidance: 'Old.',
      } as unknown as EmailSection,
    ];

    await runAlertCycle(deps);

    expect(mailer.sent[0]?.subject).toBe(
      '[WARNING] Wind gust 40 kt at Brisbane (YBBN)',
    );
    expect(deps.log).toHaveBeenCalledWith(
      'Ignoring 1 email section(s) with no known phase, using defaults; ' +
        'is the phase migration applied?',
    );
  });

  it('falls back to the default sections when they cannot be read', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    vi.spyOn(store, 'emailSections').mockRejectedValueOnce(
      new Error('no table'),
    );

    const summary = await runAlertCycle(deps);

    expect(summary.emailsSent).toBe(1);
    expect(mailer.sent[0]?.subject).toContain('Wind gust');
    expect(deps.log).toHaveBeenCalledWith(
      'Email sections unreadable, using defaults: no table',
    );
  });

  /** Level of the Brisbane wind alert the run raised, if any. */
  function windLevel() {
    return store.alerts.find(
      (a) => a.airport === 'YBBN' && a.category === 'wind',
    )?.level;
  }

  it('raises alerts at the edited thresholds', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    store.thresholds = [
      {
        category: 'wind',
        limits: {info: null, watch: 20, warning: 50, standdown: null},
      },
    ];

    await runAlertCycle(deps);

    expect(windLevel()).toBe('watch');
    expect(mailer.sent.map((e) => e.subject)).toContain(
      '[WATCH] Wind gust 40 kt at Brisbane (YBBN)',
    );
  });

  it('ignores edited thresholds that break the rules', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    store.thresholds = [
      {
        category: 'wind',
        limits: {info: null, watch: 50, warning: 20, standdown: null},
      },
    ];

    await runAlertCycle(deps);

    expect(windLevel()).toBe('warning');
    expect(deps.log).toHaveBeenCalledWith(
      'Ignoring wind thresholds, using defaults: Warning must be higher than Watch.',
    );
  });

  it('falls back to the default thresholds when they cannot be read', async () => {
    feeds.metars = [metar('YBBN', {wspd: 40})];
    vi.spyOn(store, 'alertThresholds').mockRejectedValueOnce(
      new Error('no table'),
    );

    await runAlertCycle(deps);

    expect(windLevel()).toBe('warning');
    expect(deps.log).toHaveBeenCalledWith(
      'Alert thresholds unreadable, using defaults: no table',
    );
  });

  it('does not read email sections when nothing changed', async () => {
    const spy = vi.spyOn(store, 'emailSections');
    await runAlertCycle(deps);
    expect(spy).not.toHaveBeenCalled();
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

  describe('resends', () => {
    let originalId: number;

    beforeEach(async () => {
      feeds.metars = [metar('YBBN', {wspd: 40})];
      mailer.fail = true;
      await runAlertCycle(deps);
      mailer.fail = false;
      originalId = store.emails[0]?.id ?? -1;
      // Resends go to the recorded recipients, not today's members.
      store.groups = [makeGroup({members: []})];
    });

    it('sends a queued resend to the original recipients once', async () => {
      store.resendQueue = [originalId];

      const summary = await runAlertCycle(deps);

      expect(summary).toMatchObject({emailsSent: 1, emailsFailed: 0});
      expect(mailer.sent).toEqual([
        expect.objectContaining({
          bcc: ['sup@example.com'],
          subject: '[RESENT] [WARNING] Wind gust 40 kt at Brisbane (YBBN)',
        }),
      ]);
      expect(store.emails[1]).toMatchObject({
        status: 'sent',
        resendOf: originalId,
        event: 'raised',
        groupName: 'Ramp supervisors',
      });
      expect(store.emails[1]?.body).toMatch(/^Resent copy of an email/);

      await runAlertCycle(deps);
      expect(mailer.sent).toHaveLength(1);
    });

    it('audits a failed resend', async () => {
      store.resendQueue = [originalId];
      mailer.fail = true;

      const summary = await runAlertCycle(deps);

      expect(summary).toMatchObject({emailsSent: 0, emailsFailed: 1});
      expect(store.emails[1]).toMatchObject({
        status: 'failed',
        error: 'SMTP 454 4.7.0 quota',
        resendOf: originalId,
      });
      expect(deps.log).toHaveBeenCalledWith(
        `Resend of email ${originalId} failed: SMTP 454 4.7.0 quota`,
      );
    });
  });
});

describe('errorMessage', () => {
  it('reads Error messages and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage(42)).toBe('42');
  });
});
