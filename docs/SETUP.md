# Setup guide

This takes about 30 minutes. Everything runs on free tiers, and no secret is
ever saved in the repository or on your computer.

## 1. Gmail account for sending

Use a dedicated Gmail account (for example `yourteam.wx.alerts@gmail.com`),
not a personal one.

1. Turn on **2-Step Verification** for the account (Google Account → Security).
2. Create an **app password** at <https://myaccount.google.com/apppasswords>
   (name it "Weather alerts"). Google shows 16 characters, once.
3. Don't save the app password anywhere. You will paste it straight into GitHub in step 4.

Notes:

- A free Gmail account can send about 500 emails a day, and each recipient
  counts. The job sends one email per group per alert change.
- Gmail always sends from the account's own address.
- If Google blocks the first sign-in from GitHub's servers, sign in to the
  account in a browser and approve the "new sign-in" security prompt, then
  re-run the workflow.

## 2. Supabase project (database + login)

1. Create a free account at <https://supabase.com> and a new project. Choose
   the Sydney region and a strong database password, and keep that password in
   your password manager.
2. **SQL Editor** → paste the contents of
   `supabase/migrations/20261109000000_initial_schema.sql` → **Run**. Then do
   the same, in order, for `20261110000000_email_sections.sql`,
   `20261112000000_email_resend.sql` (the Email audit page's **Resend**
   button) and `20261113000000_user_management.sql` (roles, Settings →
   Users and the user audit). The cron migration comes later, in section 6.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
4. **Authentication → Multi-Factor**: make sure **TOTP (App Authenticator)** is enabled.
5. **Authentication → Users → Add user → Create new user**: enter the first
   admin's email and a long, unique password. Tick "Auto Confirm User".
   This is the only account made by hand; everyone else is invited from the
   app (section 7).
6. Copy the new user's **UID** and run this in the SQL Editor:

   ```sql
   insert into public.app_users (user_id, role) values ('<paste UID here>', 'admin');
   ```

7. **Authentication → URL Configuration**: set **Site URL** to your GitHub
   Pages URL (step 3), e.g. `https://<user>.github.io/brisbane-weather-alert-app/`.
8. **Project Settings → API Keys**: note the **project URL**, the
   **publishable key** (`sb_publishable_…`, public) and the **secret key**
   (`sb_secret_…`, secret).

## 3. GitHub repository and Pages

1. Create a **public** repository named `brisbane-weather-alert-app` and push this code.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 4. Secrets and variables

Go to **Settings → Secrets and variables → Actions**.

