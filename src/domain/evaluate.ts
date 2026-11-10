import {highestLevel} from './levels';
import {
  levelAtOrAbove,
  levelBelow,
  STALE_AFTER_MINUTES,
  THRESHOLDS,
} from './thresholds';
import {minutesSince} from './time';
import type {AlertCategory, BomWarning, Condition, Observation} from './types';

/** Everything the rules look at for one airport. */
export interface EvaluationInput {
  observation: Observation | null;
  warnings: readonly BomWarning[];
  now: Date;
}

function windCondition(obs: Observation): Condition | null {
  const peakKt = Math.max(obs.windKt, obs.gustKt ?? 0);
  const level = levelAtOrAbove(peakKt, THRESHOLDS.windKt);
  if (level === null) return null;
  const gust = obs.gustKt === null ? '' : `, gusting ${obs.gustKt} kt`;
  return {
    category: 'wind',
    level,
    value: `${peakKt} kt`,
    message: `Wind ${obs.windKt} kt${gust}.`,
  };
}

function visibilityCondition(obs: Observation): Condition | null {
  if (obs.visibilityM === null) return null;
  const level = levelBelow(obs.visibilityM, THRESHOLDS.visibilityM);
  if (level === null) return null;
  return {
    category: 'visibility',
    level,
    value: `${obs.visibilityM} m`,
    message: `Visibility ${obs.visibilityM} m ${obs.weatherCodes}`.trim() + '.',
  };
}

function heatCondition(obs: Observation): Condition | null {
  if (obs.apparentTempC === null) return null;
  const level = levelAtOrAbove(obs.apparentTempC, THRESHOLDS.apparentTempC);
  if (level === null) return null;
  return {
    category: 'heat',
    level,
    value: `${obs.apparentTempC} C`,
    message: `Apparent temperature ${obs.apparentTempC} C (air ${obs.tempC} C).`,
  };
}

function uvCondition(obs: Observation): Condition | null {
  if (obs.uvIndex === null) return null;
  const level = levelAtOrAbove(obs.uvIndex, THRESHOLDS.uvIndex);
  if (level === null) return null;
  return {
    category: 'uv',
    level,
    value: `UV ${obs.uvIndex}`,
    message: `UV index ${obs.uvIndex}.`,
  };
}

function thunderstormCondition(
  obs: Observation | null,
  warnings: readonly BomWarning[],
): Condition | null {
  const sources: string[] = [];
  if (obs !== null && obs.weatherCodes.includes('TS')) {
    sources.push(`METAR reports ${obs.weatherCodes}`);
  }
  for (const w of warnings.filter((w) => w.kind === 'thunderstorm')) {
    sources.push(`BoM: ${w.headline}`);
  }
  if (sources.length === 0) return null;
  return {
    category: 'thunderstorm',
    level: 'warning',
    value: obs?.weatherCodes.includes('TS') ? obs.weatherCodes : 'BoM warning',
    message: sources.join('. ') + '.',
  };
}

function cycloneCondition(warnings: readonly BomWarning[]): Condition | null {
  const cyclones = warnings.filter((w) => w.kind === 'cyclone');
  const level = highestLevel(cyclones.map((w) => w.level));
  if (level === null) return null;
  const top = cyclones.find((w) => w.level === level);
  return {
    category: 'cyclone',
    level,
    value: 'BoM advice',
    message: `BoM: ${top?.headline ?? 'tropical cyclone advice'}.`,
  };
}

function staleCondition(obs: Observation | null, now: Date): Condition | null {
  if (obs === null) {
    return {
      category: 'data_stale',
      level: 'info',
      value: 'no data',
      message: 'No weather observation is available.',
    };
  }
  const age = minutesSince(obs.observedAt, now);
  if (age <= STALE_AFTER_MINUTES) return null;
  return {
    category: 'data_stale',
    level: 'info',
    value: `${age} min old`,
    message: `Latest observation is ${age} minutes old.`,
  };
}

/**
 * Categories that cannot be judged because their input is missing. Their
 * alerts must be held as they are, not eased or cleared.
 */
export function unknownCategories(obs: Observation | null): AlertCategory[] {
  if (obs === null) return ['wind', 'visibility', 'heat', 'uv'];
  const unknown: AlertCategory[] = [];
  if (obs.visibilityM === null) unknown.push('visibility');
  if (obs.apparentTempC === null) unknown.push('heat');
  if (obs.uvIndex === null) unknown.push('uv');
  return unknown;
}

/** Applies every alert rule and returns the conditions that are present. */
export function evaluateConditions(input: EvaluationInput): Condition[] {
  const {observation: obs, warnings, now} = input;
  const fromObservation =
    obs === null
      ? []
      : [
          windCondition(obs),
          visibilityCondition(obs),
          heatCondition(obs),
          uvCondition(obs),
        ];
  return [
    ...fromObservation,
    thunderstormCondition(obs, warnings),
    cycloneCondition(warnings),
    staleCondition(obs, now),
  ].filter((c): c is Condition => c !== null);
}
