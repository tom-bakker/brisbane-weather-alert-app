import {LogOut, ShieldCheck, Smartphone} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {Button, ErrorText, TextField} from '../components/ui';
import type {MfaEnrolment} from '../data/api';
import {useApi} from '../data/api_context';
import {AuthFrame} from './login_page';

interface CodeFormProps {
  factorId: string;
  onVerified: () => void;
}

/** Asks for the 6-digit code from the authenticator app. */
function CodeForm({factorId, onVerified}: CodeFormProps) {
  const api = useApi();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.verifyMfa(factorId, code.replace(/\s+/g, ''));
      onVerified();
    } catch {
      setError('That code did not work. Wait for a new code and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label="6-digit code"
        value={code}
        onChange={setCode}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
      />
      <ErrorText message={error} />
      <Button type="submit" disabled={busy}>
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        {busy ? 'Checking…' : 'Verify'}
      </Button>
    </form>
  );
}

/** Second step of sign-in for an admin who has an authenticator set up. */
export function MfaVerifyPage({factorId, onVerified}: CodeFormProps) {
  const api = useApi();
  return (
    <AuthFrame title="Two-step verification">
      <p className="text-muted mb-4 text-sm">
        Enter the code from your authenticator app.
      </p>
      <CodeForm factorId={factorId} onVerified={onVerified} />
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

/** First sign-in: the admin must add an authenticator before going further. */
export function MfaEnrolPage({onVerified}: {onVerified: () => void}) {
  const api = useApi();
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    try {
      setEnrolment(await api.enrolMfa());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start set-up.');
    }
  }

  return (
    <AuthFrame title="Set up two-step verification">
      <p className="text-muted mb-4 text-sm">
        The admin account must use an authenticator app (for example Google
        Authenticator, Microsoft Authenticator, Aegis or 2FAS) in addition to
        the password.
      </p>
      {enrolment === null ? (
        <>
          <ErrorText message={error} />
          <Button className="w-full" onClick={() => void start()}>
            <Smartphone aria-hidden="true" className="h-4 w-4" />
            Set up authenticator
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <img
            src={enrolment.qrCode}
            alt="QR code for your authenticator app"
            className="mx-auto h-48 w-48"
          />
          <p className="text-muted text-xs break-all">
            Can't scan? Enter this key:{' '}
            <code className="font-mono">{enrolment.secret}</code>
          </p>
          <CodeForm factorId={enrolment.factorId} onVerified={onVerified} />
        </div>
      )}
    </AuthFrame>
  );
}
