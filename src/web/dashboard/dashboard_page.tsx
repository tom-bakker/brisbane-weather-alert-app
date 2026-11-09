import {clsx} from 'clsx';
import {useCallback, useEffect, useState} from 'react';
import {AIRPORTS} from '../../domain/airports';
import {formatAge, formatUtcAndAest} from '../../domain/time';
import type {AirportCode, FeedLogEntry} from '../../domain/types';
import {Card, ErrorText} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {AirportPanel} from './airport_panel';

type View = AirportCode | 'both';

const VIEWS: {id: View; label: string}[] = [
  ...AIRPORTS.map((a) => ({id: a.code, label: `${a.name} (${a.code})`})),
  {id: 'both', label: 'Both'},
];

function FeedHealth({feeds, now}: {feeds: readonly FeedLogEntry[]; now: Date}) {
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Feed health</h2>
      {feeds.length === 0 ? (
        <p className="text-sm text-gray-600">No feed runs recorded yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {feeds.map((f) => (
            <li
              key={f.source}
              className="flex flex-wrap justify-between gap-2 py-1"
            >
              <span className="font-mono">{f.source}</span>
              <span
                className={
                  f.ok ? 'text-green-800' : 'font-semibold text-red-700'
                }
              >
                {f.ok ? '✓ OK' : `✗ Failed: ${f.error ?? 'unknown error'}`}
              </span>
              <span className="text-gray-600" title={formatUtcAndAest(f.runAt)}>
                {formatAge(f.runAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface DashboardPageProps {
  refreshMs?: number;
  clock?: () => Date;
}

/** Live conditions per airport, refreshed every minute. */
export function DashboardPage({
  refreshMs = 60_000,
  clock = () => new Date(),
}: DashboardPageProps) {
  const api = useApi();
  const load = useCallback(() => api.loadDashboard(), [api]);
  const {data, error, loading, reload} = useAsync(load);
  const [view, setView] = useState<View>('YBBN');

  useEffect(() => {
    const timer = setInterval(reload, refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);

  const now = clock();
  const shown =
    data?.airports.filter((a) => view === 'both' || a.code === view) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Airport"
          className="flex flex-wrap gap-1"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={clsx(
                'rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none',
                view === v.id
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-300 bg-white text-gray-700',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600" aria-live="polite">
          {loading ? 'Refreshing…' : 'Auto-refreshes every minute'}
        </p>
      </div>
      <ErrorText
        message={
          error === null ? null : `Could not load weather data: ${error}`
        }
      />
      <div className={clsx('grid gap-8', view === 'both' && 'xl:grid-cols-2')}>
        {shown.map((snapshot) => (
          <AirportPanel key={snapshot.code} snapshot={snapshot} now={now} />
        ))}
      </div>
      {data !== null && <FeedHealth feeds={data.feeds} now={now} />}
    </div>
  );
}
