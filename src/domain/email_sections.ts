import {categoryLabel} from './categories';
import {levelLabel} from './levels';
import {
  ALERT_CATEGORIES,
  ALERT_LEVELS,
  type AlertCategory,
  type AlertEvent,
  type AlertLevel,
} from './types';

/** The stage of an alert an email is about: a level, or its all-clear. */
export type EmailPhase = AlertLevel | 'cleared';

/** Every phase, in the order the settings offer them. */
export const EMAIL_PHASES: readonly EmailPhase[] = [...ALERT_LEVELS, 'cleared'];

/** Display label for a phase, e.g. "Stand-down" or "All clear". */
export function phaseLabel(phase: EmailPhase): string {
  return phase === 'cleared' ? 'All clear' : levelLabel(phase);
}

/** The phase an alert event's email is written for. */
export function phaseOf(event: AlertEvent): EmailPhase {
  return event.kind === 'cleared' ? 'cleared' : event.alert.level;
}

/**
 * The editable part of an alert email for one category at one phase: the
 * icon and title of its heading, and the "what to do" guidance shown under
 * the alert.
 */
export interface EmailSection {
  category: AlertCategory;
  phase: EmailPhase;
  /** One of EMAIL_ICONS: emoji render in every mail client, SVG does not. */
  icon: string;
  title: string;
  guidance: string;
}

export type CategorySections = Record<EmailPhase, EmailSection>;
export type EmailSections = Record<AlertCategory, CategorySections>;

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

interface CategoryDefaults {
  icon: string;
  title: string;
  guidance: Record<EmailPhase, string>;
}

function samePhases(text: string): Record<EmailPhase, string> {
  return Object.fromEntries(EMAIL_PHASES.map((p) => [p, text])) as Record<
    EmailPhase,
    string
  >;
}

/**
 * Built-in wording. Like the thresholds, it should be aligned with company
 * ground-handling procedures before go-live.
 */
