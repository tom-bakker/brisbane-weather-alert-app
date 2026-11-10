import type {NewAlert} from '../domain/alert_state';
import type {EmailSection} from '../domain/email_sections';
import type {CategoryThresholds} from '../domain/thresholds';
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
import type {AlertStore, NewEmailAudit} from './ports';

/**
 * An AlertStore kept in memory. Used by tests and by `--dry-run`, which
 * exercises the real feeds without touching the database or sending mail.
 */
export class MemoryStore implements AlertStore {
  observations: Observation[] = [];
  forecasts = new Map<AirportCode, Forecast>();
  warnings: BomWarning[] = [];
  alerts: AlertRecord[] = [];
  groups: MailGroup[] = [];
  sections: EmailSection[] = [];
  thresholds: CategoryThresholds[] = [];
  emails: EmailAuditEntry[] = [];
  /** Audit ids the admin asked to resend. */
  resendQueue: number[] = [];
  feeds: FeedLogEntry[] = [];
  purgedAt: Date | null = null;
  private nextId = 1;

  async saveObservation(observation: Observation): Promise<void> {
    this.observations = this.observations.filter(
      (o) =>
        o.airport !== observation.airport ||
        o.observedAt !== observation.observedAt,
    );
    this.observations.push(observation);
  }

  async latestObservation(airport: AirportCode): Promise<Observation | null> {
    const mine = this.observations.filter((o) => o.airport === airport);
    mine.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    return mine[0] ?? null;
  }

  async forecast(airport: AirportCode): Promise<Forecast | null> {
    return this.forecasts.get(airport) ?? null;
  }

  async saveForecast(forecast: Forecast): Promise<void> {
    const old = this.forecasts.get(forecast.airport);
    this.forecasts.set(forecast.airport, {
      ...forecast,
      rawTaf: forecast.rawTaf ?? old?.rawTaf ?? null,
      hours: forecast.hours.length > 0 ? forecast.hours : (old?.hours ?? []),
      hoursFetchedAt: forecast.hoursFetchedAt ?? old?.hoursFetchedAt ?? null,
    });
  }

  async replaceWarnings(warnings: readonly BomWarning[]): Promise<void> {
    this.warnings = [...warnings];
  }

  async currentWarnings(now: Date): Promise<BomWarning[]> {
    return this.warnings.filter(
      (w) => w.expiresAt === null || new Date(w.expiresAt) > now,
    );
  }

  async activeAlerts(): Promise<AlertRecord[]> {
    return this.alerts.filter((a) => a.status === 'active');
  }

  async createAlert(alert: NewAlert): Promise<AlertRecord> {
    const record = {...alert, id: `alert-${this.nextId++}`};
    this.alerts.push(record);
    return record;
  }

  async updateAlert(id: string, patch: Partial<AlertRecord>): Promise<void> {
    this.alerts = this.alerts.map((a) => (a.id === id ? {...a, ...patch} : a));
  }

  async mailGroups(): Promise<MailGroup[]> {
    return this.groups;
  }

  async emailSections(): Promise<EmailSection[]> {
    return this.sections;
  }

  async alertThresholds(): Promise<CategoryThresholds[]> {
    return this.thresholds;
  }

  async recordEmail(entry: NewEmailAudit): Promise<void> {
    this.emails.push({
      ...entry,
      id: this.nextId++,
      sentAt: new Date().toISOString(),
    });
  }

  async claimResends(_now: Date): Promise<EmailAuditEntry[]> {
    const ids = new Set(this.resendQueue);
    this.resendQueue = [];
    return this.emails.filter((e) => ids.has(e.id));
  }

  async recordFeed(entry: FeedLogEntry): Promise<void> {
    this.feeds.push(entry);
  }

  async purgeOld(now: Date): Promise<void> {
    this.purgedAt = now;
  }
}
