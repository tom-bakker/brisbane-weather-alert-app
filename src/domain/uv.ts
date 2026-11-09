/** Sun-protection band for a UV index (ARPANSA categories). */
export function uvBand(uv: number): string {
  if (uv >= 11) return 'Extreme';
  if (uv >= 8) return 'Very high';
  if (uv >= 6) return 'High: sun protection required';
  if (uv >= 3) return 'Moderate: sun protection required';
  return 'Low';
}
