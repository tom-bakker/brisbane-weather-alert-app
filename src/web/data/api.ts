import type {
  AirportCode,
  AlertCategory,
  AlertLevel,
  AlertRecord,
  BomWarning,
  EmailAuditEntry,
  FeedLogEntry,
  Forecast,
  MailGroup,
  Observation,
} from '../../domain/types';

/** Where the admin is in the sign-in flow. */
export type AuthStep =
  | {kind: 'signed_out'}
  | {kind: 'enrol_mfa'}
  | {kind: 'verify_mfa'; factorId: string}
  | {kind: 'not_admin'; email: string}
  | {kind: 'signed_in'; email: string};

/** A new authenticator-app (TOTP) factor waiting for its first code. */
export interface MfaEnrolment {
  factorId: string;
  /** SVG image as a data URL, ready for an <img src>. */
  qrCode: string;
  secret: string;
}

/** Everything the dashboard shows for one airport. */
export interface AirportSnapshot {
  code: AirportCode;
  observation: Observation | null;
  forecast: Forecast | null;
  alerts: AlertRecord[];
  warnings: BomWarning[];
}

export interface DashboardData {
  airports: AirportSnapshot[];
  /** Latest run of each feed. */
  feeds: FeedLogEntry[];
}

export interface GroupPatch {
  enabled?: boolean;
  airports?: AirportCode[];
  categories?: AlertCategory[];
  minLevel?: AlertLevel;
}

export type AuditStatusFilter = 'all' | 'sent' | 'failed';

export interface AuditQuery {
  status: AuditStatusFilter;
  page: number;
  pageSize: number;
}

export interface AuditPage {
  rows: EmailAuditEntry[];
  total: number;
}

/** Everything the UI needs from the back end. */
export interface DataApi {
  authStep(): Promise<AuthStep>;
  /** Calls `listener` on any auth change; returns an unsubscribe function. */
  onAuthChange(listener: () => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  enrolMfa(): Promise<MfaEnrolment>;
  verifyMfa(factorId: string, code: string): Promise<void>;

  loadDashboard(): Promise<DashboardData>;
  loadAlertHistory(limit: number): Promise<AlertRecord[]>;

  listGroups(): Promise<MailGroup[]>;
  createGroup(name: string): Promise<void>;
  updateGroup(id: string, patch: GroupPatch): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  addMember(groupId: string, email: string): Promise<void>;
  removeMember(memberId: string): Promise<void>;

  loadAudit(query: AuditQuery): Promise<AuditPage>;
}

/** Latest entry per feed source, sorted by source name. */
export function latestPerSource(
  entries: readonly FeedLogEntry[],
): FeedLogEntry[] {
  const latest = new Map<string, FeedLogEntry>();
  for (const entry of entries) {
    const seen = latest.get(entry.source);
    if (seen === undefined || entry.runAt > seen.runAt)
      latest.set(entry.source, entry);
  }
  return [...latest.values()].sort((a, b) => a.source.localeCompare(b.source));
}

/** Loose email check; the database has the authoritative constraint. */
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}
