// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {evaluateConditions} from './evaluate';
import {
  bandsFor,
  DEFAULT_THRESHOLDS,
  describeThresholds,
  formatLimit,
  levelFor,
  mergeThresholds,
  sameLimits,
  THRESHOLD_CATEGORIES,
  thresholdsProblem,
  type LevelLimits,
} from './thresholds';
import type {Observation} from './types';

function limits(overrides: Partial<LevelLimits>): LevelLimits {
  return {
    info: null,
    watch: null,
    warning: null,
    standdown: null,
    ...overrides,
  };
}

describe('thresholds', () => {
  it('has valid defaults for every measured category', () => {
    for (const category of THRESHOLD_CATEGORIES) {
      expect(thresholdsProblem(category, DEFAULT_THRESHOLDS[category])).toBe(
        null,
      );
    }
  });

  it('skips levels that are off', () => {
    expect(bandsFor(limits({watch: 20, standdown: 40}))).toEqual([
      {limit: 20, level: 'watch'},
      {limit: 40, level: 'standdown'},
    ]);
  });

  it.each([
    [2.9, null],
    [3, 'info'],
    [8, 'watch'],
    [11.5, 'warning'],
  ] as const)('UV %s is %s by default', (uv, level) => {
    expect(levelFor('uv', uv, DEFAULT_THRESHOLDS)).toBe(level);
  });

  it('uses edited limits, including a level the default never reaches', () => {
    const thresholds = {
      ...DEFAULT_THRESHOLDS,
      heat: limits({info: 30, watch: 33, warning: 36, standdown: 40}),
    };
    expect(levelFor('heat', 29.9, thresholds)).toBeNull();
    expect(levelFor('heat', 30, thresholds)).toBe('info');
    expect(levelFor('heat', 40, thresholds)).toBe('standdown');
  });

  it.each([
    [limits({}), 'Set at least one level.'],
    [limits({watch: 0}), 'Watch must be between 1 kt and 150 kt.'],
    [limits({warning: 151}), 'Warning must be between 1 kt and 150 kt.'],
    [limits({watch: NaN}), 'Watch must be between 1 kt and 150 kt.'],
    [limits({watch: 30, warning: 30}), 'Warning must be higher than Watch.'],
    [limits({info: 10, standdown: 5}), 'Stand-down must be higher than Info.'],
  ])('rejects wind %o', (wind, problem) => {
    expect(thresholdsProblem('wind', wind)).toBe(problem);
  });

  it('needs lower visibility for each more severe level', () => {
    expect(
      thresholdsProblem('visibility', limits({watch: 800, warning: 5000})),
    ).toBe('Warning must be lower than Watch.');
    expect(
      thresholdsProblem('visibility', limits({watch: 5000, warning: 800})),
    ).toBeNull();
    expect(thresholdsProblem('visibility', limits({watch: 10001}))).toBe(
      'Watch must be between 1 m and 10,000 m.',
    );
  });

  it('accepts the range limits exactly', () => {
    expect(thresholdsProblem('uv', limits({info: 0, warning: 20}))).toBeNull();
    expect(thresholdsProblem('wind', limits({watch: 1, warning: 150}))).toBe(
      null,
    );
  });

  it('lays saved limits over the defaults', () => {
    const wind = limits({watch: 20});
    const merged = mergeThresholds([{category: 'wind', limits: wind}]);
    expect(merged.wind).toBe(wind);
    expect(merged.uv).toBe(DEFAULT_THRESHOLDS.uv);
    expect(DEFAULT_THRESHOLDS.wind.watch).toBe(25);
  });

  it('compares limits level by level', () => {
    const base = DEFAULT_THRESHOLDS.wind;
    expect(sameLimits(base, {...base})).toBe(true);
    expect(sameLimits(base, {...base, info: 10})).toBe(false);
    expect(sameLimits(base, {...base, standdown: null})).toBe(false);
  });

  it('formats limits with their unit', () => {
    expect(formatLimit('visibility', 5000)).toBe('5,000 m');
    expect(formatLimit('heat', 35.5)).toBe('35.5 C');
    expect(formatLimit('uv', 8)).toBe('8');
  });

  it('describes limits in words', () => {
    expect(describeThresholds('heat', DEFAULT_THRESHOLDS.heat)).toBe(
      'Apparent temperature of 35 C or more (Watch), 38 C (Warning)',
    );
    expect(describeThresholds('visibility', limits({warning: 800}))).toBe(
      'Visibility below 800 m (Warning)',
    );
  });
});

describe('evaluateConditions with edited thresholds', () => {
  const NOW = new Date('2026-11-09T12:10:00Z');
  const observation: Observation = {
    airport: 'YBBN',
    observedAt: '2026-11-09T12:00:00Z',
    rawMetar: 'METAR YBBN',
    windDirDeg: 80,
    windKt: 22,
    gustKt: null,
    visibilityM: 9999,
    weatherCodes: '',
    cloud: '',
    tempC: 30,
    dewpointC: 20,
    qnhHpa: 1015,
    apparentTempC: 33,
    uvIndex: 2,
  };

  it('raises each alert at the limits given', () => {
    const thresholds = {
      wind: limits({info: 20}),
      visibility: limits({watch: 10000}),
      heat: limits({watch: 33}),
      uv: limits({info: 1}),
    };
    const conditions = evaluateConditions({
      observation,
      warnings: [],
      now: NOW,
      thresholds,
    });
    expect(conditions.map((c) => [c.category, c.level])).toEqual([
      ['wind', 'info'],
      ['visibility', 'watch'],
      ['heat', 'watch'],
      ['uv', 'info'],
    ]);
  });

  it('uses the defaults when no thresholds are given', () => {
    expect(evaluateConditions({observation, warnings: [], now: NOW})).toEqual(
      [],
    );
  });
});
