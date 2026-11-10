import {clsx} from 'clsx';
import {Check, KeyRound, LogOut, PartyPopper} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {MIN_PASSWORD_LENGTH, passwordProblem} from '../../domain/users';
import {Button, ErrorText, TextField} from '../components/ui';
import type {PasswordIntent} from '../data/api';
import {useApi} from '../data/api_context';
import {AuthFrame} from './login_page';

const STRENGTH = [
  {label: 'Too short', bar: 'bg-red-500'},
  {label: 'Weak', bar: 'bg-orange-500'},
  {label: 'Fair', bar: 'bg-amber-500'},
  {label: 'Good', bar: 'bg-lime-500'},
  {label: 'Strong', bar: 'bg-emerald-500'},
] as const;

/** 0 (too short) to 4 (strong): length plus a mix of character kinds. */
export function passwordStrength(password: string): number {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(password),
  ).length;
  const lengthBonus = password.length >= 16 ? 1 : 0;
  return Math.min(4, Math.max(1, kinds - 1 + lengthBonus));
}

function StrengthMeter({password}: {password: string}) {
  const score = passwordStrength(password);
  const {label, bar} = STRENGTH[score] ?? STRENGTH[0];
  // "Too short" still lights one bar, in red.
  const filled = password === '' ? 0 : Math.max(score, 1);
  return (
    <div aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={clsx(
              'h-1.5 flex-1 rounded-full transition-colors',
              step <= filled ? bar : 'bg-subtle',
            )}
          />
        ))}
      </div>
      {password !== '' && (
        <p className="text-muted mt-1 text-xs">Strength: {label}</p>
      )}
    </div>
  );
}

function Rule({ok, children}: {ok: boolean; children: string}) {
  return (
    <li
      className={clsx(
        'flex items-center gap-1.5 text-xs transition-colors',
        ok ? 'text-ok' : 'text-muted',
      )}
    >
      <Check
        aria-hidden="true"
        className={clsx('h-3.5 w-3.5', ok ? 'opacity-100' : 'opacity-30')}
      />
      {children}
    </li>
  );
}

const COPY: Record<PasswordIntent, {title: string; intro: string}> = {
  invite: {
    title: 'Welcome aboard',
    intro:
      'You have been invited to Airport Weather Alerts. Choose a password, ' +
      'then set up an authenticator app.',
  },
  recovery: {
    title: 'Choose a new password',
    intro: 'An admin sent you a password reset. Pick a new password below.',
  },
};

interface SetPasswordPageProps {
  email: string;
  intent: PasswordIntent;
  onDone: () => void;
}

/** Shown after an invite or reset link, before the app opens. */
export function SetPasswordPage({email, intent, onDone}: SetPasswordPageProps) {
  const api = useApi();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {title, intro} = COPY[intent];
  const Icon = intent === 'invite' ? PartyPopper : KeyRound;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, confirm);
    setError(problem);
    if (problem !== null) return;
    setBusy(true);
    try {
      await api.setPassword(password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={title}>
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-sky-500 text-white shadow-sm">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-muted text-sm">{intro}</p>
          <p className="text-ink mt-1 text-sm font-medium break-all">{email}</p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
        />
        <StrengthMeter password={password} />
        <TextField
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
        />
        <ul className="space-y-1">
          <Rule ok={password.length >= MIN_PASSWORD_LENGTH}>
            {`At least ${MIN_PASSWORD_LENGTH} characters`}
          </Rule>
          <Rule ok={password !== '' && password === confirm}>
            Both passwords match
          </Rule>
        </ul>
        <ErrorText message={error} />
        <Button type="submit" disabled={busy}>
          <KeyRound aria-hidden="true" className="h-4 w-4" />
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => void api.signOut()}
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        Cancel and sign out
      </Button>
    </AuthFrame>
  );
}
