import {clsx} from 'clsx';
import {
  CircleCheck,
  Crown,
  Hourglass,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {useCallback, useState} from 'react';
import {
  ROLE_INFO,
  userStatus,
  type AppUser,
  type UserRole,
} from '../../domain/users';
import {ErrorText, PageHeading} from '../components/ui';
import {useApi, useAsync} from '../data/api_context';
import {InviteCard} from './invite_card';
import {UserRow, type RowAction} from './user_row';

function StatTile({
  icon: Icon,
  label,
  value,
  gradient,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  gradient: string;
}) {
  return (
    <div className="border-line bg-surface flex items-center gap-3 rounded-xl border p-3 shadow-sm">
      <span
        className={clsx(
          'inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm',
          gradient,
        )}
      >
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl leading-none font-semibold tabular-nums">
          {value}
        </p>
        <p className="text-muted text-xs">{label}</p>
      </div>
    </div>
  );
}

function Stats({users}: {users: AppUser[]}) {
  const count = (test: (u: AppUser) => boolean) => users.filter(test).length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={Users}
        label="Users"
        value={users.length}
        gradient="from-sky-500 to-indigo-600"
      />
      <StatTile
        icon={Crown}
        label="Admins"
        value={count((u) => u.role === 'admin')}
        gradient="from-violet-500 to-purple-600"
      />
      <StatTile
        icon={Zap}
        label="Power users"
        value={count((u) => u.role === 'power_user')}
        gradient="from-cyan-500 to-sky-600"
      />
      <StatTile
        icon={Hourglass}
        label="Awaiting set-up"
        value={count((u) => userStatus(u) !== 'active')}
        gradient="from-amber-500 to-orange-600"
      />
    </div>
  );
}

const DONE_TEXT: Record<RowAction, (email: string) => string> = {
  reset_password: (email) => `Password reset email sent to ${email}.`,
  reset_mfa: (email) =>
    `MFA reset for ${email}. They set up a new authenticator at next sign-in.`,
  remove: (email) => `${email} has been removed.`,
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Settings → Users (admins only): invite people, change roles, reset
 * passwords or MFA and remove accounts. Shows emails only, never secrets.
 */
export function UsersPage({currentEmail}: {currentEmail: string}) {
  const api = useApi();
  const load = useCallback(() => api.listUsers(), [api]);
  const {data: users, error, reload} = useAsync(load);
  const [flash, setFlash] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /** Runs one change, then shows the outcome and reloads the list. */
  async function act(work: () => Promise<void>, done: string) {
    setFlash(null);
    setFailure(null);
    try {
      await work();
      setFlash(done);
      reload();
      return true;
    } catch (e) {
      setFailure(messageOf(e));
      return false;
    }
  }

  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeading
        icon={Users}
        title="Users"
        subtitle="Invite only. Everyone signs in with a password and an authenticator app."
      />
      {users !== null && <Stats users={users} />}
      <InviteCard
        onInvite={(email, role) =>
          act(
            () => api.inviteUser(email, role),
            `Invitation sent to ${email} as ${ROLE_INFO[role].label}.`,
          )
        }
      />
      {flash !== null && (
        <p
          role="status"
          className="text-ok flex items-center gap-1.5 rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10"
        >
          <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
          {flash}
        </p>
      )}
      <ErrorText message={failure ?? error} />
      <section aria-labelledby="user-list-heading">
        <h2 id="user-list-heading" className="mb-2 text-lg font-semibold">
          Everyone with access
        </h2>
        <ul className="border-line bg-surface divide-line divide-y rounded-xl border shadow-sm">
          {users?.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.email === currentEmail}
              now={now}
              onAction={async (action, target) => {
                await act(
                  () => runAction(action, target.id),
                  DONE_TEXT[action](target.email),
                );
              }}
              onRoleChange={async (target, role: UserRole) => {
                await act(
                  () => api.setUserRole(target.id, role),
                  `${target.email} is now ${ROLE_INFO[role].label}.`,
                );
              }}
            />
          ))}
          {users === null && error === null && (
            <li className="text-muted p-4 text-sm">Loading users…</li>
          )}
        </ul>
      </section>
    </div>
  );

  function runAction(action: RowAction, userId: string): Promise<void> {
    switch (action) {
      case 'reset_password':
        return api.resetUserPassword(userId);
      case 'reset_mfa':
        return api.resetUserMfa(userId);
      case 'remove':
        return api.removeUser(userId);
    }
  }
}
