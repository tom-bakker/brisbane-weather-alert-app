// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {EMAIL_ICONS} from '../domain/email_sections';
import {ALERT_CATEGORIES} from '../domain/types';
import {USER_AUDIT_ACTIONS, USER_ROLES} from '../domain/users';

describe('user_management migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20261113000000_user_management.sql',
    ),
    'utf8',
  );
  const earlier = [
    '20261109000000_initial_schema.sql',
    '20261110000000_email_sections.sql',
    '20261112000000_email_resend.sql',
  ]
    .map((f) => readFileSync(join(process.cwd(), 'supabase/migrations', f)))
    .join('\n');

  it('allows exactly the roles the app offers', () => {
    const block = /check \(role in \(([^)]*)\)\)/.exec(sql)?.[1];
    expect(quoted(block)).toEqual([...USER_ROLES]);
  });

  it('allows exactly the audit actions the app shows', () => {
    const block = /check \(action in \(([^)]*)\)\)/.exec(sql)?.[1];
    expect(quoted(block)).toEqual([...USER_AUDIT_ACTIONS]);
  });

  it('moves every policy that used is_admin() before dropping it', () => {
    const policies = [
      ...earlier.matchAll(/create policy (\w+) on (public\.\w+)[^;]*is_admin/g),
    ].map((m) => `${m[1]} on ${m[2]}`);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(sql).toContain(`alter policy ${policy}`);
    }
    expect(sql).toContain('drop function public.is_admin();');
  });

  it('keeps the user audit read-only and admin-only from the app', () => {
    expect(sql).toContain(
      'alter table public.user_audit enable row level security;',
    );
    expect(sql).toMatch(
      /create policy admin_read on public\.user_audit\s+for select to authenticated using \(public\.is_full_admin\(\)\);/,
    );
    expect(sql).not.toMatch(
      /on public\.user_audit\s+for (insert|update|delete|all)/,
    );
  });

  it('always keeps at least one admin, even under concurrent changes', () => {
    expect(sql).toMatch(
      /create trigger keep_one_admin\s+after update of role or delete on public\.app_users/,
    );
    expect(sql).toContain('pg_advisory_xact_lock');
  });

  it('never returns a password or MFA secret from list_app_users', () => {
    const body = /function public\.list_app_users\(\)[\s\S]*?\$\$;/.exec(
      sql,
    )?.[0];
    expect(body).toBeDefined();
    expect(body).not.toMatch(/encrypted_password|secret/);
  });
});

/** The quoted values inside a SQL `in (...)` list. */
function quoted(block: string | undefined): string[] {
  return [...(block ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

describe('email_sections migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20261110000000_email_sections.sql',
    ),
    'utf8',
  );

  it('allows exactly the icons the app offers', () => {
    const block = /check \(icon in \(([^)]*)\)\)/.exec(sql)?.[1];
    expect(quoted(block)).toEqual(EMAIL_ICONS.map((i) => i.icon));
  });

  it('allows exactly the alert categories', () => {
    const block = /check \(category in \(([^)]*)\)\)/.exec(sql)?.[1];
    expect(quoted(block)).toEqual([...ALERT_CATEGORIES]);
  });
});

describe('email_resend migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261112000000_email_resend.sql'),
    'utf8',
  );

  it('lets only the admin queue resends, one pending per email', () => {
    expect(sql).toContain(
      'alter table public.email_resend_requests enable row level security;',
    );
    expect(sql).toMatch(
      /create policy admin_insert on public\.email_resend_requests\s+for insert to authenticated with check \(public\.is_admin\(\)\);/,
    );
    expect(sql).toMatch(
      /create unique index [a-z_]+\s+on public\.email_resend_requests \(audit_id\) where processed_at is null;/,
    );
  });

  it('links each resent copy to the email it repeats', () => {
    expect(sql).toMatch(
      /add column resend_of bigint references public\.email_audit \(id\) on delete set null/,
    );
  });
});
