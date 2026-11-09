import type {AirportConfig} from '../domain/airports';
import type {NewAlert} from '../domain/alert_state';
import type {MetNoResponse} from '../domain/met_no';
import type {AwcMetar} from '../domain/metar';
import type {
  AirportCode,
  AlertRecord,
  BomWarning,
  EmailAuditEntry,
  FeedLogEntry,
  Forecast,
  MailGroup,
  Observation,
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
}

/** An email audit row before the store stamps it. */
export type NewEmailAudit = Omit<EmailAuditEntry, 'id' | 'sentAt'>;

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
  recordEmail(entry: NewEmailAudit): Promise<void>;
  recordFeed(entry: FeedLogEntry): Promise<void>;
  /** Applies the retention rules (30 days of data, 12 months of audit). */
  purgeOld(now: Date): Promise<void>;
}

/** One outgoing message. Recipients go in Bcc so they can't see each other. */
export interface OutgoingEmail {
  bcc: string[];
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}
