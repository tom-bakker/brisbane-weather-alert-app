import {clsx} from 'clsx';
import {
  History,
  LayoutList,
  Mail,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {useState} from 'react';
import type {CurrentUser} from '../../domain/users';
import {AuditPage} from '../audit/audit_page';
import {GroupsPage} from '../groups/groups_page';
import {UserAuditPage} from '../users/user_audit_page';
import {UsersPage} from '../users/users_page';
import {EmailSectionsPage} from './email_sections_page';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shown to admins only. */
  adminOnly: boolean;
}

const TABS = [
  {id: 'sections', label: 'Email sections', icon: LayoutList, adminOnly: false},
  {id: 'groups', label: 'Mail groups', icon: Mail, adminOnly: false},
  {id: 'audit', label: 'Email audit', icon: ScrollText, adminOnly: false},
  {id: 'users', label: 'Users', icon: Users, adminOnly: true},
  {id: 'user_audit', label: 'User audit', icon: History, adminOnly: true},
] as const satisfies readonly Tab[];
type TabId = (typeof TABS)[number]['id'];

/** Every tab but sections, which stays mounted (see below). */
function OtherPanel({
  id,
  user,
}: {
  id: Exclude<TabId, 'sections'>;
  user: CurrentUser;
}) {
  switch (id) {
    case 'groups':
      return <GroupsPage />;
    case 'audit':
      return <AuditPage />;
    case 'users':
      return <UsersPage currentEmail={user.email} />;
    case 'user_audit':
      return <UserAuditPage />;
  }
}

/** Email, notification and (for admins) user settings, one tab per area. */
export function SettingsPage({user}: {user: CurrentUser}) {
  const [tab, setTab] = useState<TabId>('sections');
  const tabs = TABS.filter((t) => !t.adminOnly || user.role === 'admin');
  return (
    <div className="space-y-6">
      <nav
        aria-label="Settings"
        className="border-line flex flex-wrap gap-1 border-b"
      >
        {tabs.map(({id, label, icon: Icon, adminOnly}) => (
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
              adminOnly && tab !== id && 'hover:text-violet-600',
            )}
          >
            <Icon
              aria-hidden="true"
              className={clsx('h-4 w-4', adminOnly && 'text-violet-500')}
            />
            {label}
          </button>
        ))}
      </nav>
      {/* Kept mounted while hidden so unsaved section edits survive a tab switch. */}
      <div hidden={tab !== 'sections'}>
        <EmailSectionsPage />
      </div>
      {tab !== 'sections' && <OtherPanel id={tab} user={user} />}
    </div>
  );
}
