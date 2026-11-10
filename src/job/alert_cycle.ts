import type {AirportConfig} from '../domain/airports';
import {planAlertChange} from '../domain/alert_state';
import {parseAmocWarnings} from '../domain/bom_warnings';
import {evaluateConditions, unknownCategories} from '../domain/evaluate';
import {forecastHours, uvIndexAt, type MetNoResponse} from '../domain/met_no';
import {parseMetar, type AwcMetar} from '../domain/metar';
import {
  defaultSections,
  mergeSections,
  type EmailSections,
} from '../domain/email_sections';
import {composeEmail, groupsForEvent} from '../domain/notifications';
import {HOLD_MINUTES} from '../domain/thresholds';
import {minutesSince} from '../domain/time';
import {
  ALERT_CATEGORIES,
  type AirportCode,
  type AlertCategory,
  type AlertEvent,
  type AlertRecord,
  type BomWarning,
  type Condition,
  type Forecast,
  type ForecastHour,
  type MailGroup,
  type Observation,
} from '../domain/types';
import type {AlertStore, AwcTaf, Mailer, WeatherFeeds} from './ports';

/**
 * MET Norway's model updates about hourly and its terms ask clients not to
 * re-fetch unchanged data, so the stored forecast is reused for this long.
 */
export const MET_NO_REFRESH_MINUTES = 30;

export interface AlertCycleDeps {
  feeds: WeatherFeeds;
  store: AlertStore;
  mailer: Mailer;
  airports: readonly AirportConfig[];
  now: () => Date;
  log: (message: string) => void;
}

export interface CycleSummary {
  events: AlertEvent[];
  emailsSent: number;
  emailsFailed: number;
  /** Emails that were sent but whose audit row could not be written. */
  auditFailures: number;
  failedFeeds: string[];
}

/** Text of an unknown thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the rules found for one airport. */
interface Assessment {
  conditions: Condition[];
  /** Categories whose input is missing: their alerts are held as they are. */
  unknown: AlertCategory[];
}

class Cycle {
  private readonly failedFeeds: string[] = [];
  private readonly now: Date;
  private sent = 0;
  private failed = 0;
  private auditFailures = 0;

  constructor(private readonly deps: AlertCycleDeps) {
    this.now = deps.now();
  }

  async run(): Promise<CycleSummary> {
    const {feeds, airports, store} = this.deps;
    // Read the groups before any alert is written: if the database is
    // unreachable the run fails here, and the alert is raised (and emailed)
    // on the next run instead of being saved without its email.
    const groups = await store.mailGroups();
    const codes = airports.map((a) => a.code);
    const metars = await this.readFeed('aviationweather-metar', () =>
      feeds.fetchMetars(codes),
    );
    const tafs = await this.readFeed('aviationweather-taf', () =>
      feeds.fetchTafs(codes),
    );
    const warnings = await this.loadWarnings();
    const active = await store.activeAlerts();

    const events: AlertEvent[] = [];
    for (const airport of airports) {
      const assessment = await this.assess(airport, metars, tafs, warnings);
      events.push(
        ...(await this.applyAssessment(airport.code, assessment, active)),
      );
    }
    await this.notify(groups, events);
    await store.purgeOld(this.now);
    return {
      events,
      emailsSent: this.sent,
      emailsFailed: this.failed,
      auditFailures: this.auditFailures,
      failedFeeds: this.failedFeeds,
    };
  }

  /** Runs one feed call and records its health in the feed log. */
  private async readFeed<T extends {length: number} | MetNoResponse>(
    source: string,
    fetch: () => Promise<T>,
  ): Promise<T | null> {
    const runAt = this.deps.now().toISOString();
    try {
      const value = await fetch();
      const records =
        'length' in value ? value.length : value.properties.timeseries.length;
      await this.deps.store.recordFeed({
        source,
        runAt,
        ok: true,
        records,
        error: null,
      });
      return value;
    } catch (e) {
      const error = errorMessage(e);
      this.deps.log(`Feed ${source} failed: ${error}`);
      this.failedFeeds.push(source);
      await this.deps.store.recordFeed({
        source,
        runAt,
        ok: false,
        records: 0,
        error,
      });
      return null;
    }
  }

  private async loadWarnings(): Promise<BomWarning[]> {
    const docs = await this.readFeed('bom-warnings', () =>
      this.deps.feeds.fetchBomWarningDocuments(),
    );
    if (docs === null) return this.deps.store.currentWarnings(this.now);
    const byId = new Map<string, BomWarning>();
    for (const xml of docs) {
      for (const warning of this.parseWarnings(xml))
        byId.set(warning.id, warning);
    }
    const warnings = [...byId.values()];
    await this.deps.store.replaceWarnings(warnings);
    return warnings;
  }

  private parseWarnings(xml: string): BomWarning[] {
    try {
      return parseAmocWarnings(xml, this.deps.airports, this.now);
    } catch (e) {
      this.deps.log(`Skipped unreadable BoM document: ${errorMessage(e)}`);
      return [];
    }
  }

  private async assess(
    airport: AirportConfig,
    metars: AwcMetar[] | null,
    tafs: AwcTaf[] | null,
    warnings: readonly BomWarning[],
  ): Promise<Assessment> {
    const stored = await this.deps.store.forecast(airport.code);
    const fresh = await this.fetchHoursIfDue(airport, stored);
    const hours = fresh ?? stored?.hours ?? [];
    const observation = await this.observationFor(
      airport.code,
      metars,
      uvIndexAt(hours, this.now),
    );
    await this.saveForecast(airport.code, tafs, fresh);
    return {
      conditions: evaluateConditions({
        observation,
        warnings: warnings.filter((w) => w.airport === airport.code),
        now: this.now,
      }),
      unknown: unknownCategories(observation),
    };
  }