const DEFAULTS: Record<AlertCategory, CategoryDefaults> = {
  wind: {
    icon: '💨',
    title: 'Wind gust',
    guidance: {
      info: 'Breezy conditions. Keep covers, cones and other loose items secured.',
      watch:
        'Secure loose equipment, baggage carts and stairs. Take care with ' +
        'aircraft doors and cargo doors in gusts.',
      warning:
        'Secure or stow all loose equipment and stairs. Open aircraft and ' +
        'cargo doors only when it is safe, and keep clear of high-sided ' +
        'vehicles and containers.',
      standdown:
        'Stop ramp work and move to shelter. Do not operate stairs or high ' +
        'loaders, or open aircraft doors, until the stand-down is lifted.',
      cleared:
        'Winds have eased. Check stands and equipment for damage and debris ' +
        '(FOD) before resuming normal work.',
    },
  },
  thunderstorm: {
    icon: '⛈️',
    title: 'Thunderstorm',
    guidance: {
      info: 'Storms are possible nearby. Plan for ramp work to stop at short notice.',
      watch:
        'Be ready to stop ramp work when lightning is close, and know where ' +
        'your nearest shelter is.',
      warning:
        'Be ready to stop ramp work when lightning is close. Shelter indoors ' +
        'or in a vehicle, away from aircraft, fuel and refuelling equipment.',
      standdown:
        'Stop all ramp work and refuelling. Shelter indoors or in a vehicle ' +
        'until the all clear.',
      cleared:
        'The storm has passed. Check for debris and standing water before ' +
        'resuming ramp work.',
    },
  },
  visibility: {
    icon: '🌫️',
    title: 'Low visibility',
    guidance: {
      info: 'Visibility is reducing. Use lights and hi-vis airside.',
      watch:
        'Expect low-visibility procedures and delays. Use lights and hi-vis, ' +
        'and keep vehicle speeds down airside.',
      warning:
        'Low-visibility procedures are likely in force. Drive airside only ' +
        'when needed, slowly and with lights on.',
      standdown:
        'Stop non-essential airside driving and follow ATC and airport ' +
        'low-visibility instructions.',
      cleared: 'Visibility has improved. Normal airside operations can resume.',
    },
  },
  heat: {
    icon: '🌡️',
    title: 'Heat',
    guidance: {
      info: 'Warm conditions. Drink water regularly and wear a hat outdoors.',
      watch:
        'Drink water often, take breaks in the shade or air conditioning, and ' +
        'watch each other for signs of heat stress.',
      warning:
        'Rotate outdoor tasks, take extra breaks in shade or air ' +
        'conditioning and drink water often. Report signs of heat illness ' +
        'straight away.',
      standdown:
        'Keep outdoor work to essential tasks with short rotations. Get first ' +
        'aid at once for anyone confused, dizzy or no longer sweating.',
      cleared:
        'Temperatures have eased. Keep drinking water, and rest if you feel ' +
        'unwell.',
    },
  },
  uv: {
    icon: '☀️',
    title: 'UV exposure',
    guidance: {
      info: 'UV is moderate. Wear sunscreen and a hat when outdoors.',
      watch:
        'Wear a shirt, SPF50+ sunscreen, a broad-brim hat and sunglasses, ' +
        'and seek shade where you can.',
      warning:
        'Extreme UV. Cover up fully, reapply SPF50+ sunscreen every two hours ' +
        'and limit time in direct sun.',
      standdown:
        'Extreme UV. Avoid non-essential outdoor work, and cover up fully ' +
        'when outside.',
      cleared:
        'UV has dropped below alert levels. Sun protection is still wise.',
    },
  },
  cyclone: {
    icon: '🌀',
    title: 'Tropical cyclone',
    guidance: {
      info: 'Monitor BoM updates and review the airport cyclone plan.',
      watch:
        'Prepare to follow the airport cyclone plan. Secure loose equipment ' +
        'and check the latest BoM advice.',
      warning:
        'Follow the airport cyclone plan. Tie down or move aircraft and ' +
        'equipment, and check the latest BoM advice.',
      standdown:
        'Follow the cyclone plan and shelter as directed. Do not go airside ' +
        'until told it is safe.',
      cleared:
        'The cyclone threat has passed. Follow inspection and recovery ' +
        'instructions before resuming work.',
    },
  },
  data_stale: {
    icon: '⏱️',
    title: categoryLabel('data_stale'),
    guidance: {
      ...samePhases(
        'Weather alerts may be missed until fresh observations arrive. ' +
          'Check official sources directly.',
      ),
      cleared: 'Fresh weather observations are arriving again.',
    },
  },
};

/** The built-in section for a category at one phase. */
export function defaultSection(
  category: AlertCategory,
  phase: EmailPhase,
): EmailSection {
  const {icon, title, guidance} = DEFAULTS[category];
  return {category, phase, icon, title, guidance: guidance[phase]};
}

function defaultCategorySections(category: AlertCategory): CategorySections {
  return Object.fromEntries(
    EMAIL_PHASES.map((phase) => [phase, defaultSection(category, phase)]),
  ) as CategorySections;
}

/** Every category's built-in sections. */
export function defaultSections(): EmailSections {
  return Object.fromEntries(
    ALERT_CATEGORIES.map((c) => [c, defaultCategorySections(c)]),
  ) as EmailSections;
}

/** True for a known phase; false for anything else, such as a missing one. */
export function isEmailPhase(value: unknown): value is EmailPhase {
  return (EMAIL_PHASES as readonly unknown[]).includes(value);
}

/**
 * The built-in sections with any saved ones laid over them. A saved row
 * without a known phase (for example, read before the phase migration is
 * applied) is skipped, so that phase keeps its default.
 */
export function mergeSections(saved: readonly EmailSection[]): EmailSections {
  const sections = defaultSections();
  for (const section of saved) {
    if (isEmailPhase(section.phase))
      sections[section.category][section.phase] = section;
  }
  return sections;
}

/** A copy of `sections` with one section replaced. */
export function withSection(
  sections: EmailSections,
  section: EmailSection,
): EmailSections {
  const {category, phase} = section;
  return {...sections, [category]: {...sections[category], [phase]: section}};
}

/** True when two sections would produce the same email. */
export function sameSection(a: EmailSection, b: EmailSection): boolean {
  return (
    a.category === b.category &&
    a.phase === b.phase &&
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
