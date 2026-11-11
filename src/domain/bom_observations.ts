import {XMLParser} from 'fast-xml-parser';
import type {AirportConfig} from './airports';
import {minutesSince} from './time';
import type {AirportCode, Observation} from './types';

/** One airport's latest reading from a BoM automatic weather station. */
export interface BomStationReading {
  airport: AirportCode;
  /** ISO 8601 UTC. */
  observedAt: string;
  gustKt: number | null;
}

/**
 * A BoM reading older than this is not used. The stations report at least
 * half-hourly, so this allows for one late file.
 */
export const BOM_READING_FRESH_MINUTES = 30;

interface BomElement {
  '#text'?: string | number;
  '@_type'?: string;
}

interface BomStation {
  '@_wmo-id'?: string | number;
  period?: {
    '@_time-utc'?: string;
    level?: {element?: BomElement | BomElement[]};
  };
}

interface BomObservationDocument {
  product?: {observations?: {station?: BomStation | BomStation[]}};
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function knots(elements: readonly BomElement[], type: string): number | null {
  const text = elements.find((e) => e['@_type'] === type)?.['#text'];
  if (text === undefined || text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function readingFor(
  airport: AirportConfig,
  stations: readonly BomStation[],
): BomStationReading | null {
  const station = stations.find(
    (s) => String(s['@_wmo-id']) === airport.bomWmoId,
  );
  const time = station?.period?.['@_time-utc'];
  if (station === undefined || time === undefined) return null;
  const elements = toArray(station.period?.level?.element);
  return {
    airport: airport.code,
    observedAt: new Date(time).toISOString(),
    gustKt: knots(elements, 'wind_gust_spd'),
  };
}

/**
 * Reads our airports' stations from a BoM state observations document
 * (for Queensland, IDQ60920.xml on the anonymous FTP service).
 */
export function parseBomObservations(
  xml: string,
  airports: readonly AirportConfig[],
): BomStationReading[] {
  const doc = parser.parse(xml) as BomObservationDocument;
  const stations = toArray(doc.product?.observations?.station);
  return airports
    .map((airport) => readingFor(airport, stations))
    .filter((r): r is BomStationReading => r !== null);
}

/**
 * The observation with the BoM station's gust laid over it. METARs only
 * report a gust when it is 10 kt or more above the mean wind, so a gust
 * that reaches a threshold can be missing from the METAR; the station
 * reports every gust. The higher of the two is kept, with the time it was
 * measured. A stale reading is ignored.
 */
export function withBomGust(
  observation: Observation,
  reading: BomStationReading | undefined,
  now: Date,
): Observation {
  if (
    reading === undefined ||
    reading.gustKt === null ||
    minutesSince(reading.observedAt, now) > BOM_READING_FRESH_MINUTES ||
    reading.gustKt <= (observation.gustKt ?? -1)
  ) {
    return observation;
  }
  return {
    ...observation,
    gustKt: reading.gustKt,
    gustObservedAt: reading.observedAt,
  };
}
