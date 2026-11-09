import {render} from '@testing-library/react';
import type {ReactElement} from 'react';
import {vi} from 'vitest';
import {makeGroup} from '../domain/test_fixtures';
import type {AlertRecord, EmailAuditEntry, MailGroup} from '../domain/types';
import type {AuditPage, AuthStep, DashboardData, DataApi} from './data/api';
import {ApiProvider} from './data/api_context';

/** An in-memory DataApi whose methods are all spies. */
export class FakeApi implements DataApi {
  step: AuthStep = {kind: 'signed_in', email: 'admin@example.com'};
  dashboard: DashboardData = {airports: [], feeds: []};
  history: AlertRecord[] = [];
  groups: MailGroup[] = [makeGroup()];
  audit: EmailAuditEntry[] = [];
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

  /** Simulates Supabase announcing an auth change. */
  emitAuthChange(): void {
    for (const l of this.listeners) l();
  }
}

/** Renders `ui` with `api` provided. */
export function renderWithApi(ui: ReactElement, api: DataApi = new FakeApi()) {
  return render(<ApiProvider api={api}>{ui}</ApiProvider>);
}
