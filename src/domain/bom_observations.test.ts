import {describe, expect, it} from 'vitest';
import {AIRPORTS} from './airports';
import {
  parseBomObservations,
  withBomGust,
  type BomStationReading,
} from './bom_observations';
import {makeObservation} from './test_fixtures';

function station(wmo: string, time: string, elements: string): string {
  return `<station wmo-id="${wmo}" stn-name="X" type="AWS">
    <period index="0" time-utc="${time}" wind-src="TMD">
      <level index="0" type="surface">${elements}</level>
    </period>
  </station>`;
}

/** Trimmed from BoM's IDQ60920.xml on 2026-11-11 (Brisbane at 2 pm AEST). */
const QLD_XML = `<?xml version="1.0"?>
<product version="v1.7.1">
  <amoc><identifier>IDQ60920</identifier></amoc>
  <observations>
    ${station(
      '94578',
      '2026-11-11T04:00:00+00:00',
      `<element units="km/h" type="gust_kmh">46</element>
       <element units="knots" type="wind_gust_spd">25</element>
       <element units="knots" type="wind_spd">19</element>`,
    )}
    ${station(
      '94568',
      '2026-11-11T04:00:00+00:00',
      '<element units="knots" type="wind_gust_spd">40</element>',
    )}
    ${station(
      '94287',
      '2026-11-11T04:00:00+00:00',
      '<element units="knots" type="wind_spd">13</element>',
    )}
    ${station(
      '94592',
      '2026-11-11T04:00:00+00:00',
      '<element units="knots" type="wind_gust_spd">31</element>',
    )}
  </observations>
</product>`;

const NOW = new Date('2026-11-11T04:10:00Z');

describe('parseBomObservations', () => {
  it("reads each airport's station gust and ignores other stations", () => {
    expect(parseBomObservations(QLD_XML, AIRPORTS)).toEqual([
      {airport: 'YBBN', observedAt: '2026-11-11T04:00:00.000Z', gustKt: 25},
      {airport: 'YBCS', observedAt: '2026-11-11T04:00:00.000Z', gustKt: null},
      {airport: 'YBCG', observedAt: '2026-11-11T04:00:00.000Z', gustKt: 31},
    ]);
  });

  it('skips airports whose station is missing or has no time', () => {
    const xml = `<product><observations>
      <station wmo-id="94578"><period/></station>
    </observations></product>`;
    expect(parseBomObservations(xml, AIRPORTS)).toEqual([]);
    expect(parseBomObservations('<product/>', AIRPORTS)).toEqual([]);
  });

  it('treats an empty or non-numeric gust as unknown', () => {
    const xml = `<product><observations>${station(
      '94578',
      '2026-11-11T04:00:00Z',
      '<element type="wind_gust_spd"></element>',
    )}${station(
      '94287',
      '2026-11-11T04:00:00Z',
      '<element type="wind_gust_spd">-</element>',
    )}</observations></product>`;
    expect(parseBomObservations(xml, AIRPORTS).map((r) => r.gustKt)).toEqual([
      null,
      null,
    ]);
  });
});

describe('withBomGust', () => {
  const reading: BomStationReading = {
    airport: 'YBBN',
    observedAt: '2026-11-11T04:00:00Z',
    gustKt: 25,
  };
  // The 04:00Z METAR was 03019KT: no gust group, as the gust was < 10 kt
  // above the mean wind.
  const metar = makeObservation({windKt: 19, gustKt: null});

  it('fills in a gust the METAR left out, with its own time', () => {
    expect(withBomGust(metar, reading, NOW)).toMatchObject({
      gustKt: 25,
      gustObservedAt: '2026-11-11T04:00:00Z',
    });
  });

  it('keeps the METAR gust when it is as high or higher', () => {
    const at = '2026-11-11T03:30:00.000Z';
    for (const gustKt of [25, 30]) {
      const gusty = makeObservation({gustKt, gustObservedAt: at});
      expect(withBomGust(gusty, reading, NOW)).toBe(gusty);
    }
    const lower = makeObservation({gustKt: 24, gustObservedAt: at});
    expect(withBomGust(lower, reading, NOW).gustKt).toBe(25);
  });

  it('ignores a missing, gustless or stale reading', () => {
    expect(withBomGust(metar, undefined, NOW)).toBe(metar);
    expect(withBomGust(metar, {...reading, gustKt: null}, NOW)).toBe(metar);
    const at30 = new Date('2026-11-11T04:30:00Z');
    const at31 = new Date('2026-11-11T04:31:00Z');
    expect(withBomGust(metar, reading, at30).gustKt).toBe(25);
    expect(withBomGust(metar, reading, at31)).toBe(metar);
  });
});
