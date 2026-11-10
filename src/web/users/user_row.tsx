import {Clock, KeyRound, Smartphone, Trash2} from 'lucide-react';
import {useId, useState} from 'react';
import {
  lastSeen,
  ROLE_INFO,
  USER_ROLES,
  userStatus,
  type AppUser,
  type UserRole,
} from '../../domain/users';
import {Button} from '../components/ui';
import {Avatar, RoleBadge, StatusPill} from './role_badge';

/** The actions that ask "are you sure?" first. */
export type RowAction = 'reset_password' | 'reset_mfa' | 'remove';

const CONFIRM_TEXT: Record<RowAction, {question: string; yes: string}> = {
  reset_password: {
    question: 'Email a password reset link to',
    yes: 'Send reset email',
  },
  reset_mfa: {
    question: 'Remove the authenticator for',
    yes: 'Reset MFA',
  },
  remove: {question: 'Permanently remove', yes: 'Remove user'},
};

export interface UserRowProps {
  user: AppUser;
  isSelf: boolean;
  now: Date;
  onAction: (action: RowAction, user: AppUser) => Promise<void>;
  onRoleChange: (user: AppUser, role: UserRole) => Promise<void>;
}

function ConfirmBar({
  action,
  email,
  busy,
  onYes,
  onCancel,
}: {
  action: RowAction;
  email: string;
  busy: boolean;
  onYes: () => void;
  onCancel: () => void;
}) {
  const {question, yes} = CONFIRM_TEXT[action];
  return (
    <div
      role="group"
      aria-label="Confirm"
      className="bg-subtle flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm"
    >
      <span className="flex-1">
        {question} <strong className="break-all">{email}</strong>?
      </span>
      <Button
        variant={action === 'remove' ? 'danger' : 'primary'}
        disabled={busy}
        onClick={onYes}
      >
        {busy ? 'Working…' : yes}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** One user: who they are, their state, and what the admin can do. */
export function UserRow({
  user,
  isSelf,
  now,
  onAction,
  onRoleChange,
}: UserRowProps) {
  const roleId = useId();
  const [confirming, setConfirming] = useState<RowAction | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    await work();
    setBusy(false);
    setConfirming(null);
  }

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar email={user.email} />
        <div className="min-w-0 flex-1">
          <p className="text-ink flex flex-wrap items-center gap-2 font-medium">
            <span className="break-all">{user.email}</span>
            {isSelf && (
              <span className="bg-ink text-canvas rounded-full px-2 py-0.5 text-xs">
                You
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <RoleBadge role={user.role} />
            <StatusPill status={userStatus(user)} />
            <span className="text-muted inline-flex items-center gap-1 text-xs">
              <Clock aria-hidden="true" className="h-3 w-3" />
              Last sign-in: {lastSeen(user.lastSignInAt, now)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={roleId} className="sr-only">
            Role for {user.email}
          </label>
          <select
            id={roleId}
            value={user.role}
            disabled={isSelf || busy}
            title={isSelf ? 'You cannot change your own role' : undefined}
            onChange={(e) =>
              void run(() => onRoleChange(user, e.target.value as UserRole))
            }
            className="border-line-strong bg-surface text-ink rounded-md border px-2 py-2 text-sm disabled:opacity-50"
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_INFO[role].label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            aria-label={`Reset password for ${user.email}`}
            title="Reset password"
            disabled={busy}
            onClick={() => setConfirming('reset_password')}
          >
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            <span className="hidden lg:inline">Password</span>
          </Button>
          <Button
            variant="secondary"
            aria-label={`Reset MFA for ${user.email}`}
            title={
              user.mfaEnrolled ? 'Reset MFA' : 'No authenticator set up yet'
            }
            disabled={busy || !user.mfaEnrolled}
            onClick={() => setConfirming('reset_mfa')}
          >
            <Smartphone aria-hidden="true" className="h-4 w-4" />
            <span className="hidden lg:inline">MFA</span>
          </Button>
          <Button
            variant="danger"
            aria-label={`Remove ${user.email}`}
            title={isSelf ? 'You cannot remove yourself' : 'Remove user'}
            disabled={busy || isSelf}
            onClick={() => setConfirming('remove')}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {confirming !== null && (
        <ConfirmBar
          action={confirming}
          email={user.email}
          busy={busy}
          onYes={() => void run(() => onAction(confirming, user))}
          onCancel={() => setConfirming(null)}
        />
      )}
    </li>
  );
}
