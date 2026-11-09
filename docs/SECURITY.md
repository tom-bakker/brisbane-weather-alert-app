# Security and secrets

## Where each value lives

| Value | Secret? | Stored in | Used by |
| --- | --- | --- | --- |
| Gmail app password | **Yes** | GitHub Actions secret `GMAIL_APP_PASSWORD` | Alert job only |
| Supabase secret key | **Yes** | GitHub Actions secret `SUPABASE_SECRET_KEY` | Alert job only |
| Gmail address, Supabase URL | Low risk | GitHub Actions secrets | Alert job |
| Supabase publishable key and URL | No: public by design | GitHub Actions variables, built into the web app | Browser |
| Admin password | **Yes** | Your password manager; Supabase stores only a hash | Admin |
| Admin TOTP seed | **Yes** | Your authenticator app; Supabase | Admin |

Nothing secret is in the repository, in `.env` files or on a developer's
machine:

- `.gitignore` blocks `.env*` files.
- The job reads secrets only from environment variables and stops with a
  clear error naming any that are missing, without printing their values
  (`src/job/config.ts`).
- `npm run alert-cycle:dry` needs no secrets at all.

## How the data is protected

- **Row-level security** is on for every table
  (`supabase/migrations/…_initial_schema.sql`). The browser can read or change
  data only when the caller is listed in `public.admins` **and** their session
  has passed MFA (`aal2`).
- Anonymous callers are refused at table level.
- The **email audit** has no insert, update or delete policy, so the web app
  can only read it. Only the job's secret key can write to it.
- Public sign-up is disabled, so there is one admin account. Any other
  signed-in user who somehow existed would get "Not authorised" and see no data.
- Sign-in errors use one generic message, so they don't reveal whether the
  email or the password was wrong.
- Emails go Bcc, so recipients don't see each other's addresses. Alert text is
  HTML-escaped.

These rules were checked against a real Postgres engine (PGlite) with stubbed
Supabase `auth` functions:

- An admin with MFA can read data.
- The same admin without MFA, and a non-admin, see nothing.
- Updates and deletes on the audit table affect 0 rows.
- Anonymous access is denied.
- Invalid emails, duplicate members and duplicate active alerts are all rejected.

## Before go-live

- Confirm with management whether internal safety use of free BoM data is
  acceptable (the spec raises this as an open question).
- Align the thresholds in `src/domain/thresholds.ts` with company procedures.
