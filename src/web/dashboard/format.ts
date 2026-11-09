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

/** Wind for display: "080° 12 kt", "Calm", "Variable 3 kt". */
export function formatWind(dirDeg: number | null, speedKt: number): string {
  if (speedKt === 0) return 'Calm';
  const dir =
    dirDeg === null
      ? 'Variable'
      : `${String(Math.round(dirDeg)).padStart(3, '0')}°`;
  return `${dir} ${speedKt} kt`;
}
