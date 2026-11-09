import {clsx} from 'clsx';
import type {ReactNode} from 'react';
import {DISCLAIMER} from '../../domain/notifications';
import {Button} from '../components/ui';

export const PAGES = [
  {id: 'dashboard', label: 'Dashboard'},
  {id: 'alerts', label: 'Alerts'},
  {id: 'groups', label: 'Mail groups'},
  {id: 'audit', label: 'Email audit'},
] as const;
export type PageId = (typeof PAGES)[number]['id'];

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
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-lg font-semibold">Airport Weather Alerts</p>
          <nav aria-label="Main" className="flex flex-wrap gap-1">
            {PAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-current={page === p.id ? 'page' : undefined}
                onClick={() => onNavigate(p.id)}
                className={clsx(
                  'rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none',
                  page === p.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                {p.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{email}</span>
            <Button variant="secondary" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-1 p-4 text-xs text-gray-600">
          <p className="font-semibold text-gray-800">{DISCLAIMER}</p>
          <p>
            Observations and TAFs: aviationweather.gov (NOAA). Forecasts and UV:
            MET Norway, CC BY 4.0. Warnings: Australian Bureau of Meteorology.
          </p>
        </div>
      </footer>
    </div>
  );
}
