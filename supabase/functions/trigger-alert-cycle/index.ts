// Supabase Edge Function (Deno): starts the "Alert cycle" GitHub workflow.
// Two callers are allowed:
//   * the dashboard's "Refresh now" button: the caller's JWT must pass
//     public.is_admin() (admin signed in with MFA), the same check row-level
//     security uses;
//   * the pg_cron job every 10 minutes (migration 20261111000000): it sends
//     the shared secret CRON_SECRET in the x-cron-secret header.
//
// Deploy with --no-verify-jwt: the cron call carries no user JWT, and this
// function does all of its own authorisation (above).
//
// Secrets (set with `supabase secrets set`, never in the repository):
//   GITHUB_DISPATCH_TOKEN  fine-grained token, this repo only, Actions: write
//   GITHUB_REPO            "owner/name"
//   GITHUB_REF             branch to run on (default "main")
//   CRON_SECRET            long random string; the same value is stored in
//                          Supabase Vault as alert_cycle_cron_secret
//   ALLOWED_ORIGIN         the web app's origin, e.g. https://you.github.io
//                          (required: the function refuses every request
//                          until it is set, rather than allowing any origin)
//
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.

import {createClient} from 'npm:@supabase/supabase-js@2';

const WORKFLOW_FILE = 'alert-cycle.yml';

/** The one browser origin allowed to call this function ("" = none). */
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')?.trim() ?? '';

// Without ALLOWED_ORIGIN no Access-Control-Allow-Origin header is sent, so
// browsers block every cross-origin call: fail closed, never "*".
const corsHeaders: Record<string, string> = {
  ...(ALLOWED_ORIGIN === ''
    ? {}
    : {'Access-Control-Allow-Origin': ALLOWED_ORIGIN, Vary: 'Origin'}),
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'},
  });
}

async function callerIsAdmin(authorization: string): Promise<boolean> {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {global: {headers: {Authorization: authorization}}},
  );
  const {data, error} = await sb.rpc('is_admin');
  return error === null && data === true;
}

/** Compares two strings in time that does not depend on where they differ. */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** True when the request comes from the pg_cron job (shared secret). */
function callerIsCron(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET') ?? '';
  const given = req.headers.get('x-cron-secret');
  // An unset or short secret never matches, so the cron path fails closed.
  return expected.length >= 32 && given !== null &&
    timingSafeEqual(given, expected);
}

async function callerIsAuthorised(req: Request): Promise<boolean> {
  if (callerIsCron(req)) return true;
  const authorization = req.headers.get('Authorization');
  return authorization !== null && (await callerIsAdmin(authorization));
}

async function dispatchWorkflow(
  token: string,
  repo: string,
  ref: string,
): Promise<Response> {
  return await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'airport-weather-alerts',
      },
      body: JSON.stringify({ref}),
    },
  );
}

Deno.serve(async (req) => {
  if (ALLOWED_ORIGIN === '') {
    console.error('ALLOWED_ORIGIN is not set; refusing all requests.');
    return json(500, {
      error: 'Refresh is not set up on the server yet. See docs/SETUP.md.',
    });
  }
  if (req.method === 'OPTIONS')
    return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return json(405, {error: 'Use POST.'});

  if (!(await callerIsAuthorised(req))) {
    return json(403, {error: 'Not authorised to refresh the feeds.'});
  }

  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  const repo = Deno.env.get('GITHUB_REPO');
  if (!token || !repo) {
    return json(500, {
      error: 'Refresh is not set up on the server yet. See docs/SETUP.md.',
    });
  }

  const github = await dispatchWorkflow(
    token,
    repo,
    Deno.env.get('GITHUB_REF') ?? 'main',
  );
  if (github.status !== 204) {
    console.error('GitHub dispatch failed', github.status, await github.text());
    return json(502, {
      error: `GitHub did not start the run (HTTP ${github.status}).`,
    });
  }
  return json(202, {ok: true});
});
