// Supabase Edge Function (Deno): starts the "Alert cycle" GitHub workflow
// when the dashboard's "Refresh now" button is pressed.
//
// Only the admin, signed in with MFA, may call it: the caller's JWT must pass
// public.is_admin(), the same check row-level security uses.
//
// Secrets (set with `supabase secrets set`, never in the repository):
//   GITHUB_DISPATCH_TOKEN  fine-grained token, this repo only, Actions: write
//   GITHUB_REPO            "owner/name"
//   GITHUB_REF             branch to run on (default "main")
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

  const authorization = req.headers.get('Authorization');
  if (authorization === null || !(await callerIsAdmin(authorization))) {
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
