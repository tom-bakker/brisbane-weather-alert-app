import {clsx} from 'clsx';
import {LayoutList, Mail, ScrollText, type LucideIcon} from 'lucide-react';
import {useState} from 'react';
import {AuditPage} from '../audit/audit_page';
import {GroupsPage} from '../groups/groups_page';
import {EmailSectionsPage} from './email_sections_page';

const TABS = [
  {id: 'sections', label: 'Email sections', icon: LayoutList},
  {id: 'groups', label: 'Mail groups', icon: Mail},
  {id: 'audit', label: 'Email audit', icon: ScrollText},
] as const satisfies readonly {id: string; label: string; icon: LucideIcon}[];
type TabId = (typeof TABS)[number]['id'];

/** Mail groups or audit; the sections tab stays mounted (see below). */
function OtherPanel({id}: {id: Exclude<TabId, 'sections'>}) {
  switch (id) {
    case 'groups':
      return <GroupsPage />;
    case 'audit':
      return <AuditPage />;
  }
}

/** Email and notification settings, one tab per area. */
export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('sections');
  return (
    <div className="space-y-6">
      <nav
        aria-label="Settings"
        className="border-line flex flex-wrap gap-1 border-b"
      >
        {TABS.map(({id, label, icon: Icon}) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
            className={clsx(
              'focus:ring-accent -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition focus:ring-2 focus:outline-none',
              tab === id
                ? 'border-accent text-ink'
                : 'text-muted hover:text-ink border-transparent',
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      {/* Kept mounted while hidden so unsaved section edits survive a tab switch. */}
      <div hidden={tab !== 'sections'}>
        <EmailSectionsPage />
      </div>
      {tab !== 'sections' && <OtherPanel id={tab} />}
    </div>
  );
}
