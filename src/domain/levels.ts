import {ALERT_LEVELS, type AlertLevel} from './types';

const LABELS: Record<AlertLevel, string> = {
  info: 'Info',
  watch: 'Watch',
  warning: 'Warning',
  standdown: 'Stand-down',
};

/** Numeric rank of a level; higher is more severe. */
export function levelRank(level: AlertLevel): number {
  return ALERT_LEVELS.indexOf(level);
}

/** True when `a` is at least as severe as `b`. */
export function isAtLeast(a: AlertLevel, b: AlertLevel): boolean {
  return levelRank(a) >= levelRank(b);
}

/** The most severe of the given levels, or null when there are none. */
export function highestLevel(
  levels: readonly (AlertLevel | null)[],
): AlertLevel | null {
  let best: AlertLevel | null = null;
  for (const level of levels) {
    if (
      level !== null &&
      (best === null || levelRank(level) > levelRank(best))
    ) {
      best = level;
    }
  }
  return best;
}

/** Display label for a level, e.g. "Stand-down". */
export function levelLabel(level: AlertLevel): string {
  return LABELS[level];
}
