-- User management: invite-only users with two roles, and a user audit log.
--
-- Roles
--  * admin       everything, including Settings → Users and the user audit.
--  * power_user  everything else: dashboard, alerts, mail groups, email
--                sections and the email audit.
-- Every user must pass MFA (JWT aal = aal2) before any data is returned.
--
-- Users are invited, reset and removed by the manage-users Edge Function,
-- which checks the caller is an admin with MFA, calls the Supabase Auth
-- admin API (emails go out through the Auth SMTP settings: the same Gmail
-- account as the alerts) and writes the user audit with the secret key.
--
-- The browser never sees passwords or MFA secrets: list_app_users() returns
-- only the email, role and status flags.

-- ------------------------------------------------------------- app users
-- The old single-admin table becomes the user list; existing rows are admins.
alter table public.admins rename to app_users;
alter table public.app_users
  add column role text not null default 'admin'
    check (role in ('admin', 'power_user'));
alter table public.app_users alter column role drop default;

-- True for any listed user (either role) who has passed MFA.
create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.app_users u where u.user_id = auth.uid());
$$;

-- True only for a full admin who has passed MFA.
create or replace function public.is_full_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.app_users u
       where u.user_id = auth.uid() and u.role = 'admin'
     );
$$;

-- The caller's role, or null when they are not a user of this app. Works
-- before MFA so the sign-in screens can tell a stranger apart early.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.app_users u where u.user_id = auth.uid();
$$;

revoke all on function public.has_app_access() from public;
revoke all on function public.is_full_admin() from public;
revoke all on function public.my_role() from public;
grant execute on function public.has_app_access() to authenticated;
grant execute on function public.is_full_admin() to authenticated;
grant execute on function public.my_role() to authenticated;

-- Existing policies now admit both roles.
alter policy admin_read on public.observations using (public.has_app_access());
alter policy admin_read on public.forecasts using (public.has_app_access());
alter policy admin_read on public.warnings using (public.has_app_access());
alter policy admin_read on public.feed_log using (public.has_app_access());
alter policy admin_read on public.alerts using (public.has_app_access());
alter policy admin_read on public.email_audit using (public.has_app_access());
alter policy admin_all on public.mail_groups
  using (public.has_app_access()) with check (public.has_app_access());
alter policy admin_all on public.group_members
  using (public.has_app_access()) with check (public.has_app_access());
alter policy admin_all on public.email_sections
  using (public.has_app_access()) with check (public.has_app_access());
alter policy admin_read on public.email_resend_requests
  using (public.has_app_access());
alter policy admin_insert on public.email_resend_requests
  with check (public.has_app_access());

-- Replaced by has_app_access(); redeploy trigger-alert-cycle with this change.
drop function public.is_admin();

-- There must always be at least one admin. manage-users already stops
-- admins acting on themselves; this also covers two admins demoting or
-- removing each other at the same moment. The advisory lock makes such
-- changes take turns, and the count (a new snapshot under READ COMMITTED)
-- then sees the other's committed change.
create or replace function public.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.app_users.admins'));
  if not exists (select 1 from public.app_users u where u.role = 'admin') then
    raise exception 'There must always be at least one admin.'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;
revoke all on function public.keep_one_admin() from public;

create trigger keep_one_admin
  after update of role or delete on public.app_users
  for each row execute function public.keep_one_admin();

-- app_users itself: admins may read it; changes go through manage-users.
create policy admin_read on public.app_users
  for select to authenticated using (public.is_full_admin());
revoke all on public.app_users from anon;

-- ------------------------------------------------------------ user audit
create table public.user_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  action text not null check (action in (
    'user_invited', 'user_removed', 'role_changed', 'password_reset_sent',
    'password_changed', 'mfa_reset', 'email_confirmed'
  )),
  -- Emails are copied in so the trail survives the user being removed.
  actor_email text,
  target_email text not null,
  detail text
);
create index user_audit_recent on public.user_audit (occurred_at desc);

alter table public.user_audit enable row level security;
-- Read-only for admins: no insert, update or delete policy.
create policy admin_read on public.user_audit
  for select to authenticated using (public.is_full_admin());
revoke all on public.user_audit from anon;

-- Records what users do to their own account: confirming the invite email
-- and setting or changing their password. Admin actions are recorded by
-- manage-users.
create or replace function public.audit_auth_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_users u where u.user_id = new.id) then
    return new;
  end if;
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    insert into public.user_audit (action, actor_email, target_email, detail)
    values ('email_confirmed', new.email, new.email, 'Accepted the invitation');
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.user_audit (action, actor_email, target_email, detail)
    values (
      'password_changed', new.email, new.email,
      case when coalesce(old.encrypted_password, '') = ''
        then 'Set their first password' else 'Changed their password' end
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_auth_user_update() from public;

create trigger audit_auth_user_update
  after update of email_confirmed_at, encrypted_password on auth.users
  for each row execute function public.audit_auth_user_update();

-- ------------------------------------------------------- listing users
-- Users for Settings → Users: email, role and status only, never secrets.
create or replace function public.list_app_users()
returns table (
  user_id uuid,
  email text,
  role text,
  invited_at timestamptz,
  email_confirmed boolean,
  mfa_enrolled boolean,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_full_admin() then
    raise exception 'Only an admin can list users.' using errcode = '42501';
  end if;
  return query
    select
      u.user_id,
      au.email::text,
      u.role,
      u.created_at,
      au.email_confirmed_at is not null,
      exists (
        select 1 from auth.mfa_factors f
        where f.user_id = u.user_id and f.status = 'verified'
      ),
      au.last_sign_in_at
    from public.app_users u
    join auth.users au on au.id = u.user_id
    order by lower(au.email::text);
end;
$$;
revoke all on function public.list_app_users() from public;
grant execute on function public.list_app_users() to authenticated;
