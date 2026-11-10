import {categoryLabel} from './categories';
import {ALERT_CATEGORIES, type AlertCategory} from './types';

/**
 * The editable part of an alert email for one category: the icon and title
 * of its heading, and the "what to do" guidance shown under the alert.
 */
export interface EmailSection {
  category: AlertCategory;
  /** One of EMAIL_ICONS: emoji render in every mail client, SVG does not. */
  icon: string;
  title: string;
  guidance: string;
}

export type EmailSections = Record<AlertCategory, EmailSection>;

/** The categories an admin can edit, in the order the settings list them. */
export const EDITABLE_CATEGORIES = [
  'wind',
  'thunderstorm',
  'visibility',
  'heat',
  'uv',
  'cyclone',
] as const satisfies readonly AlertCategory[];

export const TITLE_MAX = 60;
export const GUIDANCE_MAX = 600;

/**
 * Icons that are safe in HTML email. Gmail, Outlook and Apple Mail strip
 * inline SVG and web fonts, and block remote images until the reader allows
 * them; plain Unicode emoji always render.
 */
export const EMAIL_ICONS = [
  {icon: '💨', name: 'Wind'},
  {icon: '🌬️', name: 'Wind face'},
  {icon: '🚩', name: 'Flag'},
  {icon: '⛈️', name: 'Thunder cloud'},
  {icon: '⚡', name: 'Lightning'},
  {icon: '🌩️', name: 'Lightning cloud'},
  {icon: '🌫️', name: 'Fog'},
  {icon: '👁️', name: 'Eye'},
  {icon: '🌡️', name: 'Thermometer'},
  {icon: '🔥', name: 'Fire'},
  {icon: '🥵', name: 'Hot face'},
  {icon: '☀️', name: 'Sun'},
  {icon: '😎', name: 'Sunglasses'},
  {icon: '🧴', name: 'Sunscreen'},
  {icon: '🌀', name: 'Cyclone'},
  {icon: '🌪️', name: 'Tornado'},
  {icon: '🌊', name: 'Wave'},
  {icon: '⏱️', name: 'Stopwatch'},
  {icon: '⚠️', name: 'Warning'},
  {icon: '✈️', name: 'Aeroplane'},
] as const;

const DEFAULTS: Record<AlertCategory, Omit<EmailSection, 'category'>> = {
  wind: {
    icon: '💨',
    title: 'Wind gust',
    guidance:
      'Secure loose equipment, baggage carts and stairs. Take care with ' +
      'aircraft doors and cargo doors in gusts.',
  },
  thunderstorm: {
    icon: '⛈️',
    title: 'Thunderstorm',
    guidance:
      'Be ready to stop ramp work when lightning is close. Shelter indoors ' +
      'or in a vehicle, away from aircraft, fuel and refuelling equipment.',
  },
  visibility: {
    icon: '🌫️',
    title: 'Low visibility',
    guidance:
      'Expect low-visibility procedures and delays. Use lights and hi-vis, ' +
      'and keep vehicle speeds down airside.',
  },
  heat: {
    icon: '🌡️',
    title: 'Heat',
    guidance:
      'Drink water often, take breaks in the shade or air conditioning, and ' +
      'watch each other for signs of heat stress.',
  },
  uv: {
    icon: '☀️',
    title: 'UV exposure',
    guidance:
      'Wear a shirt, SPF50+ sunscreen, a broad-brim hat and sunglasses, ' +
      'and seek shade where you can.',
  },
  cyclone: {
    icon: '🌀',
    title: 'Tropical cyclone',
    guidance:
      'Follow the airport cyclone plan. Tie down or move aircraft and ' +
      'equipment, and check the latest BoM advice.',
  },
  data_stale: {
    icon: '⏱️',
    title: categoryLabel('data_stale'),
    guidance:
      'Weather alerts may be missed until fresh observations arrive. ' +
      'Check official sources directly.',
  },
};

/** The built-in section for a category. */
export function defaultSection(category: AlertCategory): EmailSection {
  return {category, ...DEFAULTS[category]};
}

/** Every category's built-in section. */
export function defaultSections(): EmailSections {
  return Object.fromEntries(
    ALERT_CATEGORIES.map((c) => [c, defaultSection(c)]),
  ) as EmailSections;
}

/** The built-in sections with any saved ones laid over them. */
export function mergeSections(saved: readonly EmailSection[]): EmailSections {
  const sections = defaultSections();
  for (const section of saved) sections[section.category] = section;
  return sections;
}

/** True when two sections would produce the same email. */
export function sameSection(a: EmailSection, b: EmailSection): boolean {
  return (
    a.category === b.category &&
    a.icon === b.icon &&
    a.title.trim() === b.title.trim() &&
    a.guidance.trim() === b.guidance.trim()
  );
}

function isEmailIcon(icon: string): boolean {
  return EMAIL_ICONS.some((choice) => choice.icon === icon);
}

/** Why a section can't be saved, or null when it is fine. */
export function sectionProblem(section: EmailSection): string | null {
  const title = section.title.trim();
  if (title === '') return 'Enter a title.';
  if (title.length > TITLE_MAX)
    return `Keep the title to ${TITLE_MAX} characters.`;
  if (section.guidance.trim().length > GUIDANCE_MAX)
    return `Keep the guidance to ${GUIDANCE_MAX} characters.`;
  if (!isEmailIcon(section.icon)) return 'Pick one of the listed icons.';
  return null;
}
