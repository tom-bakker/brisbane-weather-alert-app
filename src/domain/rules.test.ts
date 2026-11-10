// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {planAlertChange, type AlertContext} from './alert_state';
import {evaluateConditions, unknownCategories} from './evaluate';
import {DISCLAIMER, composeEmail, groupsForEvent} from './notifications';
import {makeAlert, makeGroup, makeObservation} from './test_fixtures';
import type {BomWarning, Condition} from './types';

const NOW = new Date('2026-11-09T12:10:00Z');

function evaluate(
  overrides: Parameters<typeof makeObservation>[0] = {},
  warnings: BomWarning[] = [],
) {
  return evaluateConditions({
    observation: makeObservation(overrides),
    warnings,
    now: NOW,
  });
}

function storm(overrides: Partial<BomWarning> = {}): BomWarning {
  return {
    id: 'w1',
    airport: 'YBBN',
    kind: 'thunderstorm',
    level: 'warning',
    headline: 'Severe Thunderstorm Warning',
    issuedAt: '2026-11-09T11:00:00Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('evaluateConditions', () => {
  it('finds nothing on a calm, fresh day', () => {
    expect(evaluate()).toEqual([]);
  });

  it('uses the higher of wind and gust', () => {
    expect(evaluate({windKt: 20, gustKt: 36})).toEqual([
      {
        category: 'wind',
        level: 'warning',
        value: '36 kt',
        message: 'Wind 20 kt, gusting 36 kt.',
      },
    ]);
    expect(evaluate({windKt: 26})[0]).toMatchObject({
      level: 'watch',
      message: 'Wind 26 kt.',
    });
  });

  it('flags low visibility, heat and UV', () => {
    const conditions = evaluate({
      visibilityM: 700,
      weatherCodes: 'FG',
      apparentTempC: 38.5,
      tempC: 34,
      uvIndex: 11,
    });
    expect(conditions).toEqual([
      expect.objectContaining({
        category: 'visibility',
        level: 'warning',
        message: 'Visibility 700 m FG.',
      }),
      expect.objectContaining({
        category: 'heat',
        level: 'warning',
        value: '38.5 C',
      }),
      expect.objectContaining({
        category: 'uv',
        level: 'warning',
        value: 'UV 11',
      }),
    ]);
  });

  it('skips rules whose inputs are missing', () => {
    expect(
      evaluate({visibilityM: null, apparentTempC: null, uvIndex: null}),
    ).toEqual([]);
    expect(
      evaluate({visibilityM: 6000, apparentTempC: 30, uvIndex: 2}),
    ).toEqual([]);
  });

  it('raises a thunderstorm Warning from the METAR or BoM', () => {
    expect(evaluate({weatherCodes: 'TSRA'})).toEqual([
      expect.objectContaining({
        category: 'thunderstorm',
        level: 'warning',
        value: 'TSRA',
        message: 'METAR reports TSRA.',
      }),
    ]);
    expect(evaluate({}, [storm()])).toEqual([
      expect.objectContaining({
        value: 'BoM warning',
        message: 'BoM: Severe Thunderstorm Warning.',
      }),
    ]);
  });

  it('takes the most severe cyclone advice', () => {
    const conditions = evaluate({}, [
      storm({kind: 'cyclone', level: 'watch', headline: 'TC Watch'}),
      storm({
        id: 'w2',
        kind: 'cyclone',
        level: 'warning',
        headline: 'TC Warning',
      }),
    ]);
    expect(conditions).toEqual([
      expect.objectContaining({
        category: 'cyclone',
        level: 'warning',
        message: 'BoM: TC Warning.',
      }),
    ]);
  });

  it('reports missing and stale data', () => {
    expect(
      evaluateConditions({observation: null, warnings: [storm()], now: NOW}),
    ).toEqual([
      expect.objectContaining({category: 'thunderstorm', value: 'BoM warning'}),
      expect.objectContaining({category: 'data_stale', value: 'no data'}),
    ]);
    expect(evaluate({observedAt: '2026-11-09T10:55:00Z'})).toEqual([]);
    expect(evaluate({observedAt: '2026-11-09T10:54:00Z'})).toEqual([
      expect.objectContaining({category: 'data_stale', value: '76 min old'}),
    ]);
  });
});

