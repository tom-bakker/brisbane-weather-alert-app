import {clsx} from 'clsx';
import {Crown, Send, UserPlus, Zap, type LucideIcon} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {ROLE_INFO, USER_ROLES, type UserRole} from '../../domain/users';
import {Button, Card, ErrorText, TextField} from '../components/ui';
import {isValidEmail} from '../data/api';

const ROLE_ICONS: Record<UserRole, LucideIcon> = {
  admin: Crown,
  power_user: Zap,
};

/** Two big radio cards for picking a role. */
function RolePicker({
  value,
  onChange,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
}) {
  return (
    <fieldset>
      <legend className="text-ink-soft mb-1 text-sm font-medium">Role</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {USER_ROLES.map((role) => {
          const Icon = ROLE_ICONS[role];
          const checked = value === role;
          return (
            <label
              key={role}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition',
                'has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-2',
                checked
                  ? 'border-accent bg-sky-50 dark:bg-sky-500/10'
                  : 'border-line-strong hover:bg-subtle',
              )}
            >
              <input
                type="radio"
                name="invite-role"
                value={role}
                checked={checked}
                onChange={() => onChange(role)}
                className="sr-only"
              />
              <Icon
                aria-hidden="true"
                className={clsx(
                  'mt-0.5 h-5 w-5 shrink-0',
                  checked ? 'text-accent' : 'text-muted',
                )}
              />
              <span>
                <span className="text-ink block text-sm font-semibold">
                  {ROLE_INFO[role].label}
                </span>
                <span className="text-muted block text-xs">
                  {ROLE_INFO[role].summary}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Invites a new user by email with a chosen role. */
export function InviteCard({
  onInvite,
}: {
  onInvite: (email: string, role: UserRole) => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('power_user');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    if (await onInvite(trimmed, role)) setEmail('');
    setBusy(false);
  }

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/30 to-sky-400/30 blur-2xl"
      />
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <UserPlus aria-hidden="true" className="text-accent h-5 w-5" />
        Invite someone
      </h2>
      <p className="text-muted mb-4 text-sm">
        They get an email with a link to choose a password, then set up an
        authenticator app. The link works once and expires after an hour.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email address"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="off"
          required
        />
        <RolePicker value={role} onChange={setRole} />
        <ErrorText message={error} />
        <Button type="submit" disabled={busy} className="self-start">
          <Send aria-hidden="true" className="h-4 w-4" />
          {busy ? 'Sending…' : 'Send invite'}
        </Button>
      </form>
    </Card>
  );
}
