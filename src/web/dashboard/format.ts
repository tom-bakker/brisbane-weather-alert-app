import {formatAestTime} from '../../domain/time';
import type {Observation} from '../../domain/types';

/** A number with its unit, or an em dash when unknown. */
export function withUnit(value: number | null, unit: string): string {
  return value === null ? '—' : `${value}${unit}`;
}

/** Visibility for display: "10 km or more", "4,000 m". */
export function formatVisibility(metres: number | null): string {
  if (metres === null) return '—';
  if (metres >= 10_000) return '10 km or more';
  return `${metres.toLocaleString('en-AU')} m`;
}

/**
 * Gust for display: "38 kt", or "25 kt at 14:20 AEST" when it was measured
 * later than the METAR (from BoM's station readings).
 */
export function formatGust(
  obs: Pick<Observation, 'observedAt' | 'gustKt' | 'gustObservedAt'>,
): string {
  const gust = withUnit(obs.gustKt, ' kt');
  const at = obs.gustObservedAt;
  if (obs.gustKt === null || at === null || at === obs.observedAt) return gust;
  return `${gust} at ${formatAestTime(at)}`;
}

/** Wind for display: "080° 12 kt", "Calm", "Variable 3 kt". */
export function formatWind(dirDeg: number | null, speedKt: number): string {
  if (speedKt === 0) return 'Calm';
  const dir =
    dirDeg === null
      ? 'Variable'
      : `${String(Math.round(dirDeg)).padStart(3, '0')}°`;
  return `${dir} ${speedKt} kt`;
}
