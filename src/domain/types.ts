/** Shared domain types for the weather alert system. */

/** ICAO code of a configured airport. */
export type AirportCode = 'YBBN' | 'YBCS';

/** Severity levels, lowest first. Order matters: see levels.ts. */
export const ALERT_LEVELS = ['info', 'watch', 'warning', 'standdown'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

/** Things a mail group can choose to be alerted about. */
export const ALERT_CATEGORIES = [
  'wind',
  'thunderstorm',
  'visibility',
  'heat',
  'uv',
  'cyclone',
  'data_stale',
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

/** A decoded observation (official METAR plus derived values). */
export interface Observation {
  airport: AirportCode;
  /** ISO 8601 UTC. */
  observedAt: string;
  rawMetar: string;
  /** Null when the wind is variable or calm. */
  windDirDeg: number | null;
  windKt: number;
  gustKt: number | null;
  visibilityM: number | null;
  /** Present weather codes such as "-SHRA" or "TSRA". */
  weatherCodes: string;
  /** Cloud groups such as "FEW020 BKN030". */
  cloud: string;
  tempC: number | null;
  dewpointC: number | null;
  qnhHpa: number | null;
  apparentTempC: number | null;
  /** Clear-sky UV index for the current hour (forecast model). */
  uvIndex: number | null;
}

/** One hour of model forecast. */
export interface ForecastHour {
  time: string;
  tempC: number | null;
  windKt: number | null;
  windDirDeg: number | null;
  precipMm: number | null;
  uvIndex: number | null;
  symbol: string;
}

/** The latest forecast for one airport. */
export interface Forecast {
  airport: AirportCode;
  issuedAt: string;
  rawTaf: string | null;
  hours: ForecastHour[];
  /** When the hourly model forecast was last fetched (ISO UTC). */
  hoursFetchedAt: string | null;
}

/** A BoM warning that applies to an airport's area. */
export interface BomWarning {
  id: string;
  airport: AirportCode;
  kind: 'thunderstorm' | 'cyclone';
  level: AlertLevel;
  headline: string;
  issuedAt: string;
  expiresAt: string | null;
}

/** A condition found by rule evaluation, before any state is applied. */
export interface Condition {
  category: AlertCategory;
  level: AlertLevel;
  /** Human-readable trigger value, for example "38 kt". */
  value: string;
  message: string;
}

/** An alert row as stored. */
export interface AlertRecord {
  id: string;
  airport: AirportCode;
  category: AlertCategory;
  level: AlertLevel;
  peakLevel: AlertLevel;
  status: 'active' | 'cleared';
  triggerValue: string;
  message: string;
  startedAt: string;
  updatedAt: string;
  clearedAt: string | null;
  /** When conditions first dropped below this alert's level. */
  belowSince: string | null;
}

/** One email address in a mail group. */
export interface GroupMember {
  id: string;
  email: string;
}

/** A mailing list with its alert subscriptions. */
export interface MailGroup {
  id: string;
  name: string;
  enabled: boolean;
  airports: AirportCode[];
  categories: AlertCategory[];
  /** Lowest level that triggers an email for this group. */
  minLevel: AlertLevel;
  members: GroupMember[];
}

/** What happened to an alert, from the recipients' point of view. */
export type AlertEventKind = 'raised' | 'escalated' | 'cleared';

/** An alert change that should be emailed. */
export interface AlertEvent {
  kind: AlertEventKind;
  alert: AlertRecord;
}

/** One audited email send. */
export interface EmailAuditEntry {
  id: number;
  sentAt: string;
  groupId: string | null;
  groupName: string;
  recipients: string[];
  subject: string;
  body: string;
  alertId: string | null;
  airport: AirportCode | null;
  category: AlertCategory | null;
  level: AlertLevel | null;
  event: AlertEventKind;
  status: 'sent' | 'failed';
  error: string | null;
  /** For a resent copy, the id of the first email it repeats. */
  resendOf: number | null;
}

/** An email audit row before the store stamps it. */
export type NewEmailAudit = Omit<EmailAuditEntry, 'id' | 'sentAt'>;

/** One outgoing message. Recipients go in Bcc so they can't see each other. */
export interface OutgoingEmail {
  bcc: string[];
  subject: string;
  text: string;
  html: string;
}

/** One run of one data feed. */
export interface FeedLogEntry {
  source: string;
  runAt: string;
  ok: boolean;
  records: number;
  error: string | null;
}
