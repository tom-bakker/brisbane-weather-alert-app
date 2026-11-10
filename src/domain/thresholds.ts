import type {AlertLevel} from './types';

/** A level that applies once a value passes `limit`. */
export interface Band {
  limit: number;
  level: AlertLevel;
}

/**
 * Proposed defaults from the spec sheet. They must be aligned with company
 * ground-handling procedures before go-live.
 */
export const THRESHOLDS = {
  /** Highest of sustained wind and gust, knots (>=). */
  windKt: [
    {limit: 25, level: 'watch'},
    {limit: 35, level: 'warning'},
    {limit: 45, level: 'standdown'},
  ],
  /** Visibility below, metres (<). */
  visibilityM: [
    {limit: 5000, level: 'watch'},
    {limit: 800, level: 'warning'},
  ],
  /** Apparent temperature, deg C (>=). */
  apparentTempC: [
    {limit: 35, level: 'watch'},
    {limit: 38, level: 'warning'},
  ],
  /** UV index bands per ARPANSA / Cancer Council (>=). */
  uvIndex: [
    {limit: 3, level: 'info'},
    {limit: 8, level: 'watch'},
    {limit: 11, level: 'warning'},
  ],
} as const satisfies Record<string, readonly Band[]>;

/**
 * How often the alert cycle runs (the Supabase pg_cron job in
 * supabase/migrations/20261111000000_alert_cycle_cron.sql). Keep in step.
 */
export const ALERT_CYCLE_MINUTES = 10;

/** METARs are half-hourly, so allow for one missed report plus delay. */
export const STALE_AFTER_MINUTES = 75;

/** Conditions must stay below an alert's level this long before it drops. */
export const HOLD_MINUTES = 30;

/** Level of the last band whose limit `value` reaches (>=). */
export function levelAtOrAbove(
  value: number,
  bands: readonly Band[],
): AlertLevel | null {
  return lastMatch(bands, (band) => value >= band.limit);
}

/** Level of the last band whose limit `value` is under (<). */
export function levelBelow(
  value: number,
  bands: readonly Band[],
): AlertLevel | null {
  return lastMatch(bands, (band) => value < band.limit);
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
