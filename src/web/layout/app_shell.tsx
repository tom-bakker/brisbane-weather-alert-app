import {clsx} from 'clsx';
import {
  Bell,
  CloudSun,
  Info,
  LayoutDashboard,
  LogOut,
  Mail,
  ScrollText,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import type {ReactNode} from 'react';
import {DISCLAIMER} from '../../domain/notifications';
import {Button} from '../components/ui';
import {ThemeToggle} from '../theme/theme_toggle';

export const PAGES = [
  {id: 'dashboard', label: 'Dashboard'},
  {id: 'alerts', label: 'Alerts'},
  {id: 'groups', label: 'Mail groups'},
  {id: 'audit', label: 'Email audit'},
] as const;
export type PageId = (typeof PAGES)[number]['id'];

const PAGE_ICONS: Record<PageId, LucideIcon> = {
  dashboard: LayoutDashboard,
  alerts: Bell,
  groups: Mail,
  audit: ScrollText,
};

interface AppShellProps {
  email: string;
  page: PageId;
  onNavigate: (page: PageId) => void;
  onSignOut: () => void;
  children: ReactNode;
}

/** Header navigation, page body and the permanent disclaimer footer. */
export function AppShell({
  email,
  page,
  onNavigate,
  onSignOut,
  children,
}: AppShellProps) {
  return (
    <div className="bg-canvas text-ink flex min-h-screen flex-col">
      <header className="border-line bg-surface/90 top-0 z-10 border-b backdrop-blur sm:sticky">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <CloudSun aria-hidden="true" className="h-5 w-5" />
            </span>
            Airport Weather Alerts
          </p>
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            {PAGES.map((p) => {
              const Icon = PAGE_ICONS[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-current={page === p.id ? 'page' : undefined}
                  onClick={() => onNavigate(p.id)}
                  className={clsx(
                    'focus:ring-accent inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition focus:ring-2 focus:outline-none',
                    page === p.id
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-ink-soft hover:bg-subtle',
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {p.label}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-muted hidden items-center gap-1 text-sm sm:inline-flex">
              <UserCircle aria-hidden="true" className="h-4 w-4" />
              {email}
            </span>
            <ThemeToggle />
            <Button
              variant="secondary"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {children}
      </main>
      <footer className="border-line bg-surface border-t">
        <div className="text-muted mx-auto flex max-w-6xl gap-2 p-4 text-xs">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="text-ink-soft font-semibold">{DISCLAIMER}</p>
            <p>
              Observations and TAFs: aviationweather.gov (NOAA). Forecasts and
              UV: MET Norway, CC BY 4.0. Warnings: Australian Bureau of
              Meteorology.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
