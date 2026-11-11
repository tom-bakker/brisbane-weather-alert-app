import type {AlertRecord, MailGroup, Observation} from './types';

/** A calm, clear Brisbane observation; override what a test cares about. */
export function makeObservation(
  overrides: Partial<Observation> = {},
): Observation {
  return {
    airport: 'YBBN',
    observedAt: '2026-11-09T12:00:00.000Z',
    rawMetar: 'METAR YBBN 091200Z 08004KT 9999 FEW030 21/17 Q1019',
    windDirDeg: 80,
    windKt: 4,
    gustKt: null,
    gustObservedAt: null,
    visibilityM: 10000,
    weatherCodes: '',
    cloud: 'FEW030',
    tempC: 21,
    dewpointC: 17,
    qnhHpa: 1019,
    apparentTempC: 22,
    uvIndex: 0,
    ...overrides,
  };
}

/** An active wind Watch for Brisbane. */
export function makeAlert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    id: 'alert-1',
    airport: 'YBBN',
    category: 'wind',
    level: 'watch',
    peakLevel: 'watch',
    status: 'active',
    triggerValue: '27 kt',
    message: 'Wind 20 kt, gusting 27 kt.',
    startedAt: '2026-11-09T12:00:00.000Z',
    updatedAt: '2026-11-09T12:00:00.000Z',
    clearedAt: null,
    belowSince: null,
    ...overrides,
  };
}

/** A ramp group subscribed to wind at both airports from Watch up. */
export function makeGroup(overrides: Partial<MailGroup> = {}): MailGroup {
  return {
    id: 'group-1',
    name: 'Ramp supervisors',
    enabled: true,
    airports: ['YBBN', 'YBCS'],
    categories: ['wind'],
    minLevel: 'watch',
    members: [{id: 'm1', email: 'sup@example.com'}],
    ...overrides,
  };
}
