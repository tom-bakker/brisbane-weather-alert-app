import type {AirportConfig} from '../domain/airports';
import type {MetNoResponse} from '../domain/met_no';
import type {AwcMetar} from '../domain/metar';
import type {AirportCode} from '../domain/types';
import type {AwcTaf, WeatherFeeds} from './ports';

const AWC_BASE = 'https://aviationweather.gov/api/data';
const MET_NO_BASE =
  'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const TIMEOUT_MS = 20_000;

export interface HttpFeedOptions {
  userAgent: string;
  fetchBomDocuments: () => Promise<string[]>;
  fetchBomObservations: () => Promise<string>;
  fetchFn?: typeof fetch;
}

/**
 * Weather feeds over HTTPS: official METAR/TAF from aviationweather.gov (US
 * public domain) and model data from MET Norway (CC BY 4.0). BoM warnings
 * and station observations come over anonymous FTP, which is passed in.
 */
export function createHttpFeeds(options: HttpFeedOptions): WeatherFeeds {
  const fetchFn = options.fetchFn ?? fetch;

  async function getJson<T>(url: string): Promise<T> {
    const response = await fetchFn(url, {
      headers: {'User-Agent': options.userAgent, Accept: 'application/json'},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    }
    return (await response.json()) as T;
  }

  const awc = <T>(product: string, codes: readonly AirportCode[]) =>
    getJson<T[]>(`${AWC_BASE}/${product}?ids=${codes.join(',')}&format=json`);

  return {
    fetchMetars: (codes) => awc<AwcMetar>('metar', codes),
    fetchTafs: (codes) => awc<AwcTaf>('taf', codes),
    // MET Norway rejects coordinates with more than four decimals.
    fetchMetNo: (airport: AirportConfig) =>
      getJson<MetNoResponse>(
        `${MET_NO_BASE}?lat=${airport.lat.toFixed(4)}&lon=${airport.lon.toFixed(4)}`,
      ),
    fetchBomWarningDocuments: options.fetchBomDocuments,
    fetchBomObservationDocument: options.fetchBomObservations,
  };
}
