// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {EMAIL_ICONS} from '../domain/email_sections';
import {ALERT_CATEGORIES} from '../domain/types';

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
