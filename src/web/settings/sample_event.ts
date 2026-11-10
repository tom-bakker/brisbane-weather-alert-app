import type {
  AlertCategory,
  AlertEvent,
  AlertLevel,
  AlertRecord,
} from '../../domain/types';

/** What the preview shows: an alert at one level, or its all-clear. */
export type PreviewLevel = AlertLevel | 'cleared';

const SAMPLES: Record<AlertCategory, {value: string; message: string}> = {
  wind: {value: '38 kt', message: 'Wind 24 kt, gusting 38 kt.'},
  thunderstorm: {value: 'TS', message: 'TSRA reported in the METAR.'},
  visibility: {value: '700 m', message: 'Visibility 700 m FG.'},
  heat: {value: '39 C', message: 'Apparent temperature 39 C (air 35 C).'},
  uv: {value: 'UV 9.9', message: 'UV index 9.9.'},
  cyclone: {
    value: 'BoM',
    message: 'BoM: Tropical Cyclone Watch for the Brisbane area.',
  },
  data_stale: {
    value: '82 min',
    message: 'Latest observation is 82 minutes old.',
  },
};

const STARTED = '2026-11-09T23:06:00.000Z';
const UPDATED = '2026-11-10T00:15:00.000Z';

/** A realistic Brisbane alert event, for previewing the email layout. */
export function sampleEvent(
  category: AlertCategory,
  level: PreviewLevel,
): AlertEvent {
  const {value, message} = SAMPLES[category];
  const cleared = level === 'cleared';
  const alertLevel: AlertLevel = cleared ? 'warning' : level;
  const alert: AlertRecord = {
    id: 'preview',
    airport: 'YBBN',
    category,
    level: alertLevel,
    peakLevel: alertLevel,
    status: cleared ? 'cleared' : 'active',
    triggerValue: value,
    message,
    startedAt: STARTED,
    updatedAt: UPDATED,
    clearedAt: cleared ? UPDATED : null,
    belowSince: null,
  };
  return {kind: cleared ? 'cleared' : 'raised', alert};
}
