import type {AirportCode, Observation} from './types';
import {apparentTemperatureC, milesToMetres} from './units';

/** The subset of an aviationweather.gov METAR JSON record that we read. */
export interface AwcMetar {
  icaoId: string;
  obsTime: number;
  rawOb: string;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  wxString?: string | null;
  clouds?: {cover: string; base: number | null}[] | null;
  temp?: number | null;
  dewp?: number | null;
  altim?: number | null;
}

const CAVOK_METRES = 10_000;

/**
 * Reads visibility in metres from the raw METAR ("9999", "0800", "CAVOK").
 * Australian METARs report metres; the JSON field is in statute miles.
 */
export function visibilityFromRaw(raw: string): number | null {
  const tokens = raw.split(/\s+/);
  if (tokens.includes('CAVOK')) return CAVOK_METRES;
  const token = tokens.find((t) => /^\d{4}(NDV)?$/.test(t));
  if (token === undefined) return null;
  const metres = Number(token.slice(0, 4));
  return metres === 9999 ? CAVOK_METRES : metres;
}

function visibilityFromMiles(visib: AwcMetar['visib']): number | null {
  if (visib === undefined || visib === null) return null;
  const miles = parseFloat(String(visib));
  return Number.isNaN(miles) ? null : milesToMetres(miles);
}

function formatClouds(clouds: AwcMetar['clouds']): string {
  return (clouds ?? [])
    .map(({cover, base}) =>
      base === null ? cover : `${cover}${String(base / 100).padStart(3, '0')}`,
    )
    .join(' ');
}

function numberOrNull(value: number | null | undefined): number | null {
  return value ?? null;
}

/** Converts an aviationweather.gov METAR record into an Observation. */
export function parseMetar(
  metar: AwcMetar,
  airport: AirportCode,
  uvIndex: number | null,
): Observation {
  const windKt = metar.wspd ?? 0;
  const tempC = numberOrNull(metar.temp);
  const dewpointC = numberOrNull(metar.dewp);
  const observedAt = new Date(metar.obsTime * 1000).toISOString();
  const gustKt = numberOrNull(metar.wgst);
  return {
    airport,
    observedAt,
    rawMetar: metar.rawOb,
    windDirDeg:
      typeof metar.wdir === 'number' && windKt > 0 ? metar.wdir : null,
    windKt,
    gustKt,
    gustObservedAt: gustKt === null ? null : observedAt,
    visibilityM:
      visibilityFromRaw(metar.rawOb) ?? visibilityFromMiles(metar.visib),
    weatherCodes: metar.wxString ?? '',
    cloud: formatClouds(metar.clouds),
    tempC,
    dewpointC,
    qnhHpa: numberOrNull(metar.altim),
    apparentTempC:
      tempC !== null && dewpointC !== null
        ? apparentTemperatureC(tempC, dewpointC, windKt)
        : null,
    uvIndex,
  };
}
