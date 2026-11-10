// Supabase Edge Function (Deno): user management for Settings → Users.
//
// Only a full admin signed in with MFA may call it: the caller's JWT must
// pass public.is_full_admin(), the same check row-level security uses.
// Every action is written to public.user_audit.
//
// Actions (POST JSON body):
//   {action: 'invite', email, role}   invite email, then the user sets a
//                                     password and enrols an authenticator
//   {action: 'reset_password', userId} password reset email
//   {action: 'reset_mfa', userId}     removes their authenticator; they set
//                                     up a new one at next sign-in
//   {action: 'set_role', userId, role}
//   {action: 'remove', userId}        deletes the account
//
// Invite and reset emails are sent by Supabase Auth through its SMTP
// settings, which use the same Gmail account as the alerts (docs/SETUP.md).
// The links go to the Auth "Site URL" (the GitHub Pages app).
//
// Secrets: ALLOWED_ORIGIN (same as trigger-alert-cycle). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy with --no-verify-jwt; the function checks the JWT itself.

import {createClient, type SupabaseClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders, json, originConfigured} from '../_shared/http.ts';

const ROLES = ['admin', 'power_user'] as const;
type Role = (typeof ROLES)[number];
const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  power_user: 'Power user',
};

type Action =
  | {action: 'invite'; email: string; role: Role}
  | {action: 'reset_password'; userId: string}
  | {action: 'reset_mfa'; userId: string}
  | {action: 'set_role'; userId: string; role: Role}
  | {action: 'remove'; userId: string};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** SQLSTATE raised by the app_users "keep one admin" trigger. */
const LAST_ADMIN = 'P0001';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRole(value: unknown): Role {
  if (ROLES.includes(value as Role)) return value as Role;
  throw new HttpError(400, 'Choose a role: Admin or Power user.');
}

function asUserId(value: unknown): string {
  if (typeof value === 'string' && UUID.test(value)) return value;
  throw new HttpError(400, 'Unknown user.');
}

/** Checks the request body; throws a 400 for anything unexpected. */
function parseAction(body: Record<string, unknown>): Action {
  switch (body.action) {
    case 'invite': {
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase();
      if (email.length > 254 || !EMAIL.test(email)) {
        throw new HttpError(400, 'Enter a valid email address.');
      }
      return {action: 'invite', email, role: asRole(body.role)};
    }
    case 'set_role':
      return {
        action: 'set_role',
        userId: asUserId(body.userId),
        role: asRole(body.role),
      };
    case 'reset_password':
    case 'reset_mfa':
    case 'remove':
      return {action: body.action, userId: asUserId(body.userId)};
    default:
      throw new HttpError(400, 'Unknown action.');
  }
}

interface Caller {
  id: string;
  email: string;
}

/** The signed-in caller, if they are a full admin with MFA. */
async function adminCaller(authorization: string): Promise<Caller> {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {global: {headers: {Authorization: authorization}}},
  );
  // An Edge Function client holds no session, so getUser() must be given
  // the caller's JWT; without it every caller would look signed out.
  const token = authorization.replace(/^Bearer\s+/i, '');
  const [{data: isAdmin, error}, {data: user}] = await Promise.all([
    sb.rpc('is_full_admin'),
    sb.auth.getUser(token),
  ]);
  if (error !== null || isAdmin !== true || user.user === null) {
    throw new HttpError(403, 'Only an admin can manage users.');
  }
  return {id: user.user.id, email: user.user.email ?? ''};
}

