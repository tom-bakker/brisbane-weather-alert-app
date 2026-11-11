// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {airportByCode} from './airports';
import {categoryDescription, categoryLabel} from './categories';
import {highestLevel, isAtLeast, levelLabel, levelRank} from './levels';
import {
  bandsFor,
  DEFAULT_THRESHOLDS,
  levelFor,
  THRESHOLD_CATEGORIES,
} from './thresholds';
import {
  formatAestTime,
  formatAge,
  formatUtcAndAest,
  minutesSince,
} from './time';
import type {AirportCode} from './types';
import {apparentTemperatureC, milesToMetres, msToKnots} from './units';
import {uvBand} from './uv';

describe('levels', () => {
  it('ranks levels from info to stand-down', () => {
    expect(levelRank('info')).toBe(0);
    expect(levelRank('standdown')).toBe(3);
  });

  it('compares levels inclusively', () => {
    expect(isAtLeast('warning', 'watch')).toBe(true);
    expect(isAtLeast('watch', 'watch')).toBe(true);
    expect(isAtLeast('info', 'watch')).toBe(false);
  });

  it('finds the highest level and ignores nulls', () => {
    expect(highestLevel(['watch', null, 'warning', 'info'])).toBe('warning');
    expect(highestLevel([null])).toBeNull();
    expect(highestLevel(['warning', 'watch'])).toBe('warning');
  });

  it('labels stand-down with a hyphen', () => {
    expect(levelLabel('standdown')).toBe('Stand-down');
  });
});

describe('thresholds', () => {
  it.each([
    [24, null],
    [25, 'watch'],
    [34, 'watch'],
    [35, 'warning'],
    [45, 'standdown'],
  ])('wind %i kt is %s', (kt, level) => {
    expect(levelFor('wind', kt, DEFAULT_THRESHOLDS)).toBe(level);
  });

  it.each([
    [5001, null],
    [5000, 'watch'],
    [801, 'watch'],
    [800, 'warning'],
  ])('visibility %i m is %s', (m, level) => {
    expect(levelFor('visibility', m, DEFAULT_THRESHOLDS)).toBe(level);
  });

  // A reading that equals a limit raises that level, in every category.
  it.each(
    THRESHOLD_CATEGORIES.flatMap((category) =>
      bandsFor(DEFAULT_THRESHOLDS[category]).map(
        (band) => [category, band.limit, band.level] as const,
      ),
    ),
  )('%s exactly at %s is %s', (category, limit, level) => {
    expect(levelFor(category, limit, DEFAULT_THRESHOLDS)).toBe(level);
  });
});

describe('units', () => {
  it('converts m/s to knots', () => {
    expect(msToKnots(10)).toBe(19);
  });

  it('converts statute miles to metres', () => {
    expect(milesToMetres(6)).toBe(9656);
  });

  it('computes BoM apparent temperature', () => {
    // 35 C, dew point 25 C, calm: humid heat feels hotter.
    expect(apparentTemperatureC(35, 25, 0)).toBe(41.4);
    // Wind cools it down.
    expect(apparentTemperatureC(35, 25, 20)).toBeLessThan(41.4);
  });
});

describe('time', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  it('shows AEST and UTC together', () => {
    expect(formatUtcAndAest('2026-11-09T15:30:00Z')).toBe(
      '2026-11-10 01:30 AEST / 15:30 UTC',
    );
    expect(formatAestTime('2026-11-09T15:30:00Z')).toBe('01:30 AEST');
  });

  it('measures and formats ages', () => {
    expect(minutesSince('2026-11-09T11:30:00Z', now)).toBe(30);
    expect(formatAge('2026-11-09T11:59:31Z', now)).toBe('just now');
    expect(formatAge('2026-11-09T11:48:00Z', now)).toBe('12 min ago');
    expect(formatAge('2026-11-09T08:55:00Z', now)).toBe('3 h 5 min ago');
  });
});

describe('uvBand', () => {
  it.each([
    [2, 'Low'],
    [3, 'Moderate: sun protection required'],
    [6, 'High: sun protection required'],
    [8, 'Very high'],
    [11, 'Extreme'],
  ])('UV %i is %s', (uv, band) => {
    expect(uvBand(uv)).toBe(band);
  });
});

describe('config lookups', () => {
  it('finds airports and rejects unknown codes', () => {
    expect(airportByCode('YBCS').name).toBe('Cairns');
    expect(airportByCode('YBCG')).toMatchObject({
      name: 'Gold Coast',
      iata: 'OOL',
      bomWmoId: '94592',
    });
    expect(() => airportByCode('XXXX' as AirportCode)).toThrow(
      'Unknown airport',
    );
  });

  it('describes categories', () => {
    expect(categoryLabel('wind')).toBe('Wind gust');
    expect(categoryDescription('uv')).toBe(
      'UV index of 3 or more (Info), 8 (Watch), 11 (Warning)',
    );
    expect(categoryDescription('cyclone')).toContain('BoM tropical cyclone');
  });

  it('describes categories from the thresholds in use', () => {
    const thresholds = {
      ...DEFAULT_THRESHOLDS,
      visibility: {info: 8000, watch: 3000, warning: null, standdown: 500},
    };
    expect(categoryDescription('visibility', thresholds)).toBe(
      'Visibility of 8,000 m or less (Info), 3,000 m (Watch), 500 m (Stand-down)',
    );
    expect(categoryDescription('wind', thresholds)).toBe(
      'Wind or gust of 25 kt or more (Watch), 35 kt (Warning), 45 kt (Stand-down)',
    );
  });
});
