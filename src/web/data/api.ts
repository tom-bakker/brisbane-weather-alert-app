import type {EmailSection, EmailSections} from '../../domain/email_sections';
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
import type {
  AppUser,
  UserAuditAction,
  UserAuditEntry,
  UserRole,
} from '../../domain/users';

/** Why a signed-in user must choose a password before going on. */
export type PasswordIntent = 'invite' | 'recovery';

/** Where the user is in the sign-in flow. */
export type AuthStep =
  | {kind: 'signed_out'; linkError?: string}
  | {kind: 'enrol_mfa'}
  | {kind: 'verify_mfa'; factorId: string}
  | {kind: 'set_password'; email: string; intent: PasswordIntent}
  | {kind: 'not_authorised'; email: string}
  | {kind: 'signed_in'; email: string; role: UserRole};

export interface UserAuditQuery {
  action: UserAuditAction | 'all';
  page: number;
  pageSize: number;
}

export interface UserAuditPage {
  rows: UserAuditEntry[];
  total: number;
}

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

/** Why a sign-in was refused, as far as the UI needs to know. */
export type SignInFailure =
  'credentials' | 'unconfirmed' | 'rate_limited' | 'unreachable' | 'unknown';

/** Thrown by `DataApi.signIn`; `reason` picks the message the user sees. */
export class SignInError extends Error {
  constructor(
    readonly reason: SignInFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

/**
 * Maps a Supabase Auth error code and HTTP status to a failure reason.
 * Status 0 means the request never got an HTTP response.
 */
export function signInFailureFor(
  code: string | undefined,
  status: number | undefined,
): SignInFailure {
  if (code === 'invalid_credentials') return 'credentials';
  if (code === 'email_not_confirmed') return 'unconfirmed';
  if (code === 'over_request_rate_limit' || status === 429)
    return 'rate_limited';
  if (status === 0) return 'unreachable';
  return 'unknown';
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
  /** Sets the password after an invite or reset link. */
  setPassword(password: string): Promise<void>;

  loadDashboard(): Promise<DashboardData>;
  loadAlertHistory(limit: number): Promise<AlertRecord[]>;
  /** Asks GitHub Actions to run the alert cycle now (via an edge function). */
  refreshFeeds(): Promise<void>;

  listGroups(): Promise<MailGroup[]>;
  createGroup(name: string): Promise<void>;
  updateGroup(id: string, patch: GroupPatch): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  addMember(groupId: string, email: string): Promise<void>;
  removeMember(memberId: string): Promise<void>;

  loadAudit(query: AuditQuery): Promise<AuditPage>;
  /**
   * Queues a copy of an audited email for its original recipients. The
   * alert cycle sends it; `refreshFeeds` starts a cycle without waiting.
   */
  resendEmail(auditId: number): Promise<void>;

  /** Every category's email section: saved where edited, else default. */
  loadEmailSections(): Promise<EmailSections>;
  saveEmailSection(section: EmailSection): Promise<void>;
  /** Drops the saved section so the category goes back to its default. */
  resetEmailSection(category: AlertCategory): Promise<void>;

  // Admin only (the server checks too).
  listUsers(): Promise<AppUser[]>;
  /** Emails an invitation; the user sets a password and MFA from it. */
  inviteUser(email: string, role: UserRole): Promise<void>;
  /** Emails the user a password reset link. */
  resetUserPassword(userId: string): Promise<void>;
  /** Removes the user's authenticator; they set up a new one. */
  resetUserMfa(userId: string): Promise<void>;
  setUserRole(userId: string, role: UserRole): Promise<void>;
  removeUser(userId: string): Promise<void>;
  loadUserAudit(query: UserAuditQuery): Promise<UserAuditPage>;
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