class UserManager {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly caller: Caller,
  ) {}

  async run(action: Action): Promise<void> {
    switch (action.action) {
      case 'invite':
        return await this.invite(action.email, action.role);
      case 'reset_password':
        return await this.resetPassword(action.userId);
      case 'reset_mfa':
        return await this.resetMfa(action.userId);
      case 'set_role':
        return await this.setRole(action.userId, action.role);
      case 'remove':
        return await this.remove(action.userId);
    }
  }

  private async invite(email: string, role: Role): Promise<void> {
    const {data, error} = await this.sb.auth.admin.inviteUserByEmail(email);
    if (error !== null) {
      const exists = error.code === 'email_exists';
      throw new HttpError(
        exists ? 409 : 502,
        exists
          ? 'That email already has an account.'
          : `The invitation could not be sent: ${error.message}`,
      );
    }
    const inserted = await this.sb
      .from('app_users')
      .insert({user_id: data.user.id, role});
    if (inserted.error !== null) {
      // Don't leave an auth user who can't use the app.
      await this.sb.auth.admin.deleteUser(data.user.id);
      throw new HttpError(500, inserted.error.message);
    }
    await this.audit('user_invited', email, `Invited as ${ROLE_LABELS[role]}`);
  }

  private async resetPassword(userId: string): Promise<void> {
    const email = await this.emailOf(userId);
    const {error} = await this.sb.auth.resetPasswordForEmail(email);
    if (error !== null) {
      throw new HttpError(
        502,
        `The reset email could not be sent: ${error.message}`,
      );
    }
    await this.audit('password_reset_sent', email, 'Password reset email sent');
  }

  private async resetMfa(userId: string): Promise<void> {
    const email = await this.emailOf(userId);
    const {data, error} = await this.sb.auth.admin.mfa.listFactors({userId});
    if (error !== null) throw new HttpError(500, error.message);
    for (const factor of data.factors) {
      const removed = await this.sb.auth.admin.mfa.deleteFactor({
        userId,
        id: factor.id,
      });
      if (removed.error !== null) {
        throw new HttpError(500, removed.error.message);
      }
    }
    await this.audit(
      'mfa_reset',
      email,
      'Authenticator removed; set up again at next sign-in',
    );
  }

  private async setRole(userId: string, role: Role): Promise<void> {
    this.refuseSelf(userId, 'You cannot change your own role.');
    const email = await this.emailOf(userId);
    const {error} = await this.sb
      .from('app_users')
      .update({role})
      .eq('user_id', userId);
    if (error !== null) {
      // The last-admin trigger: show its message rather than a 500.
      if (error.code === LAST_ADMIN) throw new HttpError(409, error.message);
      throw new HttpError(500, error.message);
    }
    await this.audit('role_changed', email, `Role set to ${ROLE_LABELS[role]}`);
  }

  private async remove(userId: string): Promise<void> {
    this.refuseSelf(userId, 'You cannot remove your own account.');
    const email = await this.emailOf(userId);
    const {error} = await this.sb.auth.admin.deleteUser(userId);
    if (error !== null) throw new HttpError(500, error.message);
    await this.audit('user_removed', email, 'Account deleted');
  }

  /** Acting on yourself could leave the app with no admin. */
  private refuseSelf(userId: string, message: string): void {
    if (userId === this.caller.id) throw new HttpError(400, message);
  }

  /** Email of a user of this app; 404 for anyone else. */
  private async emailOf(userId: string): Promise<string> {
    const listed = await this.sb
      .from('app_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (listed.data === null) throw new HttpError(404, 'Unknown user.');
    const {data, error} = await this.sb.auth.admin.getUserById(userId);
    if (error !== null || !data.user.email) {
      throw new HttpError(404, 'Unknown user.');
    }
    return data.user.email;
  }

  private async audit(
    action: string,
    targetEmail: string,
    detail: string,
  ): Promise<void> {
    const {error} = await this.sb.from('user_audit').insert({
      action,
      actor_email: this.caller.email,
      target_email: targetEmail,
      detail,
    });
    // The change itself worked, so report the audit failure in the logs only.
    if (error !== null) console.error('user_audit insert failed', error);
  }
}

async function handle(req: Request): Promise<Response> {
  const authorization = req.headers.get('Authorization');
  if (authorization === null) {
    throw new HttpError(401, 'Sign in first.');
  }
  const caller = await adminCaller(authorization);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Send a JSON object.');
  }
  const action = parseAction(body as Record<string, unknown>);
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {auth: {persistSession: false, autoRefreshToken: false}},
  );
  await new UserManager(service, caller).run(action);
  return json(200, {ok: true});
}

Deno.serve(async (req) => {
  if (!originConfigured()) {
    console.error('ALLOWED_ORIGIN is not set; refusing all requests.');
    return json(500, {
      error:
        'User management is not set up on the server yet. See docs/SETUP.md.',
    });
  }
  if (req.method === 'OPTIONS')
    return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return json(405, {error: 'Use POST.'});
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, {error: e.message});
    console.error('manage-users failed', e);
    return json(500, {error: 'Something went wrong. Try again.'});
  }
});
