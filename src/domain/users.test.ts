import {describe, expect, it} from 'vitest';
import {lastSeen, passwordProblem, userStatus, type AppUser} from './users';

const base: AppUser = {
  id: 'u',
  email: 'a@b.co',
  role: 'power_user',
  invitedAt: '2026-11-01T00:00:00Z',
  emailConfirmed: true,
  mfaEnrolled: true,
  lastSignInAt: null,
};

describe('userStatus', () => {
  it('follows the invite → MFA → active path', () => {
    expect(userStatus({...base, emailConfirmed: false})).toBe('invited');
    expect(userStatus({...base, mfaEnrolled: false})).toBe('needs_mfa');
    expect(userStatus(base)).toBe('active');
  });
});

describe('lastSeen', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it.each([
    [null, 'Never'],
    ['2026-11-10T11:59:30Z', 'just now'],
    ['2026-11-10T09:55:00Z', '2 h 5 min ago'],
    ['2026-11-09T11:00:00Z', '1 day ago'],
    ['2026-11-06T12:00:00Z', '4 days ago'],
  ])('%s → %s', (iso, text) => {
    expect(lastSeen(iso, now)).toBe(text);
  });
});

describe('passwordProblem', () => {
  it('needs 12 characters and a matching confirmation', () => {
    expect(passwordProblem('short', 'short')).toBe(
      'Use at least 12 characters.',
    );
    expect(passwordProblem('a'.repeat(11), 'a'.repeat(11))).not.toBeNull();
    expect(passwordProblem('a'.repeat(12), 'a'.repeat(12))).toBeNull();
    expect(passwordProblem('a'.repeat(12), 'b'.repeat(12))).toBe(
      'The two passwords do not match.',
    );
  });
});
