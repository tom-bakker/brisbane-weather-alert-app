import {
  Clock,
  CloudLightning,
  Eye,
  Sun,
  ThermometerSun,
  Tornado,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type {AlertCategory} from '../../domain/types';

export const CATEGORY_ICONS: Record<AlertCategory, LucideIcon> = {
  wind: Wind,
  thunderstorm: CloudLightning,
  visibility: Eye,
  heat: ThermometerSun,
  uv: Sun,
  cyclone: Tornado,
  data_stale: Clock,
};

/** A decorative icon for an alert category (the label carries the meaning). */
export function CategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category: AlertCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon aria-hidden="true" className={className} />;
}
