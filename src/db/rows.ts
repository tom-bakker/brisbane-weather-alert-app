/**
 * Mapping between Supabase (snake_case) rows and domain types. Shared by the
 * scheduled job and the web app so both read the database the same way.
 */
import type {EmailPhase, EmailSection} from '../domain/email_sections';
import type {CategoryThresholds, ThresholdCategory} from '../domain/thresholds';
import type {
  AirportCode,
  AlertCategory,
  AlertEventKind,
  AlertLevel,
  AlertRecord,
  BomWarning,
  EmailAuditEntry,
  FeedLogEntry,
  Forecast,
  ForecastHour,
  MailGroup,
  Observation,
} from '../domain/types';
import type {
  AppUser,
  UserAuditAction,
  UserAuditEntry,
  UserRole,
} from '../domain/users';

export interface ObservationRow {
  airport: string;
  observed_at: string;
  raw_metar: string;
  wind_dir_deg: number | null;
  wind_kt: number;
  gust_kt: number | null;
  /** Optional until the gust_observed_at migration is run. */
  gust_observed_at?: string | null;
  visibility_m: number | null;
  weather_codes: string;
  cloud: string;
  temp_c: number | null;
  dewpoint_c: number | null;
  qnh_hpa: number | null;
  apparent_temp_c: number | null;
  uv_index: number | null;
}

export interface ForecastRow {
  airport: string;
  issued_at: string;
  raw_taf: string | null;
  hours: ForecastHour[];
  hours_fetched_at: string | null;
}

export interface WarningRow {
  id: string;
  airport: string;
  kind: string;
  level: string;
  headline: string;
  issued_at: string;
  expires_at: string | null;
}

export interface AlertRow {
  id: string;
  airport: string;
  category: string;
  level: string;
  peak_level: string;
  status: string;
  trigger_value: string;
  message: string;
  started_at: string;
  updated_at: string;
  cleared_at: string | null;
  below_since: string | null;
}

export interface MailGroupRow {
  id: string;
  name: string;
  enabled: boolean;
  airports: string[];
  categories: string[];
  min_level: string;
  group_members?: {id: string; email: string}[];
}

export interface EmailAuditRow {
  id: number;
  sent_at: string;
  group_id: string | null;
  group_name: string;
  recipients: string[];
  subject: string;
  body: string;
  alert_id: string | null;
  airport: string | null;
  category: string | null;
  level: string | null;
  event: string;
  status: string;
  error: string | null;
  resend_of: number | null;
}

export interface FeedLogRow {
  source: string;
  run_at: string;
  ok: boolean;
  records: number;
  error: string | null;
}

/** Postgres numeric columns can arrive as strings. */
function num(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

export function observationToRow(o: Observation): ObservationRow {
  return {
    airport: o.airport,
    observed_at: o.observedAt,
    raw_metar: o.rawMetar,
    wind_dir_deg: o.windDirDeg,
    wind_kt: o.windKt,
    gust_kt: o.gustKt,
    gust_observed_at: o.gustObservedAt,
    visibility_m: o.visibilityM,
    weather_codes: o.weatherCodes,
    cloud: o.cloud,
    temp_c: o.tempC,
    dewpoint_c: o.dewpointC,
    qnh_hpa: o.qnhHpa,
    apparent_temp_c: o.apparentTempC,
    uv_index: o.uvIndex,
  };
}

export function rowToObservation(r: ObservationRow): Observation {
  return {
    airport: r.airport as AirportCode,
    observedAt: new Date(r.observed_at).toISOString(),
    rawMetar: r.raw_metar,
    windDirDeg: r.wind_dir_deg,
    windKt: r.wind_kt,
    gustKt: r.gust_kt,
    // Absent on databases that predate the gust_observed_at migration.
    gustObservedAt:
      r.gust_observed_at == null
        ? null
        : new Date(r.gust_observed_at).toISOString(),
    visibilityM: r.visibility_m,
    weatherCodes: r.weather_codes,
    cloud: r.cloud,
    tempC: num(r.temp_c),
    dewpointC: num(r.dewpoint_c),
    qnhHpa: num(r.qnh_hpa),
    apparentTempC: num(r.apparent_temp_c),
    uvIndex: num(r.uv_index),
  };
}

export function rowToForecast(r: ForecastRow): Forecast {
  return {
    airport: r.airport as AirportCode,
    issuedAt: r.issued_at,
    rawTaf: r.raw_taf,
    hours: r.hours,
    hoursFetchedAt: r.hours_fetched_at,
  };
}

export function warningToRow(w: BomWarning): WarningRow {
  return {
    id: w.id,
    airport: w.airport,
    kind: w.kind,
    level: w.level,
    headline: w.headline,
    issued_at: w.issuedAt,
    expires_at: w.expiresAt,
  };
}

export function rowToWarning(r: WarningRow): BomWarning {
  return {
    id: r.id,
    airport: r.airport as AirportCode,
    kind: r.kind as BomWarning['kind'],
    level: r.level as AlertLevel,
    headline: r.headline,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
  };
}

export function rowToAlert(r: AlertRow): AlertRecord {
  return {
    id: r.id,
    airport: r.airport as AirportCode,
    category: r.category as AlertCategory,
    level: r.level as AlertLevel,
    peakLevel: r.peak_level as AlertLevel,
    status: r.status as AlertRecord['status'],
    triggerValue: r.trigger_value,
    message: r.message,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    clearedAt: r.cleared_at,
    belowSince: r.below_since,
  };
}

const ALERT_COLUMNS: Record<keyof Omit<AlertRecord, 'id'>, keyof AlertRow> = {
  airport: 'airport',
  category: 'category',
  level: 'level',
  peakLevel: 'peak_level',
  status: 'status',
  triggerValue: 'trigger_value',
  message: 'message',
  startedAt: 'started_at',
  updatedAt: 'updated_at',
  clearedAt: 'cleared_at',
  belowSince: 'below_since',
};

/** Converts a (partial) alert to row columns, skipping undefined fields. */
export function alertToRow(alert: Partial<AlertRecord>): Partial<AlertRow> {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(ALERT_COLUMNS)) {
    const value = alert[key as keyof AlertRecord];
    if (value !== undefined) row[column] = value;
  }
  return row as Partial<AlertRow>;
}

