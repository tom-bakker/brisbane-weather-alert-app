import {
  DEFAULT_THRESHOLDS,
  describeThresholds,
  THRESHOLD_CATEGORIES,
  type ThresholdCategory,
  type Thresholds,
} from './thresholds';
import type {AlertCategory} from './types';

const LABELS: Record<AlertCategory, string> = {
  wind: 'Wind gust',
  thunderstorm: 'Thunderstorm',
  visibility: 'Low visibility',
  heat: 'Heat',
  uv: 'UV exposure',
  cyclone: 'Tropical cyclone',
  data_stale: 'Stale weather data',
};

/** Triggers for the categories that don't depend on editable thresholds. */
const FIXED_DESCRIPTIONS: Record<
  Exclude<AlertCategory, ThresholdCategory>,
  string
> = {
  thunderstorm:
    'TS reported in the METAR, or a BoM severe thunderstorm warning for the area',
  cyclone: 'BoM tropical cyclone watch or warning for the area',
  data_stale: 'No fresh observation for more than 75 minutes (system health)',
};

function isThresholdCategory(
  category: AlertCategory,
): category is ThresholdCategory {
  return (THRESHOLD_CATEGORIES as readonly AlertCategory[]).includes(category);
}

/** Short display label, e.g. "Wind gust". */
export function categoryLabel(category: AlertCategory): string {
  return LABELS[category];
}

/** One-line description of what triggers the category. */
export function categoryDescription(
  category: AlertCategory,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): string {
  return isThresholdCategory(category)
    ? describeThresholds(category, thresholds[category])
    : FIXED_DESCRIPTIONS[category];
}
