// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import {AIRPORTS} from '../domain/airports';
import {makeObservation} from '../domain/test_fixtures';
import {readJobConfig, userAgentFor} from './config';
import {chunk, createGmailMailer, MAX_BCC_PER_MESSAGE} from './gmail_mailer';
import {createHttpFeeds} from './http_feeds';
import {MemoryStore} from './memory_store';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {createTransport: vi.fn(() => ({sendMail}))},
}));

describe('readJobConfig', () => {
  const env = {
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_x',
    GMAIL_USER: 'alerts@gmail.com',
    GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
    GITHUB_REPOSITORY: 'tom/brisbane-weather-alert-app',
  };

  it('reads required and optional values and strips app password spaces', () => {
    expect(readJobConfig(env)).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseSecretKey: 'sb_secret_x',
      gmailUser: 'alerts@gmail.com',
      gmailAppPassword: 'abcdefghijklmnop',
      fromName: 'Airport Weather Alerts',
      userAgent:
        'brisbane-weather-alert-app/0.1 (github.com/tom/brisbane-weather-alert-app)',
    });
    expect(readJobConfig({...env, ALERT_FROM_NAME: 'Ramp Wx'}).fromName).toBe(
      'Ramp Wx',
    );
  });

  it('names missing variables without echoing values', () => {
    expect(() =>
      readJobConfig({
        SUPABASE_URL: 'u',
        GMAIL_USER: '  ',
        GMAIL_APP_PASSWORD: 'secret',
      }),
    ).toThrow(
      'Missing required environment variables: SUPABASE_SECRET_KEY, GMAIL_USER',
    );
  });

  it('identifies a local run', () => {
    expect(userAgentFor({})).toBe('brisbane-weather-alert-app/0.1 (local run)');
  });
});

describe('createHttpFeeds', () => {
  function okJson(body: unknown) {
    return Promise.resolve(new Response(JSON.stringify(body), {status: 200}));
  }

  it('calls aviationweather.gov and MET Norway with our user agent', async () => {
    const fetchFn = vi.fn((url: string | URL | Request) => {
      void url;
      return okJson([{icaoId: 'YBBN'}]);
    });
    const bom = vi.fn(async () => ['<amoc/>']);
    const feeds = createHttpFeeds({
      userAgent: 'ua/1',
      fetchBomDocuments: bom,
      fetchBomObservations: async () => '<product/>',
      fetchFn,
    });

    await feeds.fetchMetars(['YBBN', 'YBCS']);
    await feeds.fetchTafs(['YBBN']);
    await feeds.fetchMetNo(AIRPORTS[0]!);

    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://aviationweather.gov/api/data/metar?ids=YBBN,YBCS&format=json',
      'https://aviationweather.gov/api/data/taf?ids=YBBN&format=json',
      'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=-27.3840&lon=153.1180',
    ]);
    const init = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].headers).toMatchObject({'User-Agent': 'ua/1'});
    expect(await feeds.fetchBomWarningDocuments()).toEqual(['<amoc/>']);
    expect(await feeds.fetchBomObservationDocument()).toBe('<product/>');
  });

  it('throws on an HTTP error status', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('', {status: 429})),
    );
    const feeds = createHttpFeeds({
      userAgent: 'ua',
      fetchBomDocuments: async () => [],
      fetchBomObservations: async () => '',
      fetchFn,
    });
    await expect(feeds.fetchMetars(['YBBN'])).rejects.toThrow(
      'HTTP 429 from aviationweather.gov',
    );
  });
});

describe('Gmail mailer', () => {
  it('chunks recipient lists', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('sends one Bcc message per chunk, addressed to the sender', async () => {
    sendMail.mockReset();
    const mailer = createGmailMailer({
      user: 'alerts@gmail.com',
      appPassword: 'p',
      fromName: 'Wx',
    });
    const bcc = Array.from(
      {length: MAX_BCC_PER_MESSAGE + 1},
      (_, i) => `u${i}@x.com`,
    );

    await mailer.send({bcc, subject: 'S', text: 'T', html: '<p>T</p>'});

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: {name: 'Wx', address: 'alerts@gmail.com'},
      to: 'alerts@gmail.com',
      subject: 'S',
    });
    expect(sendMail.mock.calls[1]?.[0].bcc).toEqual(['u50@x.com']);
  });
});

describe('MemoryStore', () => {
  it('upserts observations and returns the latest', async () => {
    const store = new MemoryStore();
    await store.saveObservation(
      makeObservation({observedAt: '2026-11-09T11:00:00Z'}),
    );
    await store.saveObservation(
      makeObservation({observedAt: '2026-11-09T12:00:00Z'}),
    );
    await store.saveObservation(
      makeObservation({observedAt: '2026-11-09T12:00:00Z', windKt: 9}),
    );

    expect(store.observations).toHaveLength(2);
    expect((await store.latestObservation('YBBN'))?.windKt).toBe(9);
    expect(await store.latestObservation('YBCS')).toBeNull();
  });

  it('keeps the stored TAF and hours when a partial forecast arrives', async () => {
    const store = new MemoryStore();
    const hour = {
      time: 't',
      tempC: 1,
      windKt: 1,
      windDirDeg: 1,
      precipMm: 0,
      uvIndex: 0,
      symbol: 's',
    };
    await store.saveForecast({
      airport: 'YBBN',
      issuedAt: 'a',
      rawTaf: 'TAF',
      hours: [hour],
      hoursFetchedAt: 'f',
    });
    await store.saveForecast({
      airport: 'YBBN',
      issuedAt: 'b',
      rawTaf: null,
      hours: [],
      hoursFetchedAt: null,
    });
    expect(await store.forecast('YBCS')).toBeNull();
    expect(await store.forecast('YBBN')).toEqual({
      airport: 'YBBN',
      issuedAt: 'b',
      rawTaf: 'TAF',
      hours: [hour],
      hoursFetchedAt: 'f',
    });
  });

  it('filters expired warnings', async () => {
    const store = new MemoryStore();
    const base = {
      airport: 'YBBN' as const,
      kind: 'cyclone' as const,
      level: 'watch' as const,
      headline: '',
      issuedAt: '',
    };
    await store.replaceWarnings([
      {...base, id: 'old', expiresAt: '2026-11-09T00:00:00Z'},
      {...base, id: 'new', expiresAt: '2026-11-10T00:00:00Z'},
    ]);
    const current = await store.currentWarnings(
      new Date('2026-11-09T12:00:00Z'),
    );
    expect(current.map((w) => w.id)).toEqual(['new']);
  });
});
