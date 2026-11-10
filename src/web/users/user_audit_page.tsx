import {clsx} from 'clsx';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  KeyRound,
  MailCheck,
  RotateCcwKey,
  Smartphone,
  UserCog,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import {useCallback, useState} from 'react';
import {formatUtcAndAest} from '../../domain/time';
import {
  AUDIT_ACTION_LABELS,
  USER_AUDIT_ACTIONS,
  type UserAuditAction,
} from '../../domain/users';
import {Button, ErrorText, PageHeading} from '../components/ui';
import type {UserAuditQuery} from '../data/api';
import {useApi, useAsync} from '../data/api_context';

const PAGE_SIZE = 25;

const ACTION_STYLES: Record<
  UserAuditAction,
  {icon: LucideIcon; className: string}
> = {
  user_invited: {
    icon: UserPlus,
    className:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  user_removed: {
    icon: UserMinus,
    className: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  },
  role_changed: {
    icon: UserCog,
    className:
      'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  },
  password_reset_sent: {
    icon: RotateCcwKey,
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  },
  password_changed: {
    icon: KeyRound,
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  },
  mfa_reset: {
    icon: Smartphone,
    className:
      'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  },
  email_confirmed: {
    icon: MailCheck,
    className:
      'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  },
};

/**
 * Settings → User audit (admins only): who was added or removed, password
 * and MFA resets and email confirmations, newest first. Read-only.
 */
export function UserAuditPage() {
  const api = useApi();
  const [action, setAction] = useState<UserAuditQuery['action']>('all');
  const [page, setPage] = useState(0);
  const load = useCallback(
    () => api.loadUserAudit({action, page, pageSize: PAGE_SIZE}),
    [api, action, page],
  );
  const {data, error} = useAsync(load);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={History}
          title="User audit"
          subtitle="Every change to who can sign in. Entries cannot be edited or deleted."
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="user-audit-action"
            className="text-ink-soft inline-flex items-center gap-1 text-sm font-medium"
          >
            <Filter aria-hidden="true" className="h-3.5 w-3.5" />
            Action
          </label>
          <select
            id="user-audit-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as UserAuditQuery['action']);
              setPage(0);
            }}
            className="border-line-strong bg-surface text-ink rounded-md border px-3 py-2 text-sm"
          >
            <option value="all">All actions</option>
            {USER_AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErrorText message={error} />
      <ol className="border-line bg-surface divide-line divide-y rounded-xl border shadow-sm">
        {data?.rows.map((row) => {
          const {icon: Icon, className} = ACTION_STYLES[row.action];
          return (
            <li key={row.id} className="flex items-start gap-3 p-4">
              <span
                className={clsx(
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  className,
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">
                    {AUDIT_ACTION_LABELS[row.action]}
                  </span>
                  <span className="text-muted"> · </span>
                  <span className="break-all">{row.targetEmail}</span>
                </p>
                <p className="text-muted text-xs">
                  {row.detail}
                  {row.actorEmail !== null &&
                    row.actorEmail !== row.targetEmail &&
                    ` · by ${row.actorEmail}`}
                </p>
              </div>
              <time
                dateTime={row.occurredAt}
                className="text-muted shrink-0 text-right text-xs whitespace-nowrap"
              >
                {formatUtcAndAest(row.occurredAt)}
              </time>
            </li>
          );
        })}
        {data?.rows.length === 0 && (
          <li className="text-muted p-4 text-sm">Nothing recorded yet.</li>
        )}
      </ol>
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Newer
        </Button>
        <span className="text-muted text-sm">
          Page {page + 1} of {pages} ({data?.total ?? 0} entries)
        </span>
        <Button
          variant="secondary"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          Older
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
