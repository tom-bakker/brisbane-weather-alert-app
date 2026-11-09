const KT_PER_MS = 1.943844;
const METRES_PER_STATUTE_MILE = 1609.344;

/** Metres per second to knots, rounded. */
export function msToKnots(ms: number): number {
  return Math.round(ms * KT_PER_MS);
}

/** Statute miles to metres, rounded. */
export function milesToMetres(miles: number): number {
  return Math.round(miles * METRES_PER_STATUTE_MILE);
}

/**
 * BoM apparent temperature (Steadman, non-radiation) from air temperature,
 * dew point and wind. Vapour pressure comes from the dew point.
 */
export function apparentTemperatureC(
  tempC: number,
  dewpointC: number,
  windKt: number,
): number {
  const vapourPressureHpa =
    6.105 * Math.exp((17.27 * dewpointC) / (237.7 + dewpointC));
  const windMs = windKt / KT_PER_MS;
  const apparent = tempC + 0.33 * vapourPressureHpa - 0.7 * windMs - 4.0;
  return Math.round(apparent * 10) / 10;
}
