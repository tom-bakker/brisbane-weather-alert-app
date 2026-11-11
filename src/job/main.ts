/**
 * Entry point for the scheduled alert cycle (run by GitHub Actions).
 *
 *   npm run alert-cycle       real run: needs the secrets in the environment
 *   npm run alert-cycle:dry   live feeds, in-memory store, no email, no secrets
 */
import {createClient} from '@supabase/supabase-js';
import {AIRPORTS} from '../domain/airports';
import {levelLabel} from '../domain/levels';
import {runAlertCycle, type AlertCycleDeps} from './alert_cycle';
import {fetchBomAmocDocuments, fetchBomObservationDocument} from './bom_ftp';
import {readJobConfig, userAgentFor} from './config';
import {createGmailMailer} from './gmail_mailer';
import {createHttpFeeds} from './http_feeds';
import {MemoryStore} from './memory_store';
import type {Mailer} from './ports';
import {SupabaseStore} from './supabase_store';

const log = (message: string) => console.log(message);

function dryRunDeps(): AlertCycleDeps {
  const printOnly: Mailer = {
    async send(email) {
      log(
        `[dry-run] would email ${email.bcc.length} recipient(s): ${email.subject}`,
      );
    },
  };
  return {
    feeds: createHttpFeeds({
      userAgent: userAgentFor(process.env),
      fetchBomDocuments: fetchBomAmocDocuments,
      fetchBomObservations: fetchBomObservationDocument,
    }),
    store: new MemoryStore(),
    mailer: printOnly,
    airports: AIRPORTS,
    now: () => new Date(),
    log,
  };
}

function liveDeps(): AlertCycleDeps {
  const config = readJobConfig(process.env);
  const db = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  return {
    feeds: createHttpFeeds({
      userAgent: config.userAgent,
      fetchBomDocuments: fetchBomAmocDocuments,
      fetchBomObservations: fetchBomObservationDocument,
    }),
    store: new SupabaseStore(db),
    mailer: createGmailMailer({
      user: config.gmailUser,
      appPassword: config.gmailAppPassword,
      fromName: config.fromName,
    }),
    airports: AIRPORTS,
    now: () => new Date(),
    log,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const deps = dryRun ? dryRunDeps() : liveDeps();
  const summary = await runAlertCycle(deps);

  if (dryRun && deps.store instanceof MemoryStore) {
    for (const obs of deps.store.observations)
      log(`${obs.airport}: ${obs.rawMetar}`);
    log(`BoM warnings for our airports: ${deps.store.warnings.length}`);
  }
  for (const {kind, alert} of summary.events) {
    log(
      `${kind}: ${alert.airport} ${alert.category} ${levelLabel(alert.level)} (${alert.triggerValue})`,
    );
  }
  log(
    `Done. ${summary.events.length} alert event(s), ${summary.emailsSent} email(s) sent, ` +
      `${summary.emailsFailed} failed, failed feeds: ${summary.failedFeeds.join(', ') || 'none'}.`,
  );
  // A failed email or audit write fails the run, so GitHub notifies the owner.
  if (summary.emailsFailed > 0 || summary.auditFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
