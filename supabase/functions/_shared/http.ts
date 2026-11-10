// CORS and JSON helpers shared by the Edge Functions.

/** The one browser origin allowed to call the functions ("" = none). */
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')?.trim() ?? '';

/** False until ALLOWED_ORIGIN is set; the functions then refuse everything. */
export function originConfigured(): boolean {
  return ALLOWED_ORIGIN !== '';
}

// Without ALLOWED_ORIGIN no Access-Control-Allow-Origin header is sent, so
// browsers block every cross-origin call: fail closed, never "*".
export const corsHeaders: Record<string, string> = {
  ...(ALLOWED_ORIGIN === ''
    ? {}
    : {'Access-Control-Allow-Origin': ALLOWED_ORIGIN, Vary: 'Origin'}),
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'},
  });
}
