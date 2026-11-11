// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {AIRPORTS} from './airports';
import {classifyHeadline, parseAmocWarnings} from './bom_warnings';
import {forecastHours, uvIndexAt, type MetNoResponse} from './met_no';
import {parseMetar, visibilityFromRaw, type AwcMetar} from './metar';

// Shapes copied from live responses on 2026-11-09.
const YBBN_METAR: AwcMetar = {
  icaoId: 'YBBN',
  obsTime: 1794225600,
  rawOb: 'METAR YBBN 091200Z AUTO 08004KT 9999 -SHRA OVC029 21/17 Q1019',
  wdir: 80,
  wspd: 4,
  visib: '6+',
  wxString: '-SHRA',
  clouds: [{cover: 'OVC', base: 2900}],
  temp: 21,
  dewp: 17,
  altim: 1019,
};

describe('visibilityFromRaw', () => {
  it.each([
    ['METAR YBBN 091200Z 08004KT 9999 FEW030', 10000],
    ['METAR YBBN 091200Z 08004KT CAVOK 21/17', 10000],
    ['METAR YBBN 091200Z 08004KT 0800 FG', 800],
    ['METAR YBBN 091200Z 08004KT 4000NDV BR', 4000],
    ['METAR YBBN 091200Z 08004KT //// NCD', null],
  ])('%s -> %s', (raw, metres) => {
    expect(visibilityFromRaw(raw)).toBe(metres);
  });
});

describe('parseMetar', () => {
  it('decodes an aviationweather.gov record', () => {
    const obs = parseMetar(YBBN_METAR, 'YBBN', 5);

    expect(obs).toMatchObject({
      airport: 'YBBN',
      observedAt: '2026-11-09T12:00:00.000Z',
      windDirDeg: 80,
      windKt: 4,
      gustKt: null,
      gustObservedAt: null,
      visibilityM: 10000,
      weatherCodes: '-SHRA',
      cloud: 'OVC029',
      tempC: 21,
      dewpointC: 17,
      qnhHpa: 1019,
      uvIndex: 5,
    });
    expect(obs.apparentTempC).toBeCloseTo(21.9, 1);
  });

  it('handles calm, variable and sparse records', () => {
    const obs = parseMetar(
      {
        icaoId: 'YBCS',
        obsTime: 1794225600,
        rawOb: 'METAR YBCS 091200Z AUTO VRB02KT //// NCD',
        wdir: 'VRB',
        wspd: 2,
        visib: 3,
        clouds: [{cover: 'SKC', base: null}],
      },
      'YBCS',
      null,
    );

    expect(obs.windDirDeg).toBeNull();
    expect(obs.visibilityM).toBe(4828);
    expect(obs.cloud).toBe('SKC');
    expect(obs.tempC).toBeNull();
    expect(obs.apparentTempC).toBeNull();
    expect(obs.weatherCodes).toBe('');
  });

  it('treats a calm wind direction as unknown and missing fields as null', () => {
    const obs = parseMetar(
      {
        icaoId: 'YBCS',
        obsTime: 0,
        rawOb: 'METAR YBCS 00000KT',
        wdir: 0,
        wspd: 0,
      },
      'YBCS',
      null,
    );
    expect(obs.windDirDeg).toBeNull();
    expect(obs.visibilityM).toBeNull();
    expect(obs.cloud).toBe('');
    expect(obs.qnhHpa).toBeNull();
  });

  it('ignores an unreadable miles value', () => {
    const obs = parseMetar(
      {icaoId: 'YBCS', obsTime: 0, rawOb: 'METAR YBCS', visib: 'M'},
      'YBCS',
      null,
    );
    expect(obs.visibilityM).toBeNull();
    expect(obs.windKt).toBe(0);
  });

  it('keeps a reported gust and only one of temp/dew point', () => {
    const obs = parseMetar({...YBBN_METAR, wgst: 32, dewp: null}, 'YBBN', null);
    expect(obs.gustKt).toBe(32);
    expect(obs.gustObservedAt).toBe('2026-11-09T12:00:00.000Z');
    expect(obs.apparentTempC).toBeNull();
  });
});

function metNo(
  steps: MetNoResponse['properties']['timeseries'],
): MetNoResponse {
  return {
    properties: {meta: {updated_at: '2026-11-09T11:18:34Z'}, timeseries: steps},
  };
}

const STEPS: MetNoResponse['properties']['timeseries'] = [
  {
    time: '2026-11-09T11:00:00Z',
    data: {instant: {details: {ultraviolet_index_clear_sky: 9}}},
  },
  {
    time: '2026-11-09T12:00:00Z',
    data: {
      instant: {
        details: {
          air_temperature: 19.8,
          wind_speed: 5,
          wind_from_direction: 9.3,
          ultraviolet_index_clear_sky: 0.4,
        },
      },
      next_1_hours: {
        summary: {symbol_code: 'cloudy'},
        details: {precipitation_amount: 0.2},
      },
    },
  },
  {
    time: '2026-11-09T13:00:00Z',
    data: {
      instant: {details: {}},
      next_1_hours: {summary: {symbol_code: 'rain'}},
    },
  },
  {time: '2026-11-09T18:00:00Z', data: {instant: {details: {}}}},
];

