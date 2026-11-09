import {highestLevel, levelRank} from './levels';
import {minutesSince} from './time';
import type {
  AirportCode,
  AlertCategory,
  AlertEventKind,
  AlertRecord,
  Condition,
} from './types';

/** A new alert row, before the store assigns an id. */
export type NewAlert = Omit<AlertRecord, 'id'>;

/** What to do with the alert for one airport and category this cycle. */
export type AlertChange =
  | {kind: 'none'}
  | {kind: 'create'; alert: NewAlert}
  | {
      kind: 'update';
      id: string;
      patch: Partial<AlertRecord>;
      event: AlertEventKind | null;
    };

export interface AlertContext {
  airport: AirportCode;
  category: AlertCategory;
  now: Date;
  holdMinutes: number;
  /**
   * True when this category's input is missing (feed down, "////" in the
   * METAR). Missing data must never read as "conditions have eased".
   */
  inputUnknown?: boolean;
}

const NO_CHANGE: AlertChange = {kind: 'none'};

function create(condition: Condition, ctx: AlertContext): AlertChange {
  const now = ctx.now.toISOString();
  return {
    kind: 'create',
    alert: {
      airport: ctx.airport,
      category: ctx.category,
      level: condition.level,
      peakLevel: condition.level,
      status: 'active',
      triggerValue: condition.value,
      message: condition.message,
      startedAt: now,
      updatedAt: now,
      clearedAt: null,
      belowSince: null,
    },
  };
}

function update(
  active: AlertRecord,
  patch: Partial<AlertRecord>,
  ctx: AlertContext,
  event: AlertEventKind | null = null,
): AlertChange {
  return {
    kind: 'update',
    id: active.id,
    patch: {...patch, updatedAt: ctx.now.toISOString()},
    event,
  };
}

function withCondition(condition: Condition): Partial<AlertRecord> {
  return {
    level: condition.level,
    triggerValue: condition.value,
    message: condition.message,
    belowSince: null,
  };
}

/** Conditions are below the alert's level (or gone): apply the hold time. */
function planEasing(
  active: AlertRecord,
  condition: Condition | undefined,
  ctx: AlertContext,
): AlertChange {
  if (active.belowSince === null) {
    return update(active, {belowSince: ctx.now.toISOString()}, ctx);
  }
  if (minutesSince(active.belowSince, ctx.now) < ctx.holdMinutes) {
    return NO_CHANGE;
  }
  if (condition !== undefined) {
    return update(active, withCondition(condition), ctx);
  }
  const clearedAt = ctx.now.toISOString();
  return update(
    active,
    {status: 'cleared', clearedAt, belowSince: null},
    ctx,
    'cleared',
  );
}

/**
 * Decides how one alert changes. Rules from the spec: one active alert per
 * airport and category; rises apply at once; falls and clears only after the
 * conditions stay lower for the hold time, to avoid flapping.
 */
export function planAlertChange(
  active: AlertRecord | undefined,
  condition: Condition | undefined,
  ctx: AlertContext,
): AlertChange {
  if (active === undefined) {
    return condition === undefined ? NO_CHANGE : create(condition, ctx);
  }
  if (condition === undefined) {
    return ctx.inputUnknown === true
      ? NO_CHANGE
      : planEasing(active, undefined, ctx);
  }

  const rise = levelRank(condition.level) - levelRank(active.level);
  if (rise > 0) {
    const peakLevel = highestLevel([active.peakLevel, condition.level]);
    return update(
      active,
      {...withCondition(condition), peakLevel: peakLevel ?? condition.level},
      ctx,
      'escalated',
    );
  }
  if (rise < 0) return planEasing(active, condition, ctx);

  const unchanged =
    active.belowSince === null && active.triggerValue === condition.value;
  return unchanged ? NO_CHANGE : update(active, withCondition(condition), ctx);
}
