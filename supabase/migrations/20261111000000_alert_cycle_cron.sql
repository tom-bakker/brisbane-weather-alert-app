-- Runs the alert cycle every 10 minutes from Supabase instead of GitHub's
-- `schedule` trigger, which drops most runs at busy times.
--
-- pg_cron calls the trigger-alert-cycle Edge Function through pg_net; the
-- function then starts the "Alert cycle" GitHub workflow (workflow_dispatch).
-- pg_cron, pg_net and Vault are included on the free plan.
--
-- Two Vault secrets must exist (see docs/SETUP.md, "Scheduler"); nothing
-- secret is stored in this file:
--   alert_cycle_function_url  https://<ref>.supabase.co/functions/v1/trigger-alert-cycle
--   alert_cycle_cron_secret   the same value as the function's CRON_SECRET
-- Until they exist each run fails harmlessly; see cron.job_run_details and
-- net._http_response.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- cron.schedule with an existing job name replaces that job, so re-running
-- this migration is safe.
select cron.schedule(
  'alert-cycle',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'alert_cycle_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'alert_cycle_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