const CTX: AlertContext = {
  airport: 'YBBN',
  category: 'wind',
  now: NOW,
  holdMinutes: 30,
};

function cond(level: Condition['level'], value = '27 kt'): Condition {
  return {category: 'wind', level, value, message: `Wind ${value}.`};
}

describe('planAlertChange', () => {
  it('does nothing without an alert or a condition', () => {
    expect(planAlertChange(undefined, undefined, CTX)).toEqual({kind: 'none'});
  });

  it('creates a new alert', () => {
    expect(planAlertChange(undefined, cond('watch'), CTX)).toEqual({
      kind: 'create',
      alert: {
        airport: 'YBBN',
        category: 'wind',
        level: 'watch',
        peakLevel: 'watch',
        status: 'active',
        triggerValue: '27 kt',
        message: 'Wind 27 kt.',
        startedAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        clearedAt: null,
        belowSince: null,
      },
    });
  });

  it('escalates at once and records the peak', () => {
    expect(
      planAlertChange(
        makeAlert({belowSince: '2026-11-09T12:00:00Z'}),
        cond('warning', '36 kt'),
        CTX,
      ),
    ).toEqual({
      kind: 'update',
      id: 'alert-1',
      event: 'escalated',
      patch: {
        level: 'warning',
        peakLevel: 'warning',
        triggerValue: '36 kt',
        message: 'Wind 36 kt.',
        belowSince: null,
        updatedAt: NOW.toISOString(),
      },
    });
  });

  it('keeps the earlier peak when re-escalating below it', () => {
    const change = planAlertChange(
      makeAlert({level: 'watch', peakLevel: 'standdown'}),
      cond('warning'),
      CTX,
    );
    expect(change).toMatchObject({patch: {peakLevel: 'standdown'}});
  });

  it('ignores a repeat at the same level and value', () => {
    expect(planAlertChange(makeAlert(), cond('watch'), CTX)).toEqual({
      kind: 'none',
    });
  });

  it('updates the value quietly at the same level', () => {
    expect(planAlertChange(makeAlert(), cond('watch', '30 kt'), CTX)).toEqual({
      kind: 'update',
      id: 'alert-1',
      event: null,
      patch: expect.objectContaining({triggerValue: '30 kt', belowSince: null}),
    });
  });

  it('resets the hold timer when conditions return to the level', () => {
    const change = planAlertChange(
      makeAlert({belowSince: '2026-11-09T12:00:00Z'}),
      cond('watch'),
      CTX,
    );
    expect(change).toMatchObject({
      kind: 'update',
      patch: {belowSince: null},
      event: null,
    });
  });

  it('starts the hold timer when conditions ease', () => {
    expect(planAlertChange(makeAlert(), undefined, CTX)).toEqual({
      kind: 'update',
      id: 'alert-1',
      event: null,
      patch: {belowSince: NOW.toISOString(), updatedAt: NOW.toISOString()},
    });
  });

  it('waits out the hold time', () => {
    const alert = makeAlert({belowSince: '2026-11-09T11:41:00Z'});
    expect(planAlertChange(alert, undefined, CTX)).toEqual({kind: 'none'});
  });

  it('clears after the hold time with an all-clear', () => {
    const alert = makeAlert({belowSince: '2026-11-09T11:40:00Z'});
    expect(planAlertChange(alert, undefined, CTX)).toEqual({
      kind: 'update',
      id: 'alert-1',
      event: 'cleared',
      patch: {
        status: 'cleared',
        clearedAt: NOW.toISOString(),
        belowSince: null,
        updatedAt: NOW.toISOString(),
      },
    });
  });

  it('steps down quietly after the hold time when still above zero', () => {
    const alert = makeAlert({
      level: 'warning',
      belowSince: '2026-11-09T11:40:00Z',
    });
    expect(planAlertChange(alert, cond('watch'), CTX)).toMatchObject({
      kind: 'update',
      event: null,
      patch: {level: 'watch'},
    });
  });
});

