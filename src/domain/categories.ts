import type {AlertCategory} from './types';

interface CategoryInfo {
  label: string;
  description: string;
}

const CATEGORY_INFO: Record<AlertCategory, CategoryInfo> = {
  wind: {
    label: 'Wind gust',
    description:
      'Wind or gust of 25 kt or more (Watch), 35 kt (Warning), 45 kt (Stand-down)',
  },
  thunderstorm: {
    label: 'Thunderstorm',
    description:
      'TS reported in the METAR, or a BoM severe thunderstorm warning for the area',
  },
  visibility: {
    label: 'Low visibility',
    description: 'Visibility below 5,000 m (Watch) or 800 m (Warning)',
  },
  heat: {
    label: 'Heat',
    description:
      'Apparent temperature of 35 C or more (Watch) or 38 C (Warning)',
  },
  uv: {
    label: 'UV exposure',
    description: 'UV index of 3 or more (Info), 8 (Watch), 11 (Warning)',
  },
  cyclone: {
    label: 'Tropical cyclone',
    description: 'BoM tropical cyclone watch or warning for the area',
  },
  data_stale: {
    label: 'Stale weather data',
    description:
      'No fresh observation for more than 75 minutes (system health)',
  },
};

/** Short display label, e.g. "Wind gust". */
export function categoryLabel(category: AlertCategory): string {
  return CATEGORY_INFO[category].label;
}

/** One-line description of what triggers the category. */
export function categoryDescription(category: AlertCategory): string {
  return CATEGORY_INFO[category].description;
}
