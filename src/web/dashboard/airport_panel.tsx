import {clsx} from 'clsx';
import {
  CircleCheckBig,
  CloudLightning,
  Droplets,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Navigation2,
  OctagonX,
  PlaneTakeoff,
  Radar,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react';
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
import type {
  AlertCategory,
  AlertLevel,
  AlertRecord,
  Observation,
} from '../../domain/types';
import {uvBand} from '../../domain/uv';
import {CategoryIcon} from '../components/category_icon';
import {LEVEL_STYLES, LevelBadge} from '../components/ui';
import type {AirportSnapshot} from '../data/api';
import {formatGust, formatVisibility, formatWind, withUnit} from './format';
import {conditionFromMetar, conditionFromSymbol, isNightAest} from './weather';
import {WeatherIcon} from './weather_icon';

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
  icon: Icon,
  iconColor,
  level,
  children,
}: {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  level: AlertLevel | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={clsx(
        'bg-surface rounded-xl border-2 p-4 shadow-sm',
        level === null ? 'border-line' : LEVEL_STYLES[level].border,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ink-soft flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span
            className={clsx(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              iconColor,
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          {title}
        </h3>
        {level !== null && <LevelBadge level={level} />}
      </div>
      <div className="space-y-1 text-sm">{children}</div>
    </section>
  );
}

function Reading({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <p className="flex justify-between gap-2">
      <span className="text-muted inline-flex items-center gap-1.5">
        {Icon !== undefined && (
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {label}
      </span>
      <span className="text-ink font-medium">{value}</span>
    </p>
  );
}

/** An arrow pointing the way the wind blows (opposite of where it's from). */
function WindArrow({fromDeg}: {fromDeg: number | null}) {
  if (fromDeg === null) return null;
  return (
    <Navigation2
      aria-hidden="true"
      className="inline h-3.5 w-3.5 fill-current text-sky-600 dark:text-sky-400"
      style={{transform: `rotate(${(fromDeg + 180) % 360}deg)`}}
    />
  );
}

const UV_MAX = 12;

/** A bar from green to violet showing the UV index on the 0–11+ scale. */
function UvMeter({index}: {index: number}) {
  const percent = Math.min(index, UV_MAX) / UV_MAX;
  return (
    <div aria-hidden="true" className="pt-1">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 via-40% to-violet-600">
        <span
          className="bg-ink absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{left: `${percent * 100}%`}}
        />
      </div>
    </div>
  );
}

/** Big icon, temperature and condition for the latest observation. */
function CurrentConditions({obs}: {obs: Observation}) {
  const condition = conditionFromMetar(
    obs.weatherCodes,
    obs.cloud,
    isNightAest(obs.observedAt),
  );
  return (
    <section
      aria-label="Current conditions"
      className="border-line flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-gradient-to-br from-sky-50 to-indigo-50 p-4 shadow-sm dark:from-sky-950/60 dark:to-indigo-950/60"
    >
      <WeatherIcon condition={condition} className="h-16 w-16 stroke-[1.5]" />
      <div>
        <p className="text-4xl font-semibold tracking-tight">
          {withUnit(obs.tempC, '°C')}
        </p>
        <p className="text-muted text-sm">
          {condition.label}
          {obs.apparentTempC !== null && ` · Feels like ${obs.apparentTempC}°C`}
        </p>
      </div>
      <dl className="ml-auto grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted flex items-center gap-1">
          <Wind aria-hidden="true" className="h-3.5 w-3.5" /> Wind
        </dt>
        <dt className="text-muted flex items-center gap-1">
          <Eye aria-hidden="true" className="h-3.5 w-3.5" /> Vis
        </dt>
        <dt className="text-muted flex items-center gap-1">
          <Gauge aria-hidden="true" className="h-3.5 w-3.5" /> QNH
        </dt>
        <dd className="flex items-center gap-1 font-medium">
          <WindArrow fromDeg={obs.windDirDeg} />
          {formatWind(obs.windDirDeg, obs.windKt)}
        </dd>
        <dd className="font-medium">{formatVisibility(obs.visibilityM)}</dd>
        <dd className="font-medium">{withUnit(obs.qnhHpa, ' hPa')}</dd>
      </dl>
    </section>
  );
}

/** Active alerts, most severe first, pinned above the tiles. */
function AlertBanner({alerts}: {alerts: readonly AlertRecord[]}) {
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
        <CircleCheckBig aria-hidden="true" className="h-4 w-4" />
        No active alerts
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
            'flex gap-3 rounded-xl border-2 p-3 text-sm',
            alert.level === 'standdown'
              ? 'border-red-700 bg-red-700 font-semibold text-white'
              : clsx(
                  LEVEL_STYLES[alert.level].tint,
                  LEVEL_STYLES[alert.level].border,
                ),
          )}
        >
          <CategoryIcon
            category={alert.category}
            className="mt-0.5 h-5 w-5 shrink-0 opacity-80"
          />
          <div className="min-w-0">
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
          </div>
        </li>
      ))}
    </ul>
  );
}

