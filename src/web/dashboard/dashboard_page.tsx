import {clsx} from 'clsx';
import {
  Activity,
  Columns2,
  Database,
  MapPin,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {AIRPORTS} from '../../domain/airports';
import {ALERT_CYCLE_MINUTES} from '../../domain/thresholds';
import {formatAge, formatUtcAndAest} from '../../domain/time';
import type {AirportCode, FeedLogEntry} from '../../domain/types';
import {Button, Card, ErrorText, StatusText} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {AirportPanel} from './airport_panel';

type View = AirportCode | 'both';

const VIEWS: {id: View; label: string; icon: LucideIcon}[] = [
  ...AIRPORTS.map((a) => ({
    id: a.code,
    label: `${a.name} (${a.code})`,
    icon: MapPin,
  })),
  {id: 'both', label: 'Both', icon: Columns2},
];

/** How long "Refresh now" stays disabled after a run was requested. */
export const REFRESH_COOLDOWN_MS = 120_000;

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

type RefreshState =
  | {kind: 'idle'}
  | {kind: 'requesting'}
  | {kind: 'requested'}
  | {kind: 'failed'; message: string};

/**
 * Asks the back end to run the alert cycle now. Disabled for a while after
 * a successful request so repeated clicks don't queue extra runs.
 */
function RefreshNow({onRequested}: {onRequested: () => void}) {
  const api = useApi();
  const [state, setState] = useState<RefreshState>({kind: 'idle'});

  useEffect(() => {
    if (state.kind !== 'requested') return;
    const timer = setTimeout(
      () => setState({kind: 'idle'}),
      REFRESH_COOLDOWN_MS,
    );
    return () => clearTimeout(timer);
  }, [state.kind]);

  async function refresh() {
    setState({kind: 'requesting'});
    try {
      await api.refreshFeeds();
      setState({kind: 'requested'});
      onRequested();
    } catch (e) {
      setState({
        kind: 'failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const busy = state.kind === 'requesting';
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={() => void refresh()}
        disabled={busy || state.kind === 'requested'}
        title={`Fetch new data now instead of waiting up to ${ALERT_CYCLE_MINUTES} minutes`}
      >
        <RefreshCw
          aria-hidden="true"
          className={clsx('h-4 w-4', busy && 'animate-spin')}
        />
        {busy ? 'Requesting…' : 'Refresh now'}
      </Button>
      <p className="text-muted text-xs" aria-live="polite">
        {state.kind === 'requested' &&
          'Update requested. New data usually arrives in 1–3 minutes.'}
      </p>
      {state.kind === 'failed' && (
        <ErrorText message={`Could not start a refresh: ${state.message}`} />
      )}
    </div>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div
          role="tablist"
          aria-label="Airport"
          className="border-line bg-surface inline-flex flex-wrap gap-1 rounded-lg border p-1 shadow-sm"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={clsx(
                'focus:ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus:ring-2 focus:outline-none',
                view === v.id
                  ? 'bg-ink text-surface shadow-sm'
                  : 'text-ink-soft hover:bg-subtle',
              )}
            >
              <v.icon aria-hidden="true" className="h-4 w-4" />
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-start gap-3">
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
          <RefreshNow onRequested={reload} />
        </div>
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
