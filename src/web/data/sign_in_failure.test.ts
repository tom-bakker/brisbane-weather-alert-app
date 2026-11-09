import {describe, expect, it} from 'vitest';
import {signInFailureFor} from './api';

describe('signInFailureFor', () => {
  it.each([
    ['invalid_credentials', 400, 'credentials'],
    ['email_not_confirmed', 400, 'unconfirmed'],
    ['over_request_rate_limit', 429, 'rate_limited'],
    [undefined, 429, 'rate_limited'],
    [undefined, 0, 'unreachable'],
    ['validation_failed', 400, 'unknown'],
    [undefined, undefined, 'unknown'],
  ] as const)('maps %s / %s to %s', (code, status, reason) => {
    expect(signInFailureFor(code, status)).toBe(reason);
  });
});
