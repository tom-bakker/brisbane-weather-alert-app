import {render} from '@testing-library/react';
import type {ReactElement} from 'react';
import {vi} from 'vitest';
import {
  defaultSection,
  defaultSections,
  withSection,
  type EmailPhase,
  type EmailSection,
} from '../domain/email_sections';
import {
  DEFAULT_THRESHOLDS,
  type CategoryThresholds,
  type ThresholdCategory,
  type Thresholds,
} from '../domain/thresholds';
import {makeGroup} from '../domain/test_fixtures';
import type {
  AlertCategory,
  AlertRecord,
  EmailAuditEntry,
  MailGroup,
} from '../domain/types';
import type {AppUser, UserAuditEntry, UserRole} from '../domain/users';
import type {
  AuditPage,
  AuthStep,
  DashboardData,
  DataApi,
  UserAuditQuery,
} from './data/api';
import {ApiProvider} from './data/api_context';

/** An in-memory DataApi whose methods are all spies. */
export class FakeApi implements DataApi {
  step: AuthStep = {
    kind: 'signed_in',
    email: 'admin@example.com',
    role: 'admin',
  };
  users: AppUser[] = [
    makeUser({id: 'u1', email: 'admin@example.com', role: 'admin'}),
    makeUser({id: 'u2', email: 'sam@example.com', role: 'power_user'}),
  ];
  userAudit: UserAuditEntry[] = [];
  dashboard: DashboardData = {airports: [], feeds: []};
  history: AlertRecord[] = [];
  groups: MailGroup[] = [makeGroup()];
  audit: EmailAuditEntry[] = [];
  sections = defaultSections();
  thresholds: Thresholds = DEFAULT_THRESHOLDS;
  listeners: (() => void)[] = [];

  authStep = vi.fn(async () => this.step);
  onAuthChange = vi.fn((listener: () => void) => {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  });
  signIn = vi.fn(async (_email: string, _password: string) => {});
  signOut = vi.fn(async () => {});
  enrolMfa = vi.fn(async () => ({
    factorId: 'f1',
    qrCode: 'data:image/svg+xml;utf-8,<svg/>',
    secret: 'ABC123',
  }));
  verifyMfa = vi.fn(async (_factorId: string, _code: string) => {});
  loadDashboard = vi.fn(async () => this.dashboard);
  loadAlertHistory = vi.fn(async (_limit: number) => this.history);
  refreshFeeds = vi.fn(async () => {});
  listGroups = vi.fn(async () => this.groups);
  createGroup = vi.fn(async (_name: string) => {});
  updateGroup = vi.fn(async (_id: string, _patch: object) => {});
  deleteGroup = vi.fn(async (_id: string) => {});
  addMember = vi.fn(async (_groupId: string, _email: string) => {});
  removeMember = vi.fn(async (_memberId: string) => {});
  loadAudit = vi.fn(
    async (q: {
      status: string;
      page: number;
      pageSize: number;
    }): Promise<AuditPage> => {
      const rows = this.audit.filter(
        (r) => q.status === 'all' || r.status === q.status,
      );
      return {
        rows: rows.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize),
        total: rows.length,
      };
    },
  );
  resendEmail = vi.fn(async (_auditId: number) => {});

  loadEmailSections = vi.fn(async () => this.sections);
  saveEmailSection = vi.fn(async (section: EmailSection) => {
    this.sections = withSection(this.sections, section);
  });
  resetEmailSection = vi.fn(
    async (category: AlertCategory, phase: EmailPhase) => {
      this.sections = withSection(
        this.sections,
        defaultSection(category, phase),
      );
    },
  );
  loadThresholds = vi.fn(async () => this.thresholds);
  saveThresholds = vi.fn(async ({category, limits}: CategoryThresholds) => {
    this.thresholds = {...this.thresholds, [category]: limits};
  });
  resetThresholds = vi.fn(async (category: ThresholdCategory) => {
    this.thresholds = {
      ...this.thresholds,
      [category]: DEFAULT_THRESHOLDS[category],
    };
  });

  setPassword = vi.fn(async (_password: string) => {});
  listUsers = vi.fn(async () => this.users);
  inviteUser = vi.fn(async (_email: string, _role: UserRole) => {});
  resetUserPassword = vi.fn(async (_userId: string) => {});
  resetUserMfa = vi.fn(async (_userId: string) => {});
  setUserRole = vi.fn(async (_userId: string, _role: UserRole) => {});
  removeUser = vi.fn(async (_userId: string) => {});
  loadUserAudit = vi.fn(async (q: UserAuditQuery) => {
    const rows = this.userAudit.filter(
      (r) => q.action === 'all' || r.action === q.action,
    );
    return {
      rows: rows.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize),
      total: rows.length,
    };
  });

  /** Simulates Supabase announcing an auth change. */
  emitAuthChange(): void {
    for (const l of this.listeners) l();
  }
}

/** An active user; override any field. */
export function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'u9',
    email: 'user@example.com',
    role: 'power_user',
    invitedAt: '2026-11-01T00:00:00Z',
    emailConfirmed: true,
    mfaEnrolled: true,
    lastSignInAt: '2026-11-09T00:00:00Z',
    ...overrides,
  };
}

/** Renders `ui` with `api` provided. */
export function renderWithApi(ui: ReactElement, api: DataApi = new FakeApi()) {
  return render(<ApiProvider api={api}>{ui}</ApiProvider>);
}
