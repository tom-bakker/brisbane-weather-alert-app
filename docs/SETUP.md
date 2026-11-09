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
   `supabase/migrations/20261109000000_initial_schema.sql` → **Run**.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
4. **Authentication → Multi-Factor**: make sure **TOTP (App Authenticator)** is enabled.
5. **Authentication → Users → Add user → Create new user**: enter the admin
   email and a long, unique password. Tick "Auto Confirm User".
6. Copy the new user's **UID** and run this in the SQL Editor:

   ```sql
   insert into public.admins (user_id) values ('<paste UID here>');
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
| `APP_URL` | Your Pages URL (used as a link in emails) |
| `ALERT_FROM_NAME` | Optional sender name, default "Airport Weather Alerts" |

## 5. First run

1. **Actions → Deploy to GitHub Pages → Run workflow** (it also runs on every push to `main`).
2. **Actions → Alert cycle → Run workflow**. Check that the log ends with `Done.`
   and lists no failed feeds. From then on it runs every 10 minutes.
3. Open the Pages URL and sign in. On first sign-in you will be asked to scan a
   QR code with an authenticator app (Google Authenticator, Microsoft
   Authenticator, Aegis, 2FAS…). After that, each sign-in needs the password
   **and** a 6-digit code.
4. **Mail groups**: create a group, add your own address and switch on "UV
   exposure" with minimum level "Info and above". On a sunny afternoon the
   next cycle sends a UV email, and **Email audit** shows the entry.

## Keeping it running

- **GitHub disables scheduled workflows after 60 days with no repository
  activity.** GitHub emails you before it does this. Any commit, or clicking
  "Enable workflow" on the Actions tab, restarts the schedule.
- **Supabase pauses free projects after a week of inactivity.** The alert
  cycle writes every 10 minutes, which keeps the project active.
- A failed email makes the workflow run fail, so GitHub notifies the repo owner.
- The **Feed health** panel on the dashboard shows the latest result of each data feed.

## Rotating secrets

- **Gmail:** revoke the old app password in Google, create a new one and update
  the `GMAIL_APP_PASSWORD` secret.
- **Supabase:** create a new secret key in Supabase, update `SUPABASE_SECRET_KEY`,
  then delete the old key.

## Troubleshooting sign-in

A `400 (Bad Request)` on `/auth/v1/token?grant_type=password` in the browser
console means Supabase refused the email and password. The sign-in screen says
why. To see the raw reason, open DevTools → **Network**, click the `token`
request and look at `error_code` in the **Response** tab.

| `error_code` | Fix |
| --- | --- |
| `invalid_credentials` | The email or password is wrong, or the user does not exist in *this* project. Check **Authentication → Users**. To set a new password, open the user's **⋯** menu → **Send password recovery**, or delete the user and create it again (step 2.5), then update `public.admins` with the new UID. |
| `email_not_confirmed` | The user was created without "Auto Confirm User". Open the user in **Authentication → Users** and confirm them, or create the user again with that box ticked. |
| `over_request_rate_limit` | Too many attempts. Wait a few minutes. |

If sign-in works but the app then says the account is not an admin, the UID in
`public.admins` doesn't match the user (step 2.6).

"Message emit failed … worker-content-script" warnings come from a browser
extension (usually a password manager), not from this app, and can be ignored.
