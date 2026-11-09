import {clsx} from 'clsx';
import type {ReactNode} from 'react';
import {airportByCode} from '../../domain/airports';
import {categoryLabel} from '../../domain/categories';
import {highestLevel, levelRank} from '../../domain/levels';
import {STALE_AFTER_MINUTES} from '../../domain/thresholds';
import {
  formatAestTime,
  formatAge,
  formatUtcAndAest,
  minutesSince,
} from '../../domain/time';
import type {AlertCategory, AlertLevel, AlertRecord} from '../../domain/types';
import {uvBand} from '../../domain/uv';
import {LEVEL_STYLES, LevelBadge} from '../components/ui';
import type {AirportSnapshot} from '../data/api';
import {formatVisibility, formatWind, withUnit} from './format';

function levelFor(
  alerts: readonly AlertRecord[],
  ...categories: AlertCategory[]
): AlertLevel | null {
  return highestLevel(
    alerts.filter((a) => categories.includes(a.category)).map((a) => a.level),
  );
}

/** A dashboard tile whose border and badge show the highest active level. */
function Tile({
  title,
  level,
  children,
}: {
  title: string;
  level: AlertLevel | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={clsx(
        'rounded-md border-2 bg-white p-4 shadow-sm',
        level === null ? 'border-gray-200' : LEVEL_STYLES[level].border,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {level !== null && <LevelBadge level={level} />}
      </div>
      <div className="space-y-1 text-sm">{children}</div>
    </section>
  );
}

function Reading({label, value}: {label: string; value: string}) {
  return (
    <p className="flex justify-between gap-2">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </p>
  );
}

/** Active alerts, most severe first, pinned above the tiles. */
function AlertBanner({alerts}: {alerts: readonly AlertRecord[]}) {
  if (alerts.length === 0) {
    return (
      <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
        ✓ No active alerts
      </p>
    );
  }
  const sorted = [...alerts].sort(
    (a, b) => levelRank(b.level) - levelRank(a.level),
  );
  return (
    <ul aria-label="Active alerts" className="space-y-2">
      {sorted.map((alert) => (
        <li
          key={alert.id}
          className={clsx(
            'rounded-md border-2 p-3 text-sm',
            alert.level === 'standdown'
              ? 'border-red-700 bg-red-700 font-semibold text-white'
              : clsx('bg-white', LEVEL_STYLES[alert.level].border),
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={alert.level} />
            <span className="font-semibold">
              {categoryLabel(alert.category)}: {alert.triggerValue}
            </span>
            <span className="opacity-80">
              since {formatUtcAndAest(alert.startedAt)}
            </span>
          </div>
          <p className="mt-1">{alert.message}</p>
        </li>
      ))}
    </ul>
  );
}

function ForecastStrip({snapshot}: {snapshot: AirportSnapshot}) {
  const hours = snapshot.forecast?.hours.slice(0, 12) ?? [];
  if (hours.length === 0)
    return <p className="text-sm text-gray-600">No forecast available.</p>;
  return (
    <ol
      aria-label="Hourly forecast"
      className="flex gap-2 overflow-x-auto pb-2"
    >
      {hours.map((h) => (
        <li
          key={h.time}
          className="min-w-24 rounded-md border border-gray-200 bg-white p-2 text-center text-xs"
        >
          <p className="font-semibold">{formatAestTime(h.time)}</p>
          <p>{withUnit(h.tempC, ' C')}</p>
          <p>{withUnit(h.windKt, ' kt')}</p>
          <p>{withUnit(h.precipMm, ' mm')}</p>
          <p>UV {withUnit(h.uvIndex, '')}</p>
          <p className="text-gray-600">{h.symbol.replace(/_/g, ' ')}</p>
        </li>
      ))}
    </ol>
  );
}

/** Go/stop picture and supporting detail for one airport. */
export function AirportPanel({
  snapshot,
  now,
}: {
  snapshot: AirportSnapshot;
  now: Date;
}) {
  const airport = airportByCode(snapshot.code);
  const obs = snapshot.observation;
  const alerts = snapshot.alerts;
  const stale =
    obs === null || minutesSince(obs.observedAt, now) > STALE_AFTER_MINUTES;

  return (
    <article aria-label={airport.name} className="min-w-0 space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">
          {airport.name}{' '}
          <span className="text-gray-600">
            ({airport.code} / {airport.iata})
          </span>
        </h2>
        <p className="text-sm text-gray-600">
          {obs === null
            ? 'No observation received yet.'
            : `Observed ${formatUtcAndAest(obs.observedAt)} (${formatAge(obs.observedAt, now)})`}
        </p>
      </header>

      {stale && (
        <p
          role="alert"
          className="rounded-md bg-red-700 p-3 text-sm font-semibold text-white"
        >
          ⛔ Weather data is stale. Do not rely on this screen; check official
          sources.
        </p>
      )}

      <AlertBanner alerts={alerts} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile title="Wind" level={levelFor(alerts, 'wind')}>
          <Reading
            label="Wind"
            value={obs === null ? '—' : formatWind(obs.windDirDeg, obs.windKt)}
          />
          <Reading label="Gust" value={withUnit(obs?.gustKt ?? null, ' kt')} />
        </Tile>
        <Tile
          title="Visibility and cloud"
          level={levelFor(alerts, 'visibility')}
        >
          <Reading
            label="Visibility"
            value={formatVisibility(obs?.visibilityM ?? null)}
          />
          <Reading label="Weather" value={obs?.weatherCodes || 'Nil'} />
          <Reading label="Cloud" value={obs?.cloud || 'Nil reported'} />
        </Tile>
        <Tile title="Temperature and pressure" level={levelFor(alerts, 'heat')}>
          <Reading label="Air" value={withUnit(obs?.tempC ?? null, ' C')} />
          <Reading
            label="Dew point"
            value={withUnit(obs?.dewpointC ?? null, ' C')}
          />
          <Reading
            label="Feels like"
            value={withUnit(obs?.apparentTempC ?? null, ' C')}
          />
          <Reading label="QNH" value={withUnit(obs?.qnhHpa ?? null, ' hPa')} />
        </Tile>
        <Tile title="UV index" level={levelFor(alerts, 'uv')}>
          <Reading
            label="UV (clear sky)"
            value={withUnit(obs?.uvIndex ?? null, '')}
          />
          <p className="text-gray-700">
            {obs?.uvIndex == null ? '' : uvBand(obs.uvIndex)}
          </p>
        </Tile>
        <Tile
          title="Storms and warnings"
          level={levelFor(alerts, 'thunderstorm', 'cyclone')}
        >
          {snapshot.warnings.length === 0 ? (
            <p className="text-gray-700">
              No BoM thunderstorm or cyclone warnings for this area.
            </p>
          ) : (
            <ul className="list-disc pl-4">
              {snapshot.warnings.map((w) => (
                <li key={w.id}>{w.headline}</li>
              ))}
            </ul>
          )}
        </Tile>
        <Tile title="Radar" level={null}>
          <a
            href={airport.radarUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            Open the BoM radar loop for {airport.name}
          </a>
        </Tile>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Next 12 hours</h3>
        <ForecastStrip snapshot={snapshot} />
      </section>

      <details className="rounded-md border border-gray-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Raw METAR and TAF
        </summary>
        <pre className="mt-2 font-mono text-xs break-words whitespace-pre-wrap">
          {obs?.rawMetar ?? 'No METAR'}
        </pre>
        <pre className="mt-2 font-mono text-xs break-words whitespace-pre-wrap">
          {snapshot.forecast?.rawTaf ?? 'No TAF'}
        </pre>
      </details>
    </article>
  );
}
