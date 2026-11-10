import {clsx} from 'clsx';
import {
  Crown,
  MailQuestion,
  ShieldAlert,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {ROLE_INFO, type UserRole, type UserStatus} from '../../domain/users';

const ROLE_STYLES: Record<UserRole, {icon: LucideIcon; className: string}> = {
  admin: {
    icon: Crown,
    className:
      'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  },
  power_user: {
    icon: Zap,
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  },
};

/** "Admin" or "Power user" with its icon. */
export function RoleBadge({role}: {role: UserRole}) {
  const {icon: Icon, className} = ROLE_STYLES[role];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {ROLE_INFO[role].label}
    </span>
  );
}

const STATUS_STYLES: Record<
  UserStatus,
  {label: string; icon: LucideIcon; className: string}
> = {
  invited: {
    label: 'Invite sent',
    icon: MailQuestion,
    className:
      'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  },
  needs_mfa: {
    label: 'MFA not set up',
    icon: ShieldAlert,
    className:
      'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200',
  },
  active: {
    label: 'Active',
    icon: ShieldCheck,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  },
};

/** Where a user is in setting up their account. */
export function StatusPill({status}: {status: UserStatus}) {
  const {label, icon: Icon, className} = STATUS_STYLES[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}

const AVATAR_GRADIENTS = [
  'from-sky-500 to-indigo-600',
  'from-fuchsia-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-red-600',
] as const;

/** A stable small number from a string, to pick an avatar colour. */
export function hashIndex(text: string, size: number): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % size;
}

/** Up to two initials from the part of an email before the @. */
export function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter((p) => p !== '');
  const letters =
    parts.length >= 2 ? `${parts[0]?.[0]}${parts[1]?.[0]}` : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** A coloured circle with the user's initials. */
export function Avatar({email}: {email: string}) {
  const gradient = AVATAR_GRADIENTS[hashIndex(email, AVATAR_GRADIENTS.length)];
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm',
        gradient,
      )}
    >
      {initials(email)}
    </span>
  );
}
