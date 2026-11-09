import type {ForecastHour} from './types';
import {msToKnots} from './units';

/** The subset of a MET Norway Locationforecast 2.0 response that we read. */
export interface MetNoResponse {
  properties: {
    meta: {updated_at: string};
    timeseries: MetNoStep[];
  };
}

export interface MetNoStep {
  time: string;
  data: {
    instant: {details: Partial<Record<string, number>>};
    next_1_hours?: {
      summary: {symbol_code: string};
      details?: {precipitation_amount?: number};
    };
  };
}

const HOUR_MS = 60 * 60 * 1000;

function startsWithinOrAfterCurrentHour(step: MetNoStep, now: Date): boolean {
  return new Date(step.time).getTime() + HOUR_MS > now.getTime();
}

/**
 * Clear-sky UV index for the forecast hour containing `now`, or null when no
 * hour covers it (for example, stored hours that have run out).
 */
export function uvIndexAt(
  hours: readonly ForecastHour[],
  now: Date,
): number | null {
  const t = now.getTime();
  const hour = hours.find((h) => {
    const start = new Date(h.time).getTime();
    return start <= t && t < start + HOUR_MS;
  });
  return hour?.uvIndex ?? null;
}

function toForecastHour(step: MetNoStep): ForecastHour {
  const details = step.data.instant.details;
  const windMs = details['wind_speed'];
  return {
    time: step.time,
    tempC: details['air_temperature'] ?? null,
    windKt: windMs === undefined ? null : msToKnots(windMs),
    windDirDeg: details['wind_from_direction'] ?? null,
    precipMm: step.data.next_1_hours?.details?.precipitation_amount ?? null,
    uvIndex: details['ultraviolet_index_clear_sky'] ?? null,
    symbol: step.data.next_1_hours?.summary.symbol_code ?? '',
  };
}

/** Hourly forecast from the current hour, at most `count` hours. */
export function forecastHours(
  res: MetNoResponse,
  now: Date,
  count = 24,
): ForecastHour[] {
  return res.properties.timeseries
    .filter((s) => startsWithinOrAfterCurrentHour(s, now))
    .filter((s) => s.data.next_1_hours !== undefined)
    .slice(0, count)
    .map(toForecastHour);
}
