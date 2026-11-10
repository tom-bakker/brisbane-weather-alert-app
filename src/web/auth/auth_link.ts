import type {PasswordIntent} from '../data/api';

/** What an emailed invite or reset link brought with it. */
export interface AuthLink {
  intent: PasswordIntent | null;
  error: string | null;
}

const EXPIRED =
  'This link has expired or was already used. Ask an admin to send a new one.';

/**
 * Reads the URL fragment Supabase Auth adds when an invite or password reset
 * link is opened: `#access_token=…&type=invite`, or `#error=…` on failure.
 */
export function parseAuthLink(hash: string): AuthLink {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const type = params.get('type');
  const intent = type === 'invite' || type === 'recovery' ? type : null;
  if (params.get('error') === null) return {intent, error: null};
  const description = params.get('error_description');
  const error =
    params.get('error_code') === 'otp_expired' || description === null
      ? EXPIRED
      : description;
  return {intent: null, error};
}

/** Remembers, for this browser tab, that a password must be chosen. */
export interface IntentStore {
  get(): PasswordIntent | null;
  set(intent: PasswordIntent): void;
  clear(): void;
}

const KEY = 'pending-password-intent';

/**
 * IntentStore in sessionStorage, so it survives the MFA step reloading the
 * page but not closing the tab. Storage failures act as "nothing stored".
 */
export function sessionIntentStore(storage: Storage): IntentStore {
  return {
    get() {
      try {
        const value = storage.getItem(KEY);
        return value === 'invite' || value === 'recovery' ? value : null;
      } catch {
        return null;
      }
    },
    set(intent) {
      try {
        storage.setItem(KEY, intent);
      } catch {
        // Private mode: the user can still use "Reset password" again.
      }
    },
    clear() {
      try {
        storage.removeItem(KEY);
      } catch {
        // Nothing stored.
      }
    },
  };
}

/** An IntentStore in memory, for tests and the demo. */
export function memoryIntentStore(
  initial: PasswordIntent | null = null,
): IntentStore {
  let value = initial;
  return {
    get: () => value,
    set: (intent) => {
      value = intent;
    },
    clear: () => {
      value = null;
    },
  };
}
