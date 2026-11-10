import {describe, expect, it} from 'vitest';
import {resendAudit, resendEmail} from './resend';
import type {EmailAuditEntry} from './types';

const ORIGINAL: EmailAuditEntry = {
  id: 7,
  sentAt: '2026-11-09T12:00:00Z',
  groupId: 'g',
  groupName: 'Ramp supervisors',
  recipients: ['a@x.com', 'b@x.com'],
  subject: '[WATCH] Wind gust 27 kt at Brisbane (YBBN)',
  body: 'Watch: <wind>\nGusts 27 kt.',
  alertId: 'alert-1',
  airport: 'YBBN',
  category: 'wind',
  level: 'watch',
  event: 'raised',
  status: 'failed',
  error: 'SMTP 454',
  resendOf: null,
};

describe('resendEmail', () => {
  it('copies the original to the same recipients with a resend note', () => {
    expect(resendEmail(ORIGINAL)).toEqual({
      bcc: ['a@x.com', 'b@x.com'],
      subject: '[RESENT] [WATCH] Wind gust 27 kt at Brisbane (YBBN)',
      text:
        'Resent copy of an email first sent 2026-11-09 22:00 AEST / 12:00 UTC.\n\n' +
        'Watch: <wind>\nGusts 27 kt.',
      html:
        '<div style="font-family:Arial,sans-serif;font-size:14px;">' +
        'Resent copy of an email first sent 2026-11-09 22:00 AEST / 12:00 UTC.<br><br>' +
        'Watch: &lt;wind&gt;<br>Gusts 27 kt.</div>',
    });
  });

  it('keeps the note and tag when resending a resent copy', () => {
    const first = resendEmail(ORIGINAL);
    // resendOf is null once the first email has been purged.
    const copy = {
      ...ORIGINAL,
      id: 9,
      sentAt: '2026-11-10T00:00:00Z',
      resendOf: null,
      subject: first.subject,
      body: first.text,
    };
    expect(resendEmail(copy)).toMatchObject({
      subject: first.subject,
      text: first.text,
    });
  });
});

describe('resendAudit', () => {
  it('records the copy against the first original', () => {
    const sent = resendEmail(ORIGINAL);
    expect(resendAudit(ORIGINAL, sent, null)).toEqual({
      groupId: 'g',
      groupName: 'Ramp supervisors',
      recipients: ['a@x.com', 'b@x.com'],
      subject: sent.subject,
      body: sent.text,
      alertId: 'alert-1',
      airport: 'YBBN',
      category: 'wind',
      level: 'watch',
      event: 'raised',
      status: 'sent',
      error: null,
      resendOf: 7,
    });
    const copy = {...ORIGINAL, id: 9, resendOf: 7};
    expect(resendAudit(copy, sent, 'SMTP 535')).toMatchObject({
      status: 'failed',
      error: 'SMTP 535',
      resendOf: 7,
    });
  });
});