  /** New hourly forecast, or null when the stored one is recent enough. */
  private async fetchHoursIfDue(
    airport: AirportConfig,
    stored: Forecast | null,
  ): Promise<ForecastHour[] | null> {
    const fetchedAt = stored?.hoursFetchedAt ?? null;
    if (
      fetchedAt !== null &&
      minutesSince(fetchedAt, this.now) < MET_NO_REFRESH_MINUTES
    ) {
      return null;
    }
    const metNo = await this.readFeed(`met-no-${airport.code}`, () =>
      this.deps.feeds.fetchMetNo(airport),
    );
    return metNo === null ? null : forecastHours(metNo, this.now);
  }

  private async observationFor(
    code: AirportCode,
    metars: AwcMetar[] | null,
    uv: number | null,
  ): Promise<Observation | null> {
    const metar = metars?.find((m) => m.icaoId === code);
    if (metar === undefined) return this.deps.store.latestObservation(code);
    const observation = parseMetar(metar, code, uv);
    await this.deps.store.saveObservation(observation);
    return observation;
  }

  private async saveForecast(
    code: AirportCode,
    tafs: AwcTaf[] | null,
    freshHours: ForecastHour[] | null,
  ): Promise<void> {
    const taf = tafs?.find((t) => t.icaoId === code);
    if (taf === undefined && freshHours === null) return;
    await this.deps.store.saveForecast({
      airport: code,
      issuedAt: taf?.issueTime ?? this.now.toISOString(),
      rawTaf: taf?.rawTAF ?? null,
      hours: freshHours ?? [],
      hoursFetchedAt: freshHours === null ? null : this.now.toISOString(),
    });
  }

  private async applyAssessment(
    airport: AirportCode,
    {conditions, unknown}: Assessment,
    active: readonly AlertRecord[],
  ): Promise<AlertEvent[]> {
    const events: AlertEvent[] = [];
    for (const category of ALERT_CATEGORIES) {
      const existing = active.find(
        (a) => a.airport === airport && a.category === category,
      );
      const condition = conditions.find((c) => c.category === category);
      const change = planAlertChange(existing, condition, {
        airport,
        category,
        now: this.now,
        holdMinutes: HOLD_MINUTES,
        inputUnknown: unknown.includes(category),
      });
      if (change.kind === 'create') {
        const alert = await this.deps.store.createAlert(change.alert);
        events.push({kind: 'raised', alert});
      } else if (change.kind === 'update' && existing !== undefined) {
        await this.deps.store.updateAlert(change.id, change.patch);
        if (change.event !== null) {
          events.push({
            kind: change.event,
            alert: {...existing, ...change.patch},
          });
        }
      }
    }
    return events;
  }

  private async notify(
    groups: readonly MailGroup[],
    events: readonly AlertEvent[],
  ): Promise<void> {
    if (events.length === 0) return;
    const sections = await this.loadSections();
    for (const event of events) {
      for (const group of groupsForEvent(groups, event)) {
        await this.sendToGroup(event, group, sections);
      }
    }
  }

  /** Edited email sections; the built-in ones if they can't be read. */
  private async loadSections(): Promise<EmailSections> {
    try {
      return mergeSections(await this.deps.store.emailSections());
    } catch (e) {
      this.deps.log(
        `Email sections unreadable, using defaults: ${errorMessage(e)}`,
      );
      return defaultSections();
    }
  }

  /**
   * Sends one email to one group and writes the audit row either way. An
   * audit failure is logged and counted, but never stops the other emails.
   */
  private async sendToGroup(
    event: AlertEvent,
    group: MailGroup,
    sections: EmailSections,
  ) {
    const content = composeEmail(event, sections);
    const recipients = group.members.map((m) => m.email);
    let error: string | null = null;
    try {
      await this.deps.mailer.send({bcc: recipients, ...content});
      this.sent++;
    } catch (e) {
      error = errorMessage(e);
      this.failed++;
      this.deps.log(`Email to group "${group.name}" failed: ${error}`);
    }
    const {alert} = event;
    try {
      await this.deps.store.recordEmail({
        groupId: group.id,
        groupName: group.name,
        recipients,
        subject: content.subject,
        body: content.text,
        alertId: alert.id,
        airport: alert.airport,
        category: alert.category,
        level: event.kind === 'cleared' ? alert.peakLevel : alert.level,
        event: event.kind,
        status: error === null ? 'sent' : 'failed',
        error,
      });
    } catch (e) {
      this.auditFailures++;
      this.deps.log(
        `Audit write failed for "${content.subject}" to group ` +
          `"${group.name}": ${errorMessage(e)}`,
      );
    }
  }
}

/**
 * One scheduled run: fetch every feed, store the readings, evaluate the rules,
 * update alerts, email subscribed groups and audit every send. A failing feed
 * is logged and the run carries on with the last stored data; a missing
 * reading holds its alert rather than clearing it.
 */
export function runAlertCycle(deps: AlertCycleDeps): Promise<CycleSummary> {
  return new Cycle(deps).run();
}
