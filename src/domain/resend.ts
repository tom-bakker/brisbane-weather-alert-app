import {escapeMultiline} from './email_html';
import {formatUtcAndAest} from './time';
import type {EmailAuditEntry, NewEmailAudit, OutgoingEmail} from './types';

/** Starts the subject of every copy, so an old alert never looks current. */
const SUBJECT_TAG = '[RESENT] ';

/** Starts the text of every copy. */
const NOTE_START = 'Resent copy of an email first sent ';

/**
 * The text of a resent copy. The original's own text is not kept as HTML, so
 * the copy is the audited plain text, opened with a note saying when it was
 * first sent. A copy of a copy already carries that note; it is found from
 * the text, as `resendOf` is cleared once the first email is purged.
 */
function resentText(original: EmailAuditEntry): string {
  if (original.body.startsWith(NOTE_START)) return original.body;
  const sentAt = formatUtcAndAest(original.sentAt);
  return `${NOTE_START}${sentAt}.\n\n${original.body}`;
}

function resentSubject(subject: string): string {
  return subject.startsWith(SUBJECT_TAG) ? subject : SUBJECT_TAG + subject;
}

/** A copy of an audited email, for the same recipients as the original. */
export function resendEmail(original: EmailAuditEntry): OutgoingEmail {
  const text = resentText(original);
  return {
    bcc: [...original.recipients],
    subject: resentSubject(original.subject),
    text,
    html:
      '<div style="font-family:Arial,sans-serif;font-size:14px;">' +
      `${escapeMultiline(text)}</div>`,
  };
}

/** Audit row for a resent copy, linked to the first original. */
export function resendAudit(
  original: EmailAuditEntry,
  sent: OutgoingEmail,
  error: string | null,
): NewEmailAudit {
  return {
    groupId: original.groupId,
    groupName: original.groupName,
    recipients: sent.bcc,
    subject: sent.subject,
    body: sent.text,
    alertId: original.alertId,
    airport: original.airport,
    category: original.category,
    level: original.level,
    event: original.event,
    status: error === null ? 'sent' : 'failed',
    error,
    resendOf: original.resendOf ?? original.id,
  };
}
