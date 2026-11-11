import type {AirportCode} from './types';

/** Static configuration for one airport. Add a row to add an airport. */
export interface AirportConfig {
  code: AirportCode;
  iata: string;
  name: string;
  lat: number;
  lon: number;
  /** Words that tie a BoM warning to this airport's area. */
  warningKeywords: string[];
  /** WMO number of the airport's BoM weather station. */
  bomWmoId: string;
  /** BoM radar loop page for the area. */
  radarUrl: string;
}

export const AIRPORTS: readonly AirportConfig[] = [
  {
    code: 'YBBN',
    iata: 'BNE',
    name: 'Brisbane',
    lat: -27.384,
    lon: 153.118,
    bomWmoId: '94578',
    warningKeywords: [
      'Brisbane',
      'Southeast Coast',
      'Moreton Bay',
      'Redcliffe',
    ],
    radarUrl: 'https://www.bom.gov.au/products/IDR663.loop.shtml',
  },
  {
    code: 'YBCS',
    iata: 'CNS',
    name: 'Cairns',
    lat: -16.886,
    lon: 145.755,
    bomWmoId: '94287',
    warningKeywords: [
      'Cairns',
      'North Tropical Coast',
      'Port Douglas',
      'Cooktown',
      'Innisfail',
      'Cardwell',
    ],
    radarUrl: 'https://www.bom.gov.au/products/IDR193.loop.shtml',
  },
];

/** Looks up an airport by code; throws for an unknown code. */
export function airportByCode(code: AirportCode): AirportConfig {
  const airport = AIRPORTS.find((a) => a.code === code);
  if (airport === undefined) throw new Error(`Unknown airport ${code}`);
  return airport;
}
