import {clsx} from 'clsx';
import {Activity, Database, MapPin, RefreshCw} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {AIRPORTS} from '../../domain/airports';
import {ALERT_CYCLE_MINUTES} from '../../domain/thresholds';
import {formatAge, formatUtcAndAest} from '../../domain/time';
import type {AirportCode, FeedLogEntry} from '../../domain/types';
import {Card, ErrorText, StatusText} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {AirportPanel} from './airport_panel';

function FeedHealth({feeds, now}: {feeds: readonly FeedLogEntry[]; now: Date}) {
  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Activity aria-hidden="true" className="text-accent h-5 w-5" />
        Feed health
      </h2>
      {feeds.length === 0 ? (
        <p className="text-muted text-sm">No feed runs recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted text-xs tracking-wide uppercase">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Source
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Records
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Last run
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {feeds.map((f) => (
                <tr key={f.source} className="align-top">
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-2 font-mono">
                      <Database
                        aria-hidden="true"
                        className="text-muted h-3.5 w-3.5"
                      />
                      {f.source}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusText ok={f.ok}>
                      {f.ok ? 'OK' : `Failed: ${f.error ?? 'unknown error'}`}
                    </StatusText>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {f.records}
                  </td>
                  <td
                    className="text-muted py-2 text-right whitespace-nowrap"
                    title={formatUtcAndAest(f.runAt)}
                  >
                    {formatAge(f.runAt, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface DashboardPageProps {
  refreshMs?: number;
  clock?: () => Date;
}

/**
 * Live conditions per airport. New data arrives every ALERT_CYCLE_MINUTES;
 * the page re-reads every minute so it shows a new cycle soon after it lands.
 */
export function DashboardPage({
  refreshMs = 60_000,
  clock = () => new Date(),
}: DashboardPageProps) {
  const api = useApi();
  const load = useCallback(() => api.loadDashboard(), [api]);
  const {data, error, loading, reload} = useAsync(load);
  const [view, setView] = useState<AirportCode>('YBBN');

  useEffect(() => {
    const timer = setInterval(reload, refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);

  const now = clock();
  const shown = data?.airports.filter((a) => a.code === view) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div
          role="tablist"
          aria-label="Airport"
          className="border-line bg-surface inline-flex flex-wrap gap-1 rounded-lg border p-1 shadow-sm"
        >
          {AIRPORTS.map((a) => (
            <button
              key={a.code}
              type="button"
              role="tab"
              aria-selected={view === a.code}
              onClick={() => setView(a.code)}
              className={clsx(
                'focus:ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus:ring-2 focus:outline-none',
                view === a.code
                  ? 'bg-ink text-surface shadow-sm'
                  : 'text-ink-soft hover:bg-subtle',
              )}
            >
              <MapPin aria-hidden="true" className="h-4 w-4" />
              {a.name} ({a.code})
            </button>
          ))}
        </div>
        <p
          className="text-muted mt-2.5 inline-flex items-center gap-1 text-xs"
          aria-live="polite"
        >
          <RefreshCw
            aria-hidden="true"
            className={clsx('h-3 w-3', loading && 'animate-spin')}
          />
          {loading
            ? 'Refreshing…'
            : `Auto-updates every ${ALERT_CYCLE_MINUTES} minutes`}
        </p>
      </div>
      <ErrorText
        message={
          error === null ? null : `Could not load weather data: ${error}`
        }
      />
      <div className="grid gap-8">
        {shown.map((snapshot) => (
          <AirportPanel key={snapshot.code} snapshot={snapshot} now={now} />
        ))}
      </div>
      {data !== null && <FeedHealth feeds={data.feeds} now={now} />}
    </div>
  );
}
