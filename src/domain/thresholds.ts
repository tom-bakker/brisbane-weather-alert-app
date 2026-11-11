import {levelLabel} from './levels';
import {ALERT_LEVELS, type AlertLevel} from './types';

/** A level that applies once a value reaches `limit`. */
export interface Band {
  limit: number;
  level: AlertLevel;
}

/** The alert categories driven by a measured value, in settings order. */
export const THRESHOLD_CATEGORIES = [
  'wind',
  'visibility',
  'heat',
  'uv',
] as const;
export type ThresholdCategory = (typeof THRESHOLD_CATEGORIES)[number];

/** Where each level starts; null when the category never uses that level. */
export type LevelLimits = Record<AlertLevel, number | null>;
export type Thresholds = Record<ThresholdCategory, LevelLimits>;

/** One category's saved limits. */
export interface CategoryThresholds {
  category: ThresholdCategory;
  limits: LevelLimits;
}

/** How a category's reading is compared with its limits. */
export interface Measure {
  /**
   * "above": alert at or above a limit (>=); "below": at or under it (<=).
   * A reading that equals a limit always raises that level.
   */
  direction: 'above' | 'below';
  /** What is measured, e.g. "Wind or gust". */
  reading: string;
  /** Unit after a value, e.g. "kt"; empty for a plain index. */
  unit: string;
  /** Sane range for a limit, inclusive. */
  min: number;
  max: number;
}

export const MEASURES: Record<ThresholdCategory, Measure> = {
  /** Highest of sustained wind and gust. */
  wind: {
    direction: 'above',
    reading: 'Wind or gust',
    unit: 'kt',
    min: 1,
    max: 150,
  },
  visibility: {
    direction: 'below',
    reading: 'Visibility',
    unit: 'm',
    min: 1,
    // Clear sky (CAVOK or 9999) is stored as 10,000 m, so a limit there
    // would alert on every clear day.
    max: 9999,
  },
  heat: {
    direction: 'above',
    reading: 'Apparent temperature',
    unit: 'C',
    min: 0,
    max: 60,
  },
  /** UV index bands per ARPANSA / Cancer Council. */
  uv: {direction: 'above', reading: 'UV index', unit: '', min: 0, max: 20},
};

/**
 * Proposed defaults from the spec sheet, used until an admin saves their
 * own. They must be aligned with company ground-handling procedures before
 * go-live.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  wind: {info: null, watch: 25, warning: 35, standdown: 45},
  visibility: {info: null, watch: 5000, warning: 800, standdown: null},
  heat: {info: null, watch: 35, warning: 38, standdown: null},
  uv: {info: 3, watch: 8, warning: 11, standdown: null},
};

/**
 * How often the alert cycle runs (the Supabase pg_cron job in
 * supabase/migrations/20261111000000_alert_cycle_cron.sql). Keep in step.
 */
export const ALERT_CYCLE_MINUTES = 10;

/** METARs are half-hourly, so allow for one missed report plus delay. */
export const STALE_AFTER_MINUTES = 75;

/** Conditions must stay below an alert's level this long before it drops. */
export const HOLD_MINUTES = 30;

/** The levels a category uses, least severe first. */
export function bandsFor(limits: LevelLimits): Band[] {
  const bands: Band[] = [];
  for (const level of ALERT_LEVELS) {
    const limit = limits[level];
    if (limit !== null) bands.push({limit, level});
  }
  return bands;
}

/** The level a reading reaches under the given thresholds, if any. */
export function levelFor(
  category: ThresholdCategory,
  value: number,
  thresholds: Thresholds,
): AlertLevel | null {
  const bands = bandsFor(thresholds[category]);
  return MEASURES[category].direction === 'above'
    ? levelAtOrAbove(value, bands)
    : levelAtOrBelow(value, bands);
}

/** Level of the last band whose limit `value` reaches (>=). */
export function levelAtOrAbove(
  value: number,
  bands: readonly Band[],
): AlertLevel | null {
  return lastMatch(bands, (band) => value >= band.limit);
}

/** Level of the last band whose limit `value` is at or under (<=). */
export function levelAtOrBelow(
  value: number,
  bands: readonly Band[],
): AlertLevel | null {
  return lastMatch(bands, (band) => value <= band.limit);
}

function lastMatch(
  bands: readonly Band[],
  matches: (band: Band) => boolean,
): AlertLevel | null {
  let level: AlertLevel | null = null;
  for (const band of bands) {
    if (matches(band)) level = band.level;
  }
  return level;
}

/** A limit with its unit, e.g. "5,000 m" or "8". */
export function formatLimit(
  category: ThresholdCategory,
  limit: number,
): string {
  const {unit} = MEASURES[category];
  const value = limit.toLocaleString('en-AU');
  return unit === '' ? value : `${value} ${unit}`;
}

function rangeProblem(category: ThresholdCategory, band: Band): string | null {
  const {min, max} = MEASURES[category];
  if (Number.isFinite(band.limit) && band.limit >= min && band.limit <= max)
    return null;
  return (
    `${levelLabel(band.level)} must be between ` +
    `${formatLimit(category, min)} and ${formatLimit(category, max)}.`
  );
}

function orderProblem(
  category: ThresholdCategory,
  previous: Band,
  band: Band,
): string | null {
  const above = MEASURES[category].direction === 'above';
  const inOrder = above
    ? band.limit > previous.limit
    : band.limit < previous.limit;
  if (inOrder) return null;
  return (
    `${levelLabel(band.level)} must be ${above ? 'higher' : 'lower'} ` +
    `than ${levelLabel(previous.level)}.`
  );
}

/**
 * Why a category's limits can't be saved, or null when they are fine. Each
 * more severe level must need a more extreme reading.
 */
export function thresholdsProblem(
  category: ThresholdCategory,
  limits: LevelLimits,
): string | null {
  const bands = bandsFor(limits);
  if (bands.length === 0) return 'Set at least one level.';
  for (const [i, band] of bands.entries()) {
    const previous = bands[i - 1];
    const problem =
      rangeProblem(category, band) ??
      (previous === undefined ? null : orderProblem(category, previous, band));
    if (problem !== null) return problem;
  }
  return null;
}

/** The default thresholds with any saved ones laid over them. */
export function mergeThresholds(
  saved: readonly CategoryThresholds[],
): Thresholds {
  const thresholds = {...DEFAULT_THRESHOLDS};
  for (const {category, limits} of saved) thresholds[category] = limits;
  return thresholds;
}

/** True when two sets of limits trigger the same levels. */
export function sameLimits(a: LevelLimits, b: LevelLimits): boolean {
  return ALERT_LEVELS.every((level) => a[level] === b[level]);
}

/**
 * One line on what triggers a category, e.g. "Wind or gust of 25 kt or
 * more (Watch), 35 kt (Warning), 45 kt (Stand-down)".
 */
export function describeThresholds(
  category: ThresholdCategory,
  limits: LevelLimits,
): string {
  const {direction, reading} = MEASURES[category];
  const above = direction === 'above';
  const parts = bandsFor(limits).map((band, i) => {
    const orBeyond = i === 0 ? (above ? ' or more' : ' or less') : '';
    return `${formatLimit(category, band.limit)}${orBeyond} (${levelLabel(band.level)})`;
  });
  return `${reading} of ${parts.join(', ')}`;
}
