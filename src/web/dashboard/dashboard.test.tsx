import {act, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {makeAlert, makeObservation} from '../../domain/test_fixtures';
import type {AirportSnapshot} from '../data/api';
import {FakeApi, renderWithApi} from '../test_api';
import {DashboardPage, REFRESH_COOLDOWN_MS} from './dashboard_page';
import {formatGust, formatVisibility, formatWind, withUnit} from './format';

const NOW = new Date('2026-11-09T12:10:00Z');
const clock = () => NOW;

function snapshot(overrides: Partial<AirportSnapshot> = {}): AirportSnapshot {
  return {
    code: 'YBBN',
    observation: makeObservation({windKt: 22, gustKt: 38, uvIndex: 9}),
    forecast: {
      airport: 'YBBN',
      issuedAt: '2026-11-09T11:00:00Z',
      rawTaf: 'TAF YBBN 091100Z 0912/1018 07008KT 9999',
      hoursFetchedAt: '2026-11-09T11:00:00Z',
      hours: [
        {
          time: '2026-11-09T12:00:00Z',
          tempC: 21,
          windKt: 9,
          windDirDeg: 80,
          precipMm: 0.1,
          uvIndex: 0,
          symbol: 'light_rain',
        },
      ],
    },
    alerts: [
      makeAlert({
        id: 'a1',
        level: 'warning',
        triggerValue: '38 kt',
        message: 'Wind 22 kt, gusting 38 kt.',
      }),
      makeAlert({
        id: 'a2',
        category: 'uv',
        level: 'watch',
        triggerValue: 'UV 9',
        message: 'UV high.',
      }),
    ],
    warnings: [],
    ...overrides,
  };
}

function cairns(overrides: Partial<AirportSnapshot> = {}): AirportSnapshot {
  return {
    code: 'YBCS',
    observation: null,
    forecast: null,
    alerts: [],
    warnings: [],
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('DashboardPage', () => {
  it('shows alerts first, then tiles marked by level', async () => {
    const api = new FakeApi();
    api.dashboard = {airports: [snapshot(), cairns()], feeds: []};
    renderWithApi(<DashboardPage clock={clock} />, api);

    const alerts = await screen.findByRole('list', {name: 'Active alerts'});
    const items = within(alerts).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Warning');
    expect(items[0]).toHaveTextContent('Wind gust: 38 kt');
    expect(items[1]).toHaveTextContent('UV exposure: UV 9');

    const wind = screen.getByRole('region', {name: 'Wind'});
    expect(wind).toHaveTextContent('080° 22 kt');
    expect(wind).toHaveTextContent('38 kt');
    expect(wind).toHaveTextContent('Warning');
    expect(screen.getByRole('region', {name: 'UV index'})).toHaveTextContent(
      'Very high',
    );
    expect(
      screen.getByRole('region', {name: 'Visibility and cloud'}),
    ).not.toHaveTextContent('Watch');
    expect(
      screen.getByText(
        /Observed 2026-11-09 22:00 AEST \/ 12:00 UTC \(10 min ago\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', {name: 'Hourly forecast'}),
    ).toHaveTextContent('22:00 AEST');
    expect(
      screen.getByText('TAF YBBN 091100Z 0912/1018 07008KT 9999'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Weather data is stale/)).not.toBeInTheDocument();
  });

  it('switches airports and shows both side by side', async () => {
    const api = new FakeApi();
    api.dashboard = {airports: [snapshot(), cairns()], feeds: []};
    renderWithApi(<DashboardPage clock={clock} />, api);
    await screen.findByRole('article', {name: 'Brisbane'});

    await userEvent.click(screen.getByRole('tab', {name: 'Cairns (YBCS)'}));
    const panel = screen.getByRole('article', {name: 'Cairns'});
    expect(panel).toHaveTextContent('No observation received yet.');
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Weather data is stale',
    );
    expect(panel).toHaveTextContent('No active alerts');
    expect(panel).toHaveTextContent('No forecast available.');
    expect(
      screen.queryByRole('article', {name: 'Brisbane'}),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', {name: 'Both'}));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('lists BoM warnings, a stand-down banner and feed health', async () => {
    const api = new FakeApi();
    api.dashboard = {
      airports: [
        snapshot({
          observation: makeObservation({
            observedAt: '2026-11-09T10:00:00Z',
            windKt: 0,
            windDirDeg: null,
            weatherCodes: 'TSRA',
            cloud: '',
          }),
          alerts: [
            makeAlert({
              id: 's',
              level: 'standdown',
              category: 'thunderstorm',
              triggerValue: 'TSRA',
            }),
          ],
          warnings: [
            {
              id: 'w',
              airport: 'YBBN',
              kind: 'thunderstorm',
              level: 'warning',
              headline: 'Severe Thunderstorm Warning',
              issuedAt: '',
              expiresAt: null,
            },
          ],
        }),
      ],
      feeds: [
        {
          source: 'aviationweather-metar',
          runAt: '2026-11-09T12:05:00Z',
          ok: true,
          records: 2,
          error: null,
        },
        {
          source: 'bom-warnings',
          runAt: '2026-11-09T12:05:00Z',
          ok: false,
          records: 0,
          error: 'timeout',
        },
      ],
    };
    renderWithApi(<DashboardPage clock={clock} />, api);

    expect(
      await screen.findByText('Severe Thunderstorm Warning'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {name: 'Storms and warnings'}),
    ).toHaveTextContent('Stand-down');
    expect(screen.getByRole('region', {name: 'Wind'})).toHaveTextContent(
      'Calm',
    );
    expect(
      screen.getByRole('region', {name: 'Visibility and cloud'}),
    ).toHaveTextContent('Nil reported');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Weather data is stale',
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Failed: timeout')).toBeInTheDocument();
  });

  it('refreshes on a timer and shows load errors', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const api = new FakeApi();
    api.dashboard = {airports: [], feeds: []};
    api.loadDashboard.mockRejectedValueOnce(new Error('JWT expired'));
    renderWithApi(<DashboardPage clock={clock} refreshMs={1000} />, api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load weather data: JWT expired',
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(api.loadDashboard).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText('No feed runs recorded yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('requests a refresh, reloads, and cools down before allowing another', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const api = new FakeApi();
    renderWithApi(<DashboardPage clock={clock} />, api);
    await screen.findByText('No feed runs recorded yet.');

    const button = screen.getByRole('button', {name: 'Refresh now'});
    await user.click(button);

    expect(api.refreshFeeds).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Update requested/)).toBeInTheDocument();
    expect(api.loadDashboard).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_COOLDOWN_MS);
    });
    expect(button).toBeEnabled();
    expect(screen.queryByText(/Update requested/)).not.toBeInTheDocument();
  });

  it('states the real update interval', async () => {
    renderWithApi(<DashboardPage clock={clock} />, new FakeApi());
    await screen.findByText('No feed runs recorded yet.');

    expect(
      screen.getByText('Auto-updates every 10 minutes'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Refresh now'})).toHaveAttribute(
      'title',
      'Fetch new data now instead of waiting up to 10 minutes',
    );
  });

  it('shows why a refresh could not start', async () => {
    const api = new FakeApi();
    api.refreshFeeds.mockRejectedValueOnce(new Error('Not authorised'));
    renderWithApi(<DashboardPage clock={clock} />, api);
    await screen.findByText('No feed runs recorded yet.');

    await userEvent.click(screen.getByRole('button', {name: 'Refresh now'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start a refresh: Not authorised',
    );
    expect(screen.getByRole('button', {name: 'Refresh now'})).toBeEnabled();
  });

  it('labels hourly forecast icons with the condition', async () => {
    const api = new FakeApi();
    api.dashboard = {airports: [snapshot()], feeds: []};
    renderWithApi(<DashboardPage clock={clock} />, api);
    const strip = await screen.findByRole('list', {name: 'Hourly forecast'});
    expect(
      within(strip).getByRole('img', {name: 'Light rain'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {name: 'Current conditions'}),
    ).toHaveTextContent('21°C');
  });
});

describe('dashboard formatting', () => {
  it('formats values for display', () => {
    expect(withUnit(null, ' kt')).toBe('—');
    expect(withUnit(5, ' kt')).toBe('5 kt');
    expect(formatVisibility(null)).toBe('—');
    expect(formatVisibility(10000)).toBe('10 km or more');
    expect(formatVisibility(4000)).toBe('4,000 m');
    expect(formatWind(5, 12)).toBe('005° 12 kt');
    expect(formatWind(null, 3)).toBe('Variable 3 kt');
    expect(formatWind(null, 0)).toBe('Calm');
  });

  it('shows when a gust came after the METAR', () => {
    const at = '2026-11-11T04:00:00.000Z';
    expect(
      formatGust({observedAt: at, gustKt: null, gustObservedAt: null}),
    ).toBe('—');
    expect(formatGust({observedAt: at, gustKt: 38, gustObservedAt: at})).toBe(
      '38 kt',
    );
    expect(
      formatGust({
        observedAt: at,
        gustKt: 25,
        gustObservedAt: '2026-11-11T04:20:00.000Z',
      }),
    ).toBe('25 kt at 14:20 AEST');
  });
});
