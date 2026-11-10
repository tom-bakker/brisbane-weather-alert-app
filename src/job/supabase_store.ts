import type {SupabaseClient} from '@supabase/supabase-js';
import {
  alertToRow,
  observationToRow,
  rowToAlert,
  rowToEmailAudit,
  rowToEmailSection,
  rowToForecast,
  rowToMailGroup,
  rowToObservation,
  rowToThresholds,
  rowToWarning,
  warningToRow,
  type AlertRow,
  type AlertThresholdRow,
  type EmailAuditRow,
  type EmailSectionRow,
  type ForecastRow,
  type MailGroupRow,
  type ObservationRow,
  type WarningRow,
} from '../db/rows';
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

const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_RETENTION_DAYS = 30;
const AUDIT_RETENTION_DAYS = 366;

interface Result<T> {
  data: T | null;
  error: {message: string} | null;
}

/** Unwraps a Supabase result, turning an error into an exception. */
export function unwrap<T>(result: Result<T>, what: string): T {
  if (result.error !== null) {
    throw new Error(`Database ${what} failed: ${result.error.message}`);
  }
  return result.data as T;
}

function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/** AlertStore on Supabase, used by the job with the secret (service) key. */
export class SupabaseStore implements AlertStore {
  constructor(private readonly db: SupabaseClient) {}

  async saveObservation(observation: Observation): Promise<void> {
    unwrap(
      await this.db.from('observations').upsert(observationToRow(observation), {
        onConflict: 'airport,observed_at',
      }),
      'save observation',
    );
  }

  async latestObservation(airport: AirportCode): Promise<Observation | null> {
    const rows = unwrap(
      await this.db
        .from('observations')
        .select('*')
        .eq('airport', airport)
        .order('observed_at', {ascending: false})
        .limit(1),
      'read observation',
    ) as ObservationRow[];
    const row = rows[0];
    return row === undefined ? null : rowToObservation(row);
  }

  async forecast(airport: AirportCode): Promise<Forecast | null> {
    const rows = unwrap(
      await this.db.from('forecasts').select('*').eq('airport', airport),
      'read forecast',
    ) as ForecastRow[];
    return rows[0] === undefined ? null : rowToForecast(rows[0]);
  }

  async saveForecast(forecast: Forecast): Promise<void> {
    const row: Record<string, unknown> = {
      airport: forecast.airport,
      issued_at: forecast.issuedAt,
      updated_at: new Date().toISOString(),
    };
    // Omitted columns keep their stored value on upsert.
    if (forecast.rawTaf !== null) row['raw_taf'] = forecast.rawTaf;
    if (forecast.hours.length > 0) row['hours'] = forecast.hours;
    if (forecast.hoursFetchedAt !== null) {
      row['hours_fetched_at'] = forecast.hoursFetchedAt;
    }
    unwrap(await this.db.from('forecasts').upsert(row), 'save forecast');
  }

  async replaceWarnings(warnings: readonly BomWarning[]): Promise<void> {
    const ids = warnings.map((w) => w.id);
    if (warnings.length > 0) {
      unwrap(
        await this.db.from('warnings').upsert(warnings.map(warningToRow)),
        'save warnings',
      );
    }
    const stale = this.db.from('warnings').delete();
    unwrap(
      await (ids.length > 0
        ? stale.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`)
        : stale.neq('id', '')),
      'remove old warnings',
    );
  }

  async currentWarnings(now: Date): Promise<BomWarning[]> {
    const rows = unwrap(
      await this.db
        .from('warnings')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`),
      'read warnings',
    ) as WarningRow[];
    return rows.map(rowToWarning);
  }

  async activeAlerts(): Promise<AlertRecord[]> {
    const rows = unwrap(
      await this.db.from('alerts').select('*').eq('status', 'active'),
      'read alerts',
    ) as AlertRow[];
    return rows.map(rowToAlert);
  }

  async createAlert(alert: NewAlert): Promise<AlertRecord> {
    const row = unwrap(
      await this.db.from('alerts').insert(alertToRow(alert)).select().single(),
      'create alert',
    ) as AlertRow;
    return rowToAlert(row);
  }

  async updateAlert(id: string, patch: Partial<AlertRecord>): Promise<void> {
    unwrap(
      await this.db.from('alerts').update(alertToRow(patch)).eq('id', id),
      'update alert',
    );
  }

  async mailGroups(): Promise<MailGroup[]> {
    const rows = unwrap(
      await this.db.from('mail_groups').select('*, group_members(id, email)'),
      'read mail groups',
    ) as MailGroupRow[];
    return rows.map(rowToMailGroup);
  }

  async emailSections(): Promise<EmailSection[]> {
    const rows = unwrap(
      await this.db.from('email_sections').select('*'),
      'read email sections',
    ) as EmailSectionRow[];
    return rows.map(rowToEmailSection);
  }

  async alertThresholds(): Promise<CategoryThresholds[]> {
    const rows = unwrap(
      await this.db.from('alert_thresholds').select('*'),
      'read alert thresholds',
    ) as AlertThresholdRow[];
    return rows.map(rowToThresholds);
  }

  async recordEmail(entry: NewEmailAudit): Promise<void> {
    unwrap(
      await this.db.from('email_audit').insert({
        group_id: entry.groupId,
        group_name: entry.groupName,
        recipients: entry.recipients,
        subject: entry.subject,
        body: entry.body,
        alert_id: entry.alertId,
        airport: entry.airport,
        category: entry.category,
        level: entry.level,
        event: entry.event,
        status: entry.status,
        error: entry.error,
        resend_of: entry.resendOf,
      }),
      'record email',
    );
  }

  async claimResends(now: Date): Promise<EmailAuditEntry[]> {
    // One statement claims the requests and returns their emails, so no
    // request is marked processed without its email in hand. Claiming only
    // unprocessed rows makes overlapping runs send one copy.
    const claimed = unwrap(
      await this.db
        .from('email_resend_requests')
        .update({processed_at: now.toISOString()})
        .is('processed_at', null)
        .select('email_audit(*)'),
      'claim resends',
    ) as {email_audit: EmailAuditRow | null}[];
    return claimed.flatMap((r) =>
      r.email_audit === null ? [] : [rowToEmailAudit(r.email_audit)],
    );
  }

  async recordFeed(entry: FeedLogEntry): Promise<void> {
    unwrap(
      await this.db.from('feed_log').insert({
        source: entry.source,
        run_at: entry.runAt,
        ok: entry.ok,
        records: entry.records,
        error: entry.error,
      }),
      'record feed',
    );
  }

  async purgeOld(now: Date): Promise<void> {
    const dataCutoff = daysBefore(now, DATA_RETENTION_DAYS);
    const auditCutoff = daysBefore(now, AUDIT_RETENTION_DAYS);
    unwrap(
      await this.db.from('observations').delete().lt('observed_at', dataCutoff),
      'purge observations',
    );
    unwrap(
      await this.db.from('feed_log').delete().lt('run_at', dataCutoff),
      'purge feed log',
    );
    unwrap(
      await this.db.from('email_audit').delete().lt('sent_at', auditCutoff),
      'purge email audit',
    );
    unwrap(
      await this.db
        .from('alerts')
        .delete()
        .eq('status', 'cleared')
        .lt('started_at', auditCutoff),
      'purge alerts',
    );
  }
}
