# Security and secrets

## Where each value lives

| Value | Secret? | Stored in | Used by |
| --- | --- | --- | --- |
| Gmail app password | **Yes** | GitHub Actions secret `GMAIL_APP_PASSWORD` | Alert job only |
| Second Gmail app password ("Supabase Auth") | **Yes** | Supabase **Authentication → SMTP Settings** | Supabase Auth, to send invitation and password reset emails |
| Supabase service role key | **Yes** | Provided by Supabase to Edge Functions; never in the repo or browser | `manage-users` function only, after it checks the caller is an admin with MFA |
| Supabase secret key | **Yes** | GitHub Actions secret `SUPABASE_SECRET_KEY` | Alert job only |
| Gmail address, Supabase URL | Low risk | GitHub Actions secrets | Alert job |
| GitHub dispatch token (fine-grained, this repo, Actions: write) | **Yes** | Supabase Edge Function secret `GITHUB_DISPATCH_TOKEN` | `trigger-alert-cycle` function only, after it checks the caller is a user with MFA or holds the cron secret |
| Cron secret (random, 32+ characters) | **Yes** | Edge Function secret `CRON_SECRET` and Supabase Vault `alert_cycle_cron_secret` | pg_cron job → `trigger-alert-cycle`; it can only start an alert cycle |
| Supabase publishable key and URL | No: public by design | GitHub Actions variables, built into the web app | Browser |
| User passwords | **Yes** | Each user's password manager; Supabase stores only a hash | That user. No screen shows them, not even to an admin. |
| User TOTP seeds | **Yes** | Each user's authenticator app; Supabase | That user. An admin can only delete a factor (Reset MFA), never read it. |

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
  data only when the caller is listed in `public.app_users` **and** their
  session has passed MFA (`aal2`).
- **Two roles.** `admin` and `power_user` share the data policies
  (`has_app_access()`). Only `admin` passes `is_full_admin()`, which guards
  `app_users`, the **user audit** and `list_app_users()`.
- **Invite only.** Users are created only by the `manage-users` Edge
  Function, which checks the caller with `is_full_admin()` before using the
  service key. Admins cannot remove or demote themselves, and a database
  trigger (`keep_one_admin`) refuses any change that would leave no admin,
  including two admins demoting each other at the same moment.
- `list_app_users()` returns email, role and status flags only: no password
  hash, MFA secret or token.
- The **user audit** has no insert, update or delete policy. Admin actions are
  written by `manage-users`; email confirmations and password changes by a
  trigger on `auth.users`.
- Anonymous callers are refused at table level.
- The **email audit** has no insert, update or delete policy, so the web app
  can only read it. Only the job's secret key can write to it.
- Public sign-up is disabled. Any signed-in user who is not in
  `public.app_users` gets "Not authorised" before any MFA step and sees no data.
- Invite and reset links work once and expire (Supabase default: 1 hour).
  After a reset link, a user with an authenticator must enter its code before
  choosing a new password.
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
- After the user management migration: an admin and a power user with MFA
  read and edit mail groups; either without MFA, or an uninvited user, sees
  nothing; only an admin with MFA can list users or read the user audit;
  `list_app_users()` returns no secret columns; the user audit cannot be
  written, changed or deleted from the app; the `auth.users` trigger records
  email confirmations and password changes for app users only.

## Before go-live

- Confirm with management whether internal safety use of free BoM data is
  acceptable (the spec raises this as an open question).
- Align the thresholds in `src/domain/thresholds.ts` with company procedures.
