import {airportByCode} from './airports';
import {categoryLabel} from './categories';
import {isAtLeast, levelLabel} from './levels';
import {formatUtcAndAest} from './time';
import type {AlertEvent, MailGroup} from './types';

/** A composed email, ready for any mail transport. */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export const DISCLAIMER =
  'Advisory only. Follow official ATC, airport operator and company ' +
  'instructions. Values are indicative and may differ from official reports.';

/** The level a group's minimum is compared against for this event. */
function eventLevel(event: AlertEvent) {
  return event.kind === 'cleared' ? event.alert.peakLevel : event.alert.level;
}

/**
 * The groups that should be emailed about an event. The all-clear goes to the
 * same groups that were eligible for the alert at its peak.
 */
export function groupsForEvent(
  groups: readonly MailGroup[],
  event: AlertEvent,
): MailGroup[] {
  const {airport, category} = event.alert;
  return groups.filter(
    (g) =>
      g.enabled &&
      g.members.length > 0 &&
      g.airports.includes(airport) &&
      g.categories.includes(category) &&
      isAtLeast(eventLevel(event), g.minLevel),
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function subjectFor(event: AlertEvent, place: string): string {
  const {alert} = event;
  const what = categoryLabel(alert.category);
  if (event.kind === 'cleared') return `[ALL CLEAR] ${what} at ${place}`;
  const level = levelLabel(alert.level).toUpperCase();
  return `[${level}] ${what} ${alert.triggerValue} at ${place}`;
}

function linesFor(event: AlertEvent, place: string, appUrl: string | null) {
  const {alert} = event;
  const lines =
    event.kind === 'cleared'
      ? [
          `All clear: ${categoryLabel(alert.category)} at ${place}.`,
          `Cleared at ${formatUtcAndAest(alert.clearedAt ?? alert.updatedAt)}.`,
          `Peak level was ${levelLabel(alert.peakLevel)}.`,
        ]
      : [
          `${levelLabel(alert.level)}: ${categoryLabel(alert.category)} at ${place}.`,
          alert.message,
          `Started ${formatUtcAndAest(alert.startedAt)}; ` +
            `updated ${formatUtcAndAest(alert.updatedAt)}.`,
        ];
  if (appUrl !== null) lines.push(`Dashboard: ${appUrl}`);
  return [...lines, '', DISCLAIMER];
}

/** Builds the subject and body for an alert event. */
export function composeEmail(
  event: AlertEvent,
  appUrl: string | null = null,
): EmailContent {
  const airport = airportByCode(event.alert.airport);
  const place = `${airport.name} (${airport.code})`;
  const lines = linesFor(event, place, appUrl);
  const html = lines
    .filter((line) => line !== '')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
  return {subject: subjectFor(event, place), text: lines.join('\n'), html};
}