export function rowToMailGroup(r: MailGroupRow): MailGroup {
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    airports: r.airports as AirportCode[],
    categories: r.categories as AlertCategory[],
    minLevel: r.min_level as AlertLevel,
    members: [...(r.group_members ?? [])].sort((a, b) =>
      a.email.localeCompare(b.email),
    ),
  };
}

export function rowToEmailAudit(r: EmailAuditRow): EmailAuditEntry {
  return {
    id: r.id,
    sentAt: r.sent_at,
    groupId: r.group_id,
    groupName: r.group_name,
    recipients: r.recipients,
    subject: r.subject,
    body: r.body,
    alertId: r.alert_id,
    airport: r.airport as AirportCode | null,
    category: r.category as AlertCategory | null,
    level: r.level as AlertLevel | null,
    event: r.event as AlertEventKind,
    status: r.status as EmailAuditEntry['status'],
    error: r.error,
    resendOf: r.resend_of,
  };
}

export function rowToFeedLog(r: FeedLogRow): FeedLogEntry {
  return {
    source: r.source,
    runAt: r.run_at,
    ok: r.ok,
    records: r.records,
    error: r.error,
  };
}

export interface EmailSectionRow {
  category: string;
  phase: string;
  icon: string;
  title: string;
  guidance: string;
}

export function rowToEmailSection(r: EmailSectionRow): EmailSection {
  return {
    category: r.category as AlertCategory,
    phase: r.phase as EmailPhase,
    icon: r.icon,
    title: r.title,
    guidance: r.guidance,
  };
}

export function emailSectionToRow(s: EmailSection): EmailSectionRow {
  return {
    category: s.category,
    phase: s.phase,
    icon: s.icon,
    title: s.title.trim(),
    guidance: s.guidance.trim(),
  };
}

/** Postgres numeric may arrive as a string; null means the level is off. */
type LimitColumn = number | string | null;

export interface AlertThresholdRow {
  category: string;
  info: LimitColumn;
  watch: LimitColumn;
  warning: LimitColumn;
  standdown: LimitColumn;
}

function toLimit(value: LimitColumn): number | null {
  return value === null ? null : Number(value);
}

export function rowToThresholds(r: AlertThresholdRow): CategoryThresholds {
  return {
    category: r.category as ThresholdCategory,
    limits: {
      info: toLimit(r.info),
      watch: toLimit(r.watch),
      warning: toLimit(r.warning),
      standdown: toLimit(r.standdown),
    },
  };
}

export function thresholdsToRow({
  category,
  limits,
}: CategoryThresholds): AlertThresholdRow {
  return {category, ...limits};
}

export interface AppUserRow {
  user_id: string;
  email: string;
  role: string;
  invited_at: string;
  email_confirmed: boolean;
  mfa_enrolled: boolean;
  last_sign_in_at: string | null;
}

export function rowToAppUser(row: AppUserRow): AppUser {
  return {
    id: row.user_id,
    email: row.email,
    role: row.role as UserRole,
    invitedAt: row.invited_at,
    emailConfirmed: row.email_confirmed,
    mfaEnrolled: row.mfa_enrolled,
    lastSignInAt: row.last_sign_in_at,
  };
}

export interface UserAuditRow {
  id: number;
  occurred_at: string;
  action: string;
  actor_email: string | null;
  target_email: string;
  detail: string | null;
}

export function rowToUserAudit(row: UserAuditRow): UserAuditEntry {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    action: row.action as UserAuditAction,
    actorEmail: row.actor_email,
    targetEmail: row.target_email,
    detail: row.detail,
  };
}
