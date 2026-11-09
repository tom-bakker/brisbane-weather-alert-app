/** Public browser configuration, baked in at build time by Vite. */
export interface WebConfig {
  supabaseUrl: string;
  /** Supabase publishable (anon) key: designed to be public; RLS protects data. */
  supabasePublishableKey: string;
}

/** Reads the config, or returns null when the build was not configured. */
export function readWebConfig(
  env: Record<string, string | undefined>,
): WebConfig | null {
  const supabaseUrl = env['VITE_SUPABASE_URL']?.trim();
  const supabasePublishableKey = env['VITE_SUPABASE_PUBLISHABLE_KEY']?.trim();
  if (!supabaseUrl || !supabasePublishableKey) return null;
  return {supabaseUrl, supabasePublishableKey};
}
