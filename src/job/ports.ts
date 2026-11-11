import type {AirportConfig} from '../domain/airports';
import type {NewAlert} from '../domain/alert_state';
import type {MetNoResponse} from '../domain/met_no';
import type {EmailSection} from '../domain/email_sections';
import type {CategoryThresholds} from '../domain/thresholds';
import type {AwcMetar} from '../domain/metar';
import type {
  AirportCode,
  AlertRecord,
  BomWarning,
  EmailAuditEntry,
  FeedLogEntry,
  Forecast,
  MailGroup,
  NewEmailAudit,
  Observation,
  OutgoingEmail,
} from '../domain/types';

/** The subset of an aviationweather.gov TAF JSON record that we read. */
export interface AwcTaf {
  icaoId: string;
  rawTAF: string;
  issueTime: string;
}

/** Outbound calls to the free weather sources. */
export interface WeatherFeeds {
  fetchMetars(codes: readonly AirportCode[]): Promise<AwcMetar[]>;
  fetchTafs(codes: readonly AirportCode[]): Promise<AwcTaf[]>;
  fetchMetNo(airport: AirportConfig): Promise<MetNoResponse>;
  /** Raw BoM AMOC XML documents for Queensland warnings. */
  fetchBomWarningDocuments(): Promise<string[]>;
  /** Raw BoM XML of the latest Queensland weather station readings. */
  fetchBomObservationDocument(): Promise<string>;
}

export type {NewEmailAudit, OutgoingEmail} from '../domain/types';

/** Persistence used by the alert cycle. */
export interface AlertStore {
  saveObservation(observation: Observation): Promise<void>;
  latestObservation(airport: AirportCode): Promise<Observation | null>;
  forecast(airport: AirportCode): Promise<Forecast | null>;
  /** Upserts; a null TAF, or empty hours, keeps the stored value. */
  saveForecast(forecast: Forecast): Promise<void>;
  replaceWarnings(warnings: readonly BomWarning[]): Promise<void>;
  currentWarnings(now: Date): Promise<BomWarning[]>;
  activeAlerts(): Promise<AlertRecord[]>;
  createAlert(alert: NewAlert): Promise<AlertRecord>;
  updateAlert(id: string, patch: Partial<AlertRecord>): Promise<void>;
  mailGroups(): Promise<MailGroup[]>;
  /** Admin-edited email sections; phases without a row use defaults. */
  emailSections(): Promise<EmailSection[]>;
  /** Admin-edited thresholds; categories without a row use defaults. */
  alertThresholds(): Promise<CategoryThresholds[]>;
  recordEmail(entry: NewEmailAudit): Promise<void>;
  /**
   * Marks every queued resend as processed and returns the audited emails
   * to resend. A request is claimed by one run only.
   */
  claimResends(now: Date): Promise<EmailAuditEntry[]>;
  recordFeed(entry: FeedLogEntry): Promise<void>;
  /** Applies the retention rules (30 days of data, 12 months of audit). */
  purgeOld(now: Date): Promise<void>;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}