**Secrets** (encrypted; they never appear in logs or code):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL, e.g. `https://abcd.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase **secret** key |
| `GMAIL_USER` | The sending Gmail address |
| `GMAIL_APP_PASSWORD` | The 16-character app password |

**Variables** (public values):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL (same as above) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable** key |
| `ALERT_FROM_NAME` | Optional sender name, default "Airport Weather Alerts" |

## 5. First run

1. **Actions → Deploy to GitHub Pages → Run workflow** (it also runs on every push to `main`).
2. **Actions → Alert cycle → Run workflow**. Check that the log ends with `Done.`
   and lists no failed feeds. Once section 6 is set up it runs every 10 minutes.
3. Open the Pages URL and sign in. On first sign-in you will be asked to scan a
   QR code with an authenticator app (Google Authenticator, Microsoft
   Authenticator, Aegis, 2FAS…). After that, each sign-in needs the password
   **and** a 6-digit code.
4. **Mail groups**: create a group, add your own address and switch on "UV
   exposure" with minimum level "Info and above". On a sunny afternoon the
   next cycle sends a UV email, and **Email audit** shows the entry.

## 6. Scheduler and "Refresh now" button

The Alert cycle workflow is started by a Supabase Edge Function
(`supabase/functions/trigger-alert-cycle`), which asks GitHub to run it. Two
things call the function:

- a **pg_cron job every 10 minutes** (migration
  `20261111000000_alert_cycle_cron.sql`), which proves itself with a shared
  secret. GitHub's own `schedule` trigger is not used because it dropped most
  runs;
- the dashboard's **Refresh now** button, for the admin signed in with MFA.

All of this is free: pg_cron, pg_net and Vault come with every Supabase plan,
~4,400 function calls a month is well inside the free 500,000, and Actions
minutes are free on a public repository.

1. On GitHub: **Settings → Developer settings → Fine-grained tokens → Generate
   new token**. Repository access: **only** this repository. Permissions:
   **Actions: Read and write**. Nothing else. Set an expiry and diarise renewal.
2. With the [Supabase CLI](https://supabase.com/docs/guides/cli). It needs no
   install: `npx supabase` downloads and runs it. Sign in and link this
   folder to the project once (the ref is in the dashboard URL,
   `supabase.com/dashboard/project/<ref>`):

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase link --project-ref <ref>
   ```

   Then set the function's secrets:

   ```bash
   npx supabase secrets set GITHUB_DISPATCH_TOKEN=<token> GITHUB_REPO=<owner>/brisbane-weather-alert-app ALLOWED_ORIGIN=https://<owner>.github.io
   ```

   Then generate the cron secret (64 hex characters from the operating
   system's cryptographic random generator) and set it without it ever being
   printed or saved in shell history. In PowerShell:

   ```powershell
   $bytes = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $cronSecret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
   npx supabase secrets set "CRON_SECRET=$cronSecret"
   Set-Clipboard -Value $cronSecret
   ```

   (macOS/Linux: `cronSecret=$(openssl rand -hex 32)`, then
   `npx supabase secrets set "CRON_SECRET=$cronSecret"`.) Keep that terminal
   open: step 3 pastes the same value into Vault.

   ```bash
   npx supabase functions deploy trigger-alert-cycle --no-verify-jwt
   ```

   `--no-verify-jwt` is needed because the cron call has no user sign-in. The
   function still refuses any caller that is neither the admin with MFA nor
   holding `CRON_SECRET`. If the deploy says Docker is not running, add
   `--use-api`.

3. **SQL Editor** → paste the contents of
   `supabase/migrations/20261111000000_alert_cycle_cron.sql` → **Run**, the
   same way as the schema in section 2. (Don't use `supabase db push`: it
   would try to re-run the migrations already applied.) Then store the
   function URL and the same secret in Vault:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/trigger-alert-cycle', 'alert_cycle_function_url');
   select vault.create_secret('<paste the cron secret>', 'alert_cycle_cron_secret');
   ```

   Run it, then delete that query from the SQL Editor's list (it may be kept
   as a snippet) and clear the clipboard
   (`Set-Clipboard -Value ' '`, and remove it from Win+V clipboard history
   if that is on). Close the terminal so `$cronSecret` is gone. The value now
   lives only in the function's secrets and in Vault, both encrypted.

4. Check it: within 10 minutes a run started by `workflow_dispatch` appears
   under **Actions → Alert cycle**. If not, look at the latest rows of
   `cron.job_run_details` and `net._http_response` (a 403 means the two
   secrets differ).
5. Press **Refresh now** on the dashboard. A new run appears under **Actions →
   Alert cycle**, and the dashboard shows the new data about 1–3 minutes later.

To change a Vault value later use `vault.update_secret` with the id from
`vault.secrets`. To rotate `CRON_SECRET`, set the new value in both places.

`ALLOWED_ORIGIN` is required. It is the origin only (scheme and host, no
path, no trailing slash). Without it the function refuses every request and
browsers block the call, so the button shows a network error rather than
silently allowing any website to call the function.

Until this is set up, the button shows "Refresh is not set up on the server
yet" (or a network error if the function isn't deployed or `ALLOWED_ORIGIN` is
missing). Everything else keeps working.

## 7. Users, invitations and password resets

The app is invite only. There are two roles:

| Role | Can do |
| --- | --- |
| **Admin** | Everything, plus **Settings → Users** (invite, change role, reset password, reset MFA, remove) and **Settings → User audit**. |
| **Power user** | Dashboard, alerts, Refresh now, mail groups (add and remove emails), email sections and the email audit. |

Everyone must use a password **and** an authenticator app. The admin sees
only each user's email, role and status, never a password or MFA secret.

Invitation and reset emails are sent by Supabase Auth, through the **same
Gmail account** as the alerts:

1. In Google, create a **second app password** for the alerts Gmail account
   and name it "Supabase Auth". (A separate one means you can revoke either
   without breaking the other.) Don't save it anywhere.
2. **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:

   | Field | Value |
   | --- | --- |
   | Sender email | the Gmail address (the same as `GMAIL_USER`) |
   | Sender name | `Airport Weather Alerts` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | the Gmail address |
   | Password | the new app password |

3. **Authentication → Emails → Templates**: for **Invite user**, set the
   subject to `✈️ You're invited to Airport Weather Alerts` and paste
   `supabase/templates/invite.html` as the body. For **Reset password**, set
   the subject to `🔑 Reset your Airport Weather Alerts password` and paste
   `supabase/templates/recovery.html`.
4. Check **Authentication → URL Configuration → Site URL** is the Pages URL
   (step 2.7): the links in both emails go there.
5. Deploy the user management function, and redeploy the refresh function
   (it now admits both roles, and the old `is_admin()` check it used is gone):

   ```bash
   npx supabase functions deploy manage-users --no-verify-jwt
   ```

   ```bash
   npx supabase functions deploy trigger-alert-cycle --no-verify-jwt
   ```

   `manage-users` uses the `ALLOWED_ORIGIN` secret from section 6 and the
   Supabase-provided service key; it needs no new secrets. It refuses anyone
   who is not an admin signed in with MFA.

Upgrading an existing install: run `20261113000000_user_management.sql` in
the SQL Editor, then do steps 1–5. Your existing admin becomes an **Admin**.

How it works for the person invited: they click the link, choose a password
(12+ characters), scan a QR code with an authenticator app, and they're in.
After **Reset password** they open the link, enter their authenticator code,
then choose a new password. After **Reset MFA** they sign in with their
password and scan a new QR code.

**Settings → User audit** records, with a timestamp: users added and
removed, role changes, password reset emails sent, passwords set or changed,
MFA resets and invitations accepted (email confirmed). It is read-only from
the app.

## Keeping it running

- **The GitHub dispatch token expires.** When it does, the cron job and
  Refresh now both stop starting runs (`net._http_response` shows 502).
  Generate a new token and run `npx supabase secrets set GITHUB_DISPATCH_TOKEN=…`.
- **Supabase pauses free projects after a week of inactivity.** The alert
  cycle writes every 10 minutes, which keeps the project active.
- A failed email makes the workflow run fail, so GitHub notifies the repo owner.
- The **Feed health** panel on the dashboard shows the latest result of each data feed.

## Rotating secrets

- **Gmail:** revoke the old app password in Google, create a new one and update
  the `GMAIL_APP_PASSWORD` secret. For the "Supabase Auth" app password, update
  **Authentication → Emails → SMTP Settings** instead.
- **Supabase:** create a new secret key in Supabase, update `SUPABASE_SECRET_KEY`,
  then delete the old key.

## Troubleshooting sign-in

A `400 (Bad Request)` on `/auth/v1/token?grant_type=password` in the browser
console means Supabase refused the email and password. The sign-in screen says
why. To see the raw reason, open DevTools → **Network**, click the `token`
request and look at `error_code` in the **Response** tab.

| `error_code` | Fix |
| --- | --- |
| `invalid_credentials` | The email or password is wrong, or the user does not exist in *this* project. An admin can send a new password from **Settings → Users → Reset password**. |
| `email_not_confirmed` | The user hasn't opened their invitation yet. Remove them in **Settings → Users** and invite them again if the link expired. |
| `over_request_rate_limit` | Too many attempts. Wait a few minutes. |

If sign-in works but the app says the account doesn't have access, the user
isn't in `public.app_users` (step 2.6, or invite them from the app).

If invite or reset emails don't arrive, check **Authentication → Emails →
SMTP Settings** (a wrong app password shows as an SMTP error in **Logs →
Auth**) and the Auth email rate limit under **Authentication → Rate Limits**.

"Message emit failed … worker-content-script" warnings come from a browser
extension (usually a password manager), not from this app, and can be ignored.
