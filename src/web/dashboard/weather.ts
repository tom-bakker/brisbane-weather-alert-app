/**
 * Turns MET Norway symbol codes (for example "partlycloudy_night") and METAR
 * groups into a small set of display conditions.
 */

export type WeatherKind =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy_rain'
  | 'showers'
  | 'thunder'
  | 'sleet'
  | 'snow'
  | 'unknown';

export interface WeatherCondition {
  kind: WeatherKind;
  night: boolean;
  label: string;
}

/** Readable names for the MET Norway base codes the app is likely to see. */
const BASE_LABELS: Record<string, string> = {
  clearsky: 'Clear',
  fair: 'Fair',
  partlycloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  lightrain: 'Light rain',
  rain: 'Rain',
  heavyrain: 'Heavy rain',
  lightrainshowers: 'Light showers',
  rainshowers: 'Showers',
  heavyrainshowers: 'Heavy showers',
  lightrainandthunder: 'Light rain and thunder',
  rainandthunder: 'Rain and thunder',
  heavyrainandthunder: 'Heavy rain and thunder',
  lightrainshowersandthunder: 'Light showers and thunder',
  rainshowersandthunder: 'Showers and thunder',
  heavyrainshowersandthunder: 'Heavy showers and thunder',
  sleet: 'Sleet',
  snow: 'Snow',
};

function kindOfBase(base: string): WeatherKind {
  if (base.includes('thunder')) return 'thunder';
  if (base.includes('snow')) return 'snow';
  if (base.includes('sleet')) return 'sleet';
  if (base.includes('showers')) return 'showers';
  if (base.startsWith('heavyrain')) return 'heavy_rain';
  if (base.startsWith('lightrain')) return 'drizzle';
  if (base.includes('rain')) return 'rain';
  if (base === 'fog') return 'fog';
  if (base === 'cloudy') return 'cloudy';
  if (base === 'partlycloudy' || base === 'fair') return 'partly_cloudy';
  if (base === 'clearsky') return 'clear';
  return 'unknown';
}

const VARIANTS = ['day', 'night', 'polartwilight'];

/** Splits "partlycloudy_night" into base and variant ("" when absent). */
function splitSymbol(symbol: string): {base: string; variant: string} {
  const parts = symbol.split('_');
  const last = parts[parts.length - 1] ?? '';
  const variant = VARIANTS.includes(last) ? last : '';
  const baseParts = variant === '' ? parts : parts.slice(0, -1);
  return {base: baseParts.join(''), variant};
}

/** The condition for a MET Norway symbol code. */
export function conditionFromSymbol(symbol: string): WeatherCondition {
  const {base, variant} = splitSymbol(symbol);
  const night = variant === 'night';
  const kind = kindOfBase(base);
  const name = BASE_LABELS[base] ?? (base === '' ? 'Unknown' : base);
  const label = variant === '' ? name : `${name} (${variant})`;
  return {kind, night, label};
}

const METAR_LABELS: Record<WeatherKind, string> = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog or mist',
  drizzle: 'Drizzle',
  rain: 'Rain',
  heavy_rain: 'Heavy rain',
  showers: 'Showers',
  thunder: 'Thunderstorm',
  sleet: 'Sleet',
  snow: 'Snow',
  unknown: 'Unknown',
};

function kindFromWeatherCodes(codes: string): WeatherKind | null {
  if (/TS/.test(codes)) return 'thunder';
  if (/SN/.test(codes)) return 'snow';
  if (/SH/.test(codes)) return 'showers';
  if (/\+RA/.test(codes)) return 'heavy_rain';
  if (/DZ|-RA/.test(codes)) return 'drizzle';
  if (/RA/.test(codes)) return 'rain';
  if (/FG|BR|HZ/.test(codes)) return 'fog';
  return null;
}

function kindFromCloud(cloud: string): WeatherKind {
  if (/BKN|OVC/.test(cloud)) return 'cloudy';
  if (/FEW|SCT/.test(cloud)) return 'partly_cloudy';
  return 'clear';
}

const AEST_OFFSET_HOURS = 10;

/**
 * Whether `iso` falls between 18:00 and 06:00 AEST. Both airports are in
 * Queensland, which has no daylight saving.
 */
export function isNightAest(iso: string): boolean {
  const hour = (new Date(iso).getUTCHours() + AEST_OFFSET_HOURS) % 24;
  return hour < 6 || hour >= 18;
}

/**
 * The current condition from a METAR's present weather ("-SHRA") and cloud
 * ("SCT025 BKN040") groups. Weather wins over cloud.
 */
export function conditionFromMetar(
  weatherCodes: string,
  cloud: string,
  night: boolean,
): WeatherCondition {
  const kind = kindFromWeatherCodes(weatherCodes) ?? kindFromCloud(cloud);
  return {kind, night, label: METAR_LABELS[kind]};
}