describe('MET Norway', () => {
  const now = new Date('2026-11-09T12:20:00Z');

  it('reads UV for the current hour', () => {
    const hours = forecastHours(metNo(STEPS), now);
    expect(uvIndexAt(hours, now)).toBe(0.4);
    expect(uvIndexAt(hours, new Date('2026-11-09T13:59:00Z'))).toBeNull();
    expect(uvIndexAt(hours, new Date('2026-11-09T11:59:00Z'))).toBeNull();
    expect(uvIndexAt(hours, new Date('2026-11-09T14:00:00Z'))).toBeNull();
    expect(uvIndexAt([], now)).toBeNull();
  });

  it('builds hourly forecast rows from the current hour', () => {
    const hours = forecastHours(metNo(STEPS), now, 24);

    expect(hours).toEqual([
      {
        time: '2026-11-09T12:00:00Z',
        tempC: 19.8,
        windKt: 10,
        windDirDeg: 9.3,
        precipMm: 0.2,
        uvIndex: 0.4,
        symbol: 'cloudy',
      },
      {
        time: '2026-11-09T13:00:00Z',
        tempC: null,
        windKt: null,
        windDirDeg: null,
        precipMm: null,
        uvIndex: null,
        symbol: 'rain',
      },
    ]);
  });

  it('limits the number of hours', () => {
    expect(forecastHours(metNo(STEPS), now, 1)).toHaveLength(1);
    expect(forecastHours(metNo(STEPS), now)).toHaveLength(2);
  });
});

describe('classifyHeadline', () => {
  it.each([
    [
      'Severe Thunderstorm Warning for Southeast Coast',
      'thunderstorm',
      'warning',
    ],
    ['Tropical Cyclone Watch for Cooktown to Cardwell', 'cyclone', 'watch'],
    ['Tropical Cyclone Watch and Warning for Cairns', 'cyclone', 'warning'],
    ['Tropical Cyclone Advice Number 3', 'cyclone', 'warning'],
  ])('%s', (headline, kind, level) => {
    expect(classifyHeadline(headline)).toEqual({kind, level});
  });

  it.each([
    'Cancellation of Severe Thunderstorm Warning',
    'Flood Warning for Balonne River',
  ])('ignores "%s"', (headline) => {
    expect(classifyHeadline(headline)).toBeNull();
  });
});

function amoc(body: string, extra = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<amoc version="1.7">
  <identifier>IDQ21033</identifier>
  <issue-time-utc>2026-11-09T02:52:09Z</issue-time-utc>
  <expiry-time>2026-11-09T08:00:00Z</expiry-time>
  ${extra}
  ${body}
</amoc>`;
}

const STORM_HAZARD = `
  <hazard index="1" phase="NEW" type="TSW">
    <area-list>
      <area aac="QLD_PW011" description="Brisbane City" type="public-district"/>
      <area aac="QLD_PW012" description="Ipswich" type="public-district"/>
    </area-list>
    <headline>Severe Thunderstorm Warning for damaging winds</headline>
  </hazard>`;

describe('parseAmocWarnings', () => {
  const now = new Date('2026-11-09T04:00:00Z');

  it('links a thunderstorm warning to the airport named in its areas', () => {
    const warnings = parseAmocWarnings(amoc(STORM_HAZARD), AIRPORTS, now);

    expect(warnings).toEqual([
      {
        id: 'IDQ21033-1-YBBN',
        airport: 'YBBN',
        kind: 'thunderstorm',
        level: 'warning',
        headline: 'Severe Thunderstorm Warning for damaging winds',
        issuedAt: '2026-11-09T02:52:09Z',
        expiresAt: '2026-11-09T08:00:00Z',
      },
    ]);
  });

  it('reads several hazards and matches keywords in the headline', () => {
    const xml = amoc(`${STORM_HAZARD}
      <hazard index="2" phase="NEW">
        <headline>Tropical Cyclone Watch for Cairns to Cardwell</headline>
      </hazard>`);
    const warnings = parseAmocWarnings(xml, AIRPORTS, now);
    expect(warnings.map((w) => [w.airport, w.kind, w.level])).toEqual([
      ['YBBN', 'thunderstorm', 'warning'],
      ['YBCS', 'cyclone', 'watch'],
    ]);
  });

  it('skips expired, cancelled and irrelevant products', () => {
    const later = new Date('2026-11-09T09:00:00Z');
    expect(parseAmocWarnings(amoc(STORM_HAZARD), AIRPORTS, later)).toEqual([]);
    expect(
      parseAmocWarnings(
        amoc(STORM_HAZARD, '<phase>CAN</phase>'),
        AIRPORTS,
        now,
      ),
    ).toEqual([]);
    expect(
      parseAmocWarnings(
        amoc(STORM_HAZARD.replace('NEW', 'CAN')),
        AIRPORTS,
        now,
      ),
    ).toEqual([]);
    expect(
      parseAmocWarnings(
        amoc(STORM_HAZARD.replace('Brisbane City', 'Toowoomba')),
        AIRPORTS,
        now,
      ),
    ).toEqual([]);
    expect(parseAmocWarnings('<other/>', AIRPORTS, now)).toEqual([]);
  });

  it('copes with missing optional fields', () => {
    const xml = `<amoc><hazard><headline>Severe Thunderstorm Warning for Brisbane</headline></hazard></amoc>`;
    const [warning] = parseAmocWarnings(xml, AIRPORTS, now);
    expect(warning).toMatchObject({
      id: 'unknown-0-YBBN',
      issuedAt: now.toISOString(),
      expiresAt: null,
    });
    expect(parseAmocWarnings('<amoc><hazard/></amoc>', AIRPORTS, now)).toEqual(
      [],
    );
  });
});
