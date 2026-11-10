import type {SupabaseClient} from '@supabase/supabase-js';
import {
  emailSectionToRow,
  rowToAlert,
  rowToEmailSection,
  rowToEmailAudit,
  rowToFeedLog,
  rowToForecast,
  rowToMailGroup,
  rowToObservation,
  rowToWarning,
  type AlertRow,
  type EmailAuditRow,
  type EmailSectionRow,
  type FeedLogRow,
  type ForecastRow,
  type MailGroupRow,
  type ObservationRow,
  type WarningRow,
} from '../../db/rows';
import {AIRPORTS} from '../../domain/airports';
import {mergeSections} from '../../domain/email_sections';
import type {AirportCode} from '../../domain/types';
import {
  latestPerSource,
  SignInError,
  signInFailureFor,
  type AirportSnapshot,
  type AuthStep,
  type DataApi,
  type GroupPatch,
} from './api';

/** Returns `data` from a Supabase result, or throws its error message. */
export function unwrap<T>(result: {
  data: T;
  error: {message: string} | null;
}): NonNullable<T> {
  if (result.error !== null) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

/** Postgres error code for a unique index conflict. */
const UNIQUE_VIOLATION = '23505';

/** Edge function that dispatches the "Alert cycle" GitHub workflow. */
const REFRESH_FUNCTION = 'trigger-alert-cycle';

/**
 * The most useful message from a failed edge function call: the function's
 * own `{error}` body when it sent one, else the client's message.
 */
async function functionErrorMessage(error: {
  message: string;
  context?: unknown;
}): Promise<string> {
  if (error.context instanceof Response) {
    try {
      const body = (await error.context.json()) as {error?: unknown};
      if (typeof body.error === 'string') return body.error;
    } catch {
      // Not JSON: fall through to the client's message.
    }
  }
  return error.message;
}

function groupPatchToRow(patch: GroupPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.enabled !== undefined) row['enabled'] = patch.enabled;
  if (patch.airports !== undefined) row['airports'] = patch.airports;
  if (patch.categories !== undefined) row['categories'] = patch.categories;
  if (patch.minLevel !== undefined) row['min_level'] = patch.minLevel;
  return row;
}

/**
 * DataApi backed by Supabase with the publishable key. Row level security
 * restricts every read and write to the admin after MFA (aal2).
 */
