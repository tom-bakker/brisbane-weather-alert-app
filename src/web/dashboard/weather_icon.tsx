import {clsx} from 'clsx';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Cloudy,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import type {WeatherCondition, WeatherKind} from './weather';

interface IconStyle {
  day: LucideIcon;
  night: LucideIcon;
  color: string;
}

const STYLES: Record<WeatherKind, IconStyle> = {
  clear: {day: Sun, night: Moon, color: 'text-amber-500 dark:text-amber-300'},
  partly_cloudy: {
    day: CloudSun,
    night: CloudMoon,
    color: 'text-sky-500 dark:text-sky-300',
  },
  cloudy: {
    day: Cloudy,
    night: Cloudy,
    color: 'text-slate-500 dark:text-slate-300',
  },
  fog: {day: CloudFog, night: CloudFog, color: 'text-slate-400'},
  drizzle: {
    day: CloudDrizzle,
    night: CloudDrizzle,
    color: 'text-sky-500 dark:text-sky-400',
  },
  rain: {
    day: CloudRain,
    night: CloudRain,
    color: 'text-blue-600 dark:text-blue-400',
  },
  heavy_rain: {
    day: CloudRainWind,
    night: CloudRainWind,
    color: 'text-blue-700 dark:text-blue-300',
  },
  showers: {
    day: CloudSunRain,
    night: CloudMoonRain,
    color: 'text-sky-600 dark:text-sky-400',
  },
  thunder: {
    day: CloudLightning,
    night: CloudLightning,
    color: 'text-violet-600 dark:text-violet-400',
  },
  sleet: {
    day: CloudHail,
    night: CloudHail,
    color: 'text-cyan-600 dark:text-cyan-300',
  },
  snow: {
    day: CloudSnow,
    night: CloudSnow,
    color: 'text-cyan-500 dark:text-cyan-200',
  },
  unknown: {day: Cloud, night: Cloud, color: 'text-slate-400'},
};

/** An icon for a weather condition, labelled for screen readers. */
export function WeatherIcon({
  condition,
  className,
}: {
  condition: WeatherCondition;
  className?: string;
}) {
  const style = STYLES[condition.kind];
  const Icon = condition.night ? style.night : style.day;
  return (
    <Icon
      role="img"
      aria-label={condition.label}
      className={clsx(style.color, className)}
    />
  );
}
