import {useState, type FormEvent} from 'react';
import {Button, Card, ErrorText, TextField} from '../components/ui';
import {SignInError, type SignInFailure} from '../data/api';
import {useApi} from '../data/api_context';

/**
 * What to tell the user for each failure. Wrong email and wrong password
 * share one message so the screen doesn't reveal which part was wrong.
 */
const SIGN_IN_MESSAGES: Record<SignInFailure, string> = {
  credentials: 'Sign-in failed. Check your email and password.',
  unconfirmed:
    'This account has not been confirmed. Confirm the user in the ' +
    'Supabase dashboard (Authentication → Users), then try again.',
  rate_limited: 'Too many sign-in attempts. Wait a few minutes and try again.',
  unreachable:
    'Could not reach the sign-in service. Check your connection and ' +
    'try again.',
  unknown: 'Sign-in failed. Please try again.',
};

/** User-facing text for an error thrown by `DataApi.signIn`. */
function signInMessage(error: unknown): string {
  return SIGN_IN_MESSAGES[
    error instanceof SignInError ? error.reason : 'unknown'
  ];
}

/** Shared frame for the sign-in screens. */
export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-4">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">
        Airport Weather Alerts
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        Brisbane (YBBN) and Cairns (YBCS)
      </p>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </Card>
    </main>
  );
}

/** Email and password step for the single admin account. */
export function LoginPage() {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signIn(email.trim(), password);
    } catch (e) {
      setError(signInMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Admin sign-in">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          required
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        <ErrorText message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthFrame>
  );
}
