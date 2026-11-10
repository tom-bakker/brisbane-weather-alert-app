import {describe, expect, it} from 'vitest';
import {
  memoryIntentStore,
  parseAuthLink,
  sessionIntentStore,
} from './auth_link';

describe('parseAuthLink', () => {
  it('spots invite and recovery links', () => {
    expect(parseAuthLink('#access_token=x&type=invite')).toEqual({
      intent: 'invite',
      error: null,
    });
    expect(parseAuthLink('#access_token=x&type=recovery').intent).toBe(
      'recovery',
    );
  });

  it('ignores ordinary pages and other link types', () => {
    expect(parseAuthLink('')).toEqual({intent: null, error: null});
    expect(parseAuthLink('#type=signup')).toEqual({intent: null, error: null});
  });

  it('explains an expired link in plain words', () => {
    const {intent, error} = parseAuthLink(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    );
    expect(intent).toBeNull();
    expect(error).toMatch(/expired or was already used/);
  });

  it('passes other link errors through, or the generic text', () => {
    expect(
      parseAuthLink('#error=server_error&error_description=Database+down')
        .error,
    ).toBe('Database down');
    expect(parseAuthLink('#error=server_error').error).toMatch(/expired/);
  });
});

describe('intent stores', () => {
  it('remembers an intent in session storage until cleared', () => {
    const store = sessionIntentStore(window.sessionStorage);
    expect(store.get()).toBeNull();
    store.set('invite');
    expect(store.get()).toBe('invite');
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('treats unusable storage as empty', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const store = sessionIntentStore(broken);
    expect(() => store.set('recovery')).not.toThrow();
    expect(store.get()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });

  it('ignores unknown stored values', () => {
    window.sessionStorage.setItem('pending-password-intent', 'bogus');
    expect(sessionIntentStore(window.sessionStorage).get()).toBeNull();
    window.sessionStorage.clear();
  });

  it('keeps an intent in memory', () => {
    const store = memoryIntentStore();
    store.set('recovery');
    expect(store.get()).toBe('recovery');
    store.clear();
    expect(store.get()).toBeNull();
  });
});
