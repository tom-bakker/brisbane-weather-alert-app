import {XMLParser} from 'fast-xml-parser';
import type {AirportConfig} from './airports';
import type {AlertLevel, BomWarning} from './types';

interface Classification {
  kind: BomWarning['kind'];
  level: AlertLevel;
}

interface AmocArea {
  '@_description'?: string;
}

interface AmocHazard {
  '@_index'?: string | number;
  '@_phase'?: string;
  headline?: string;
  'area-list'?: {area?: AmocArea | AmocArea[]};
}

interface AmocDocument {
  amoc?: {
    identifier?: string;
    phase?: string;
    'issue-time-utc'?: string;
    'expiry-time'?: string;
    hazard?: AmocHazard | AmocHazard[];
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Maps a BoM headline to the alert it drives, or null if not relevant. */
export function classifyHeadline(headline: string): Classification | null {
  if (/cancel/i.test(headline)) return null;
  if (/cyclone/i.test(headline)) {
    const watchOnly = /watch/i.test(headline) && !/warning/i.test(headline);
    return {kind: 'cyclone', level: watchOnly ? 'watch' : 'warning'};
  }
  if (/thunderstorm/i.test(headline)) {
    return {kind: 'thunderstorm', level: 'warning'};
  }
  return null;
}

function mentionsAirport(text: string, airport: AirportConfig): boolean {
  const lower = text.toLowerCase();
  return airport.warningKeywords.some((k) => lower.includes(k.toLowerCase()));
}

function hazardText(hazard: AmocHazard): string {
  const areas = toArray(hazard['area-list']?.area).map(
    (a) => a['@_description'] ?? '',
  );
  return [hazard.headline ?? '', ...areas].join(' | ');
}

/**
 * Extracts thunderstorm and cyclone warnings that affect the given airports
 * from one BoM AMOC XML document. Cancelled and expired items are skipped.
 */
export function parseAmocWarnings(
  xml: string,
  airports: readonly AirportConfig[],
  now: Date,
): BomWarning[] {
  const amoc = (parser.parse(xml) as AmocDocument).amoc;
  if (amoc === undefined || amoc.phase === 'CAN') return [];
  const expiresAt = amoc['expiry-time'] ?? null;
  if (expiresAt !== null && new Date(expiresAt) < now) return [];

  const warnings: BomWarning[] = [];
  for (const hazard of toArray(amoc.hazard)) {
    const headline = hazard.headline ?? '';
    const classification = classifyHeadline(headline);
    if (hazard['@_phase'] === 'CAN' || classification === null) continue;
    const text = hazardText(hazard);
    for (const airport of airports.filter((a) => mentionsAirport(text, a))) {
      warnings.push({
        id: `${amoc.identifier ?? 'unknown'}-${hazard['@_index'] ?? 0}-${airport.code}`,
        airport: airport.code,
        ...classification,
        headline,
        issuedAt: amoc['issue-time-utc'] ?? now.toISOString(),
        expiresAt,
      });
    }
  }
  return warnings;
}
