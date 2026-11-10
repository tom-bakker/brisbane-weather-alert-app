/** App users, their roles and the user audit trail. */
import {formatAge, minutesSince} from './time';

export const USER_ROLES = ['admin', 'power_user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_INFO: Record<UserRole, {label: string; summary: string}> = {
  admin: {
    label: 'Admin',
    summary: 'Everything, including adding and removing users.',
  },
  power_user: {
    label: 'Power user',
    summary: 'Mail groups, email sections, audit and the dashboard.',
  },
};

/** The signed-in user, as the pages need them. */
export interface CurrentUser {
  email: string;
  role: UserRole;
}

/** A user as the admin sees them: no password or MFA secret, ever. */
export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  invitedAt: string;
  emailConfirmed: boolean;
  mfaEnrolled: boolean;
  lastSignInAt: string | null;
}

/** Invited: hasn't accepted. Needs MFA: accepted, no authenticator yet. */
export type UserStatus = 'invited' | 'needs_mfa' | 'active';

export function userStatus(user: AppUser): UserStatus {
  if (!user.emailConfirmed) return 'invited';
  return user.mfaEnrolled ? 'active' : 'needs_mfa';
}

export const USER_AUDIT_ACTIONS = [
  'user_invited',
  'user_removed',
  'role_changed',
  'password_reset_sent',
  'password_changed',
  'mfa_reset',
  'email_confirmed',
] as const;
export type UserAuditAction = (typeof USER_AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<UserAuditAction, string> = {
  user_invited: 'User added',
  user_removed: 'User removed',
  role_changed: 'Role changed',
  password_reset_sent: 'Password reset sent',
  password_changed: 'Password changed',
  mfa_reset: 'MFA reset',
  email_confirmed: 'Email confirmed',
};

export interface UserAuditEntry {
  id: number;
  occurredAt: string;
  action: UserAuditAction;
  actorEmail: string | null;
  targetEmail: string;
  detail: string | null;
}

/** "Never", "just now", "3 h 5 min ago" or "4 days ago". */
export function lastSeen(iso: string | null, now: Date): string {
  if (iso === null) return 'Never';
  const days = Math.floor(minutesSince(iso, now) / (24 * 60));
  if (days < 1) return formatAge(iso, now);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export const MIN_PASSWORD_LENGTH = 12;

/** Why a new password can't be used, or null when it is fine. */
export function passwordProblem(
  password: string,
  confirm: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}