describe('unknown inputs', () => {
  it('lists the categories whose inputs are missing', () => {
    expect(unknownCategories(null)).toEqual([
      'wind',
      'visibility',
      'heat',
      'uv',
    ]);
    expect(unknownCategories(makeObservation())).toEqual([]);
    expect(
      unknownCategories(
        makeObservation({
          visibilityM: null,
          apparentTempC: null,
          uvIndex: null,
        }),
      ),
    ).toEqual(['visibility', 'heat', 'uv']);
  });

  it('keeps an alert as it is while its input is unknown', () => {
    const alert = makeAlert({belowSince: '2026-11-09T11:00:00Z'});
    const unknown = {...CTX, inputUnknown: true};
    expect(planAlertChange(alert, undefined, unknown)).toEqual({kind: 'none'});
    expect(planAlertChange(makeAlert(), undefined, unknown)).toEqual({
      kind: 'none',
    });
    // A real reading still applies.
    expect(
      planAlertChange(makeAlert(), cond('warning'), unknown),
    ).toMatchObject({
      event: 'escalated',
    });
  });
});

describe('groupsForEvent', () => {
  const raised = {kind: 'raised' as const, alert: makeAlert()};

  it('selects enabled groups subscribed to the airport, category and level', () => {
    const groups = [
      makeGroup({id: 'yes'}),
      makeGroup({id: 'disabled', enabled: false}),
      makeGroup({id: 'empty', members: []}),
      makeGroup({id: 'cairns-only', airports: ['YBCS']}),
      makeGroup({id: 'uv-only', categories: ['uv']}),
      makeGroup({id: 'warnings-only', minLevel: 'warning'}),
    ];
    expect(groupsForEvent(groups, raised).map((g) => g.id)).toEqual(['yes']);
  });

  it('sends the all-clear to groups that qualified at the peak', () => {
    const cleared = {
      kind: 'cleared' as const,
      alert: makeAlert({
        level: 'watch',
        peakLevel: 'warning',
        status: 'cleared',
      }),
    };
    const groups = [makeGroup({minLevel: 'warning'})];
    expect(groupsForEvent(groups, cleared)).toHaveLength(1);
  });
});

describe('composeEmail', () => {
  it('writes a raised alert with times and disclaimer but no link', () => {
    const email = composeEmail({
      kind: 'raised',
      alert: makeAlert({message: 'Wind <b>27</b> kt.'}),
    });
    expect(email.subject).toBe('[WATCH] Wind gust 27 kt at Brisbane (YBBN)');
    expect(email.text).toContain('Watch: Wind gust at Brisbane (YBBN).');
    expect(email.text).toContain('Started 2026-11-09 22:00 AEST / 12:00 UTC');
    expect(email.text).not.toContain('://');
    expect(email.text).toContain(DISCLAIMER);
    expect(email.html).toContain('Wind &lt;b&gt;27&lt;/b&gt; kt.');
    expect(email.html).not.toContain('<p></p>');
  });

  it('escapes quotes and ampersands in HTML', () => {
    const email = composeEmail({
      kind: 'escalated',
      alert: makeAlert({level: 'standdown', message: `"A" & 'B'`}),
    });
    expect(email.subject).toBe(
      '[STAND-DOWN] Wind gust 27 kt at Brisbane (YBBN)',
    );
    expect(email.html).toContain('&quot;A&quot; &amp; &#39;B&#39;');
  });

  it('writes an all-clear', () => {
    const email = composeEmail({
      kind: 'cleared',
      alert: makeAlert({
        airport: 'YBCS',
        category: 'uv',
        peakLevel: 'warning',
        status: 'cleared',
        clearedAt: '2026-11-09T08:00:00Z',
      }),
    });
    expect(email.subject).toBe('[ALL CLEAR] UV exposure at Cairns (YBCS)');
    expect(email.text).toContain(
      'Cleared at 2026-11-09 18:00 AEST / 08:00 UTC.',
    );
    expect(email.text).toContain('Peak level was Warning.');
  });

  it('falls back to the update time when the clear time is missing', () => {
    const email = composeEmail({kind: 'cleared', alert: makeAlert()});
    expect(email.text).toContain('Cleared at 2026-11-09 22:00 AEST');
  });
});
