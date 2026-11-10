import {airportByCode} from './airports';
import {defaultSections, type EmailSections} from './email_sections';
import {renderEmailHtml, type EmailView} from './email_html';
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

function subjectFor(view: EmailView): string {
  const {event, title, place} = view;
  if (event.kind === 'cleared') return `[ALL CLEAR] ${title} at ${place}`;
  const level = levelLabel(event.alert.level).toUpperCase();
  return `[${level}] ${title} ${event.alert.triggerValue} at ${place}`;
}

function textFor(view: EmailView): string {
  const {event, title, place, guidance, appUrl} = view;
  const {alert} = event;
  const lines =
    event.kind === 'cleared'
      ? [
          `All clear: ${title} at ${place}.`,
          `Cleared at ${formatUtcAndAest(alert.clearedAt ?? alert.updatedAt)}.`,
          `Peak level was ${levelLabel(alert.peakLevel)}.`,
        ]
      : [
          `${levelLabel(alert.level)}: ${title} at ${place}.`,
          alert.message,
          `Started ${formatUtcAndAest(alert.startedAt)}; ` +
            `updated ${formatUtcAndAest(alert.updatedAt)}.`,
        ];
  if (event.kind !== 'cleared' && guidance !== '')
    lines.push('', `What to do: ${guidance}`);
  if (appUrl !== null) lines.push('', `Dashboard: ${appUrl}`);
  return [...lines, '', DISCLAIMER].join('\n');
}

/**
 * Builds the subject and bodies for an alert event. `sections` supplies the
 * admin-edited icon, title and guidance for each category.
 */
export function composeEmail(
  event: AlertEvent,
  appUrl: string | null = null,
  sections: EmailSections = defaultSections(),
): EmailContent {
  const airport = airportByCode(event.alert.airport);
  const section = sections[event.alert.category];
  const view: EmailView = {
    event,
    place: `${airport.name} (${airport.code})`,
    title: section.title.trim(),
    icon: section.icon,
    guidance: section.guidance.trim(),
    appUrl,
    disclaimer: DISCLAIMER,
  };
  return {
    subject: subjectFor(view),
    text: textFor(view),
    html: renderEmailHtml(view),
  };
}
