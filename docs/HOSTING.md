# Hosting options (research, November 2026)

## What the app needs

1. Static hosting for the React app.
2. A **scheduled job** every 5–10 minutes that fetches the feeds and sends
   email. GitHub Pages cannot do this, because it only serves static files.
3. A **database** and **login** that the browser can use safely.
4. A **secret store** for the Gmail app password and the database key.

## Options compared

| Option | Static app | Scheduled job | Database + login | Secrets | Cost | Main drawback |
| --- | --- | --- | --- | --- | --- | --- |
| **A. GitHub Pages + GitHub Actions + Supabase (chosen)** | GitHub Pages | Actions `schedule` (min 5 min) | Supabase Postgres + Auth (TOTP MFA), open source | GitHub Actions encrypted secrets | $0 (public repo) | Scheduled runs can be delayed at busy times; schedules turn off after 60 days with no repo activity |
| B. Cloudflare Pages + Workers + D1 | Cloudflare Pages | Worker cron triggers | D1 (SQLite) + your own auth code | Worker secrets | $0 tier | SMTP from Workers needs raw TCP sockets and a community mail library; login and MFA would have to be built by hand |
| C. Self-hosted Docker (Node + SQLite) on a free VM such as Oracle Cloud Always Free | Same server | node-cron, exact timing | SQLite + own auth | A secrets manager such as Infisical or OpenBao | $0 VM | You patch, monitor and back up the server yourself |
| D. Supabase only (Edge Functions + pg_cron) | GitHub Pages | pg_cron calling an Edge Function | Supabase | Supabase secrets | $0 tier | Edge Functions run on Deno: BoM's FTP feed and the Node SMTP library would need reworking |

## Why option A

- **No servers to run.** Every part is a managed free tier.
- **Secrets never leave the key store.** GitHub injects them into the job at
  run time only, and the browser holds only the public publishable key.
- **Login is handled by a maintained product** (Supabase Auth, open source),
  including TOTP MFA, rather than custom code.
- **Portable.** The job is plain Node, so it can move to option C (cron on a VM)
  without code changes; only the scheduler changes.

## Limits checked

| Limit | Value | Effect |
| --- | --- | --- |
| GitHub Actions minutes | Unlimited for public repos | Every-10-minute runs are free. A private repo has 2,000 min/month, so you would need to run every ~30 min. |
| GitHub `schedule` | Minimum 5 min; can be delayed or dropped under load; turns off after 60 days of inactivity | Alerts can arrive late at busy times. The dashboard shows data age and the stale banner. |
| Supabase free | 500 MB database, paused after 1 week of inactivity | Retention keeps the data small, and the job's writes keep the project active. |
| Gmail | About 500 recipients a day | Plenty for a few groups. Watch the audit page for `454` quota errors. |
| aviationweather.gov | 100 requests/min | The job makes 2 requests every 10 min. |
| MET Norway | Identify with User-Agent; under 20 req/s; don't re-fetch unchanged data | The job fetches each airport at most every 30 min (it reuses the stored forecast in between) and sends an identifying User-Agent. |

## If you need tighter timing later

Move only the scheduler. Run `npm run alert-cycle` from cron on a small VM
(option C), with the same four secrets supplied by a secrets manager such as
Infisical (open source) at run time. The database, web app and code stay the same.
