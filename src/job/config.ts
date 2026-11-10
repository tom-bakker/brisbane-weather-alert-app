/**
 * Job configuration, read only from environment variables. In production they
 * are injected by GitHub Actions from encrypted repository secrets; nothing is
 * read from files on disk.
 */
export interface JobConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  gmailUser: string;
  gmailAppPassword: string;
  fromName: string;
  userAgent: string;
}

type Env = Record<string, string | undefined>;

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
] as const;

/** Identifies us to MET Norway and aviationweather.gov, as both ask. */
export function userAgentFor(env: Env): string {
  const repo = env['GITHUB_REPOSITORY'];
  const contact = repo === undefined ? 'local run' : `github.com/${repo}`;
  return `brisbane-weather-alert-app/0.1 (${contact})`;
}

function optional(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? null : value;
}

/**
 * Reads and validates the configuration. Throws naming any missing variables
 * (never their values).
 */
export function readJobConfig(env: Env): JobConfig {
  const missing = REQUIRED.filter((name) => optional(env, name) === null);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
  const value = (name: (typeof REQUIRED)[number]) =>
    optional(env, name) as string;
  return {
    supabaseUrl: value('SUPABASE_URL'),
    supabaseSecretKey: value('SUPABASE_SECRET_KEY'),
    gmailUser: value('GMAIL_USER'),
    // Google shows app passwords with spaces; SMTP needs them removed.
    gmailAppPassword: value('GMAIL_APP_PASSWORD').replace(/\s+/g, ''),
    fromName: optional(env, 'ALERT_FROM_NAME') ?? 'Airport Weather Alerts',
    userAgent: userAgentFor(env),
  };
}