export function createSupabaseApi(sb: SupabaseClient): DataApi {
  async function authStep(): Promise<AuthStep> {
    const {data} = await sb.auth.getSession();
    const session = data.session;
    if (session === null) return {kind: 'signed_out'};
    const aal = unwrap(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
    if (aal.currentLevel !== 'aal2') {
      const factors = unwrap(await sb.auth.mfa.listFactors());
      const verified = factors.totp.find((f) => f.status === 'verified');
      return verified === undefined
        ? {kind: 'enrol_mfa'}
        : {kind: 'verify_mfa', factorId: verified.id};
    }
    const email = session.user.email ?? '';
    const isAdmin = unwrap(await sb.rpc('is_admin')) as boolean;
    return isAdmin ? {kind: 'signed_in', email} : {kind: 'not_admin', email};
  }

  async function latestObservation(code: AirportCode) {
    const rows = unwrap(
      await sb
        .from('observations')
        .select('*')
        .eq('airport', code)
        .order('observed_at', {ascending: false})
        .limit(1),
    ) as ObservationRow[];
    return rows[0] === undefined ? null : rowToObservation(rows[0]);
  }

  return {
    authStep,

    onAuthChange(listener) {
      const {data} = sb.auth.onAuthStateChange(() => listener());
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const {error} = await sb.auth.signInWithPassword({email, password});
      if (error !== null) {
        throw new SignInError(
          signInFailureFor(error.code, error.status),
          error.message,
        );
      }
    },

    async signOut() {
      unwrap({data: null, ...(await sb.auth.signOut())});
    },

    async enrolMfa() {
      // Drop any half-finished enrolment before starting a new one.
      const factors = unwrap(await sb.auth.mfa.listFactors());
      for (const factor of factors.all.filter(
        (f) => f.status === 'unverified',
      )) {
        unwrap(await sb.auth.mfa.unenroll({factorId: factor.id}));
      }
      const data = unwrap(
        await sb.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Admin authenticator',
        }),
      );
      return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      };
    },

    async verifyMfa(factorId, code) {
      unwrap(await sb.auth.mfa.challengeAndVerify({factorId, code}));
    },

    async loadDashboard() {
      const now = new Date().toISOString();
      const [forecastRows, alertRows, warningRows, feedRows, observations] =
        await Promise.all([
          sb.from('forecasts').select('*'),
          sb.from('alerts').select('*').eq('status', 'active'),
          sb
            .from('warnings')
            .select('*')
            .or(`expires_at.is.null,expires_at.gt.${now}`),
          sb
            .from('feed_log')
            .select('*')
            .order('run_at', {ascending: false})
            .limit(100),
          Promise.all(AIRPORTS.map((a) => latestObservation(a.code))),
        ]);
      const forecasts = (unwrap(forecastRows) as ForecastRow[]).map(
        rowToForecast,
      );
      const alerts = (unwrap(alertRows) as AlertRow[]).map(rowToAlert);
      const warnings = (unwrap(warningRows) as WarningRow[]).map(rowToWarning);
      const airports: AirportSnapshot[] = AIRPORTS.map((a, i) => ({
        code: a.code,
        observation: observations[i] ?? null,
        forecast: forecasts.find((f) => f.airport === a.code) ?? null,
        alerts: alerts.filter((x) => x.airport === a.code),
        warnings: warnings.filter((w) => w.airport === a.code),
      }));
      const feeds = latestPerSource(
        (unwrap(feedRows) as FeedLogRow[]).map(rowToFeedLog),
      );
      return {airports, feeds};
    },

    async loadAlertHistory(limit) {
      const rows = unwrap(
        await sb
          .from('alerts')
          .select('*')
          .order('started_at', {ascending: false})
          .limit(limit),
      ) as AlertRow[];
      return rows.map(rowToAlert);
    },

    async refreshFeeds() {
      const {error} = await sb.functions.invoke(REFRESH_FUNCTION, {
        method: 'POST',
      });
      if (error !== null) throw new Error(await functionErrorMessage(error));
    },

    async listGroups() {
      const rows = unwrap(
        await sb
          .from('mail_groups')
          .select('*, group_members(id, email)')
          .order('name'),
      ) as MailGroupRow[];
      return rows.map(rowToMailGroup);
    },

    async createGroup(name) {
      unwrap(await sb.from('mail_groups').insert({name: name.trim()}));
    },

    async updateGroup(id, patch) {
      unwrap(
        await sb
          .from('mail_groups')
          .update(groupPatchToRow(patch))
          .eq('id', id),
      );
    },

    async deleteGroup(id) {
      unwrap(await sb.from('mail_groups').delete().eq('id', id));
    },

    async addMember(groupId, email) {
      unwrap(
        await sb
          .from('group_members')
          .insert({group_id: groupId, email: email.trim().toLowerCase()}),
      );
    },

    async removeMember(memberId) {
      unwrap(await sb.from('group_members').delete().eq('id', memberId));
    },

    async loadAudit({status, page, pageSize}) {
      const from = page * pageSize;
      let query = sb
        .from('email_audit')
        .select('*', {count: 'exact'})
        .order('sent_at', {ascending: false})
        .range(from, from + pageSize - 1);
      if (status !== 'all') query = query.eq('status', status);
      const result = await query;
      const rows = unwrap(result) as EmailAuditRow[];
      return {
        rows: rows.map(rowToEmailAudit),
        total: result.count ?? rows.length,
      };
    },

    async resendEmail(auditId) {
      const {error} = await sb
        .from('email_resend_requests')
        .insert({audit_id: auditId});
      if (error?.code === UNIQUE_VIOLATION) {
        throw new Error('A resend of this email is already queued.');
      }
      unwrap({data: null, error});
    },

    async loadEmailSections() {
      const rows = unwrap(
        await sb.from('email_sections').select('*'),
      ) as EmailSectionRow[];
      return mergeSections(rows.map(rowToEmailSection));
    },

    async saveEmailSection(section) {
      unwrap(
        await sb.from('email_sections').upsert({
          ...emailSectionToRow(section),
          updated_at: new Date().toISOString(),
        }),
      );
    },

    async resetEmailSection(category) {
      unwrap(await sb.from('email_sections').delete().eq('category', category));
    },
  };
}