function ForecastStrip({snapshot}: {snapshot: AirportSnapshot}) {
  const hours = snapshot.forecast?.hours.slice(0, 12) ?? [];
  if (hours.length === 0)
    return <p className="text-muted text-sm">No forecast available.</p>;
  return (
    <ol
      aria-label="Hourly forecast"
      className="flex gap-2 overflow-x-auto pb-2"
    >
      {hours.map((h) => {
        const condition = conditionFromSymbol(h.symbol);
        return (
          <li
            key={h.time}
            className="border-line bg-surface flex min-w-24 flex-col items-center gap-1 rounded-xl border p-2 text-center text-xs shadow-sm"
          >
            <p className="font-semibold">{formatAestTime(h.time)}</p>
            <WeatherIcon condition={condition} className="h-8 w-8" />
            <p className="text-base font-semibold">{withUnit(h.tempC, '°')}</p>
            <p className="text-muted inline-flex items-center gap-1">
              <Wind aria-hidden="true" className="h-3 w-3" />
              {withUnit(h.windKt, ' kt')}
            </p>
            <p className="text-muted inline-flex items-center gap-1">
              <Droplets aria-hidden="true" className="h-3 w-3" />
              {withUnit(h.precipMm, ' mm')}
            </p>
            <p className="text-muted inline-flex items-center gap-1">
              <Sun aria-hidden="true" className="h-3 w-3" />
              UV {withUnit(h.uvIndex, '')}
            </p>
            <p className="text-muted">{condition.label}</p>
          </li>
        );
      })}
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
    <article aria-label={airport.name} className="@container min-w-0 space-y-4">
      <header className="flex items-start gap-3">
        <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          <PlaneTakeoff aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold">
            {airport.name}{' '}
            <span className="text-muted">
              ({airport.code} / {airport.iata})
            </span>
          </h2>
          <p className="text-muted text-sm">
            {obs === null
              ? 'No observation received yet.'
              : `Observed ${formatUtcAndAest(obs.observedAt)} (${formatAge(obs.observedAt, now)})`}
          </p>
        </div>
      </header>

      {stale && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-red-700 p-3 text-sm font-semibold text-white"
        >
          <OctagonX aria-hidden="true" className="h-5 w-5 shrink-0" />
          Weather data is stale. Do not rely on this screen; check official
          sources.
        </p>
      )}

      {obs !== null && <CurrentConditions obs={obs} />}

      <AlertBanner alerts={alerts} />

      {/* Columns follow the panel's width, not the window's. */}
      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">
        <Tile
          title="Wind"
          icon={Wind}
          iconColor="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
          level={levelFor(alerts, 'wind')}
        >
          <Reading
            label="Wind"
            value={
              obs === null ? (
                '—'
              ) : (
                <span className="inline-flex items-center gap-1">
                  <WindArrow fromDeg={obs.windDirDeg} />
                  {formatWind(obs.windDirDeg, obs.windKt)}
                </span>
              )
            }
          />
          <Reading label="Gust" value={obs === null ? '—' : formatGust(obs)} />
        </Tile>
        <Tile
          title="Visibility and cloud"
          icon={Eye}
          iconColor="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
          level={levelFor(alerts, 'visibility')}
        >
          <Reading
            label="Visibility"
            value={formatVisibility(obs?.visibilityM ?? null)}
          />
          <Reading label="Weather" value={obs?.weatherCodes || 'Nil'} />
          <Reading label="Cloud" value={obs?.cloud || 'Nil reported'} />
        </Tile>
        <Tile
          title="Temperature and pressure"
          icon={Thermometer}
          iconColor="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
          level={levelFor(alerts, 'heat')}
        >
          <Reading
            label="Air"
            icon={Thermometer}
            value={withUnit(obs?.tempC ?? null, ' C')}
          />
          <Reading
            label="Dew point"
            icon={Droplets}
            value={withUnit(obs?.dewpointC ?? null, ' C')}
          />
          <Reading
            label="Feels like"
            icon={Thermometer}
            value={withUnit(obs?.apparentTempC ?? null, ' C')}
          />
          <Reading
            label="QNH"
            icon={Gauge}
            value={withUnit(obs?.qnhHpa ?? null, ' hPa')}
          />
        </Tile>
        <Tile
          title="UV index"
          icon={Sun}
          iconColor="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          level={levelFor(alerts, 'uv')}
        >
          <Reading
            label="UV (clear sky)"
            value={withUnit(obs?.uvIndex ?? null, '')}
          />
          {obs?.uvIndex != null && (
            <>
              <UvMeter index={obs.uvIndex} />
              <p className="text-ink-soft">{uvBand(obs.uvIndex)}</p>
            </>
          )}
        </Tile>
        <Tile
          title="Storms and warnings"
          icon={CloudLightning}
          iconColor="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
          level={levelFor(alerts, 'thunderstorm', 'cyclone')}
        >
          {snapshot.warnings.length === 0 ? (
            <p className="text-ink-soft">
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
        <Tile
          title="Radar"
          icon={Radar}
          iconColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          level={null}
        >
          <a
            href={airport.radarUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link inline-flex items-center gap-1 underline"
          >
            Open the BoM radar loop for {airport.name}
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        </Tile>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Next 12 hours</h3>
        <ForecastStrip snapshot={snapshot} />
      </section>

      <details className="border-line bg-surface rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          <FileText aria-hidden="true" className="mr-1 inline h-4 w-4" />
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
