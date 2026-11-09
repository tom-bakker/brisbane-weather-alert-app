import {Monitor, Moon, Sun, type LucideIcon} from 'lucide-react';
import {nextPreference, useTheme, type ThemePreference} from './theme';

const OPTIONS: Record<ThemePreference, {icon: LucideIcon; label: string}> = {
  system: {icon: Monitor, label: 'System'},
  light: {icon: Sun, label: 'Light'},
  dark: {icon: Moon, label: 'Dark'},
};

/** A button that cycles the theme: system → light → dark. */
export function ThemeToggle() {
  const {preference, cycle} = useTheme();
  const {icon: Icon, label} = OPTIONS[preference];
  const next = OPTIONS[nextPreference(preference)].label;
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${label}. Switch to ${next}.`}
      title={`Theme: ${label}`}
      className="border-line-strong bg-surface text-ink-soft hover:bg-subtle focus:ring-accent inline-flex h-9 w-9 items-center justify-center rounded-md border transition focus:ring-2 focus:outline-none"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
