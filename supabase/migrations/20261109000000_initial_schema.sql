-- Airport Weather Alert App: initial schema.
--
-- Security model
--  * Public sign-up is disabled in Supabase Auth; one admin user exists.
--  * That user's id is listed in public.admins (see docs/SETUP.md).
--  * Every table has row level security. The browser (publishable key) can
--    only reach data when the caller is a listed admin AND has passed MFA
--    (JWT aal = aal2).
--  * The scheduled job uses the secret key, which bypasses RLS. That key is
--    stored only in GitHub Actions secrets.
--  * email_audit has no insert/update/delete policy, so the audit trail is
--    read-only from the app.

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------ weather data
create table public.observations (
  id bigint generated always as identity primary key,
  airport text not null,
  observed_at timestamptz not null,
  raw_metar text not null,
  wind_dir_deg integer,
  wind_kt integer not null,
  gust_kt integer,
  visibility_m integer,
  weather_codes text not null default '',
  cloud text not null default '',
  temp_c numeric,
  dewpoint_c numeric,
  qnh_hpa numeric,
  apparent_temp_c numeric,
  uv_index numeric,
  fetched_at timestamptz not null default now(),
  unique (airport, observed_at)
);
create index observations_latest on public.observations (airport, observed_at desc);

create table public.forecasts (
  airport text primary key,
  issued_at timestamptz not null,
  raw_taf text,
  hours jsonb not null default '[]'::jsonb,
  hours_fetched_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.warnings (
  id text primary key,
  airport text not null,
  kind text not null check (kind in ('thunderstorm', 'cyclone')),
  level text not null check (level in ('info', 'watch', 'warning', 'standdown')),
  headline text not null,
  issued_at timestamptz not null,
  expires_at timestamptz
);

create table public.feed_log (
  id bigint generated always as identity primary key,
  source text not null,
  run_at timestamptz not null default now(),
  ok boolean not null,
  records integer not null default 0,
  error text
);
create index feed_log_recent on public.feed_log (source, run_at desc);

-- ------------------------------------------------------------------ alerts
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  airport text not null,
  category text not null,
  level text not null check (level in ('info', 'watch', 'warning', 'standdown')),
  peak_level text not null check (peak_level in ('info', 'watch', 'warning', 'standdown')),
  status text not null default 'active' check (status in ('active', 'cleared')),
  trigger_value text not null,
  message text not null,
  started_at timestamptz not null,
  updated_at timestamptz not null,
  cleared_at timestamptz,
  below_since timestamptz
);
-- One active alert per airport and rule.
create unique index alerts_one_active on public.alerts (airport, category)
  where status = 'active';
create index alerts_history on public.alerts (started_at desc);

-- -------------------------------------------------------------- mail groups
create table public.mail_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 80),
  enabled boolean not null default true,
  airports text[] not null default array['YBBN', 'YBCS'],
  categories text[] not null
    default array['wind', 'thunderstorm', 'cyclone', 'visibility', 'heat'],
  min_level text not null default 'watch'
    check (min_level in ('info', 'watch', 'warning', 'standdown')),
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.mail_groups (id) on delete cascade,
  email text not null
    check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);
create unique index group_members_unique on public.group_members (group_id, lower(email));

-- ------------------------------------------------------------- email audit
create table public.email_audit (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  group_id uuid references public.mail_groups (id) on delete set null,
  group_name text not null,
  recipients text[] not null,
  subject text not null,
  body text not null,
  alert_id uuid references public.alerts (id) on delete set null,
  airport text,
  category text,
  level text,
  event text not null check (event in ('raised', 'escalated', 'cleared')),
  status text not null check (status in ('sent', 'failed')),
  error text,
  message_id text
);
create index email_audit_recent on public.email_audit (sent_at desc);

-- ---------------------------------------------------------- row security
alter table public.observations enable row level security;
alter table public.forecasts enable row level security;
alter table public.warnings enable row level security;
alter table public.feed_log enable row level security;
alter table public.alerts enable row level security;
alter table public.mail_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.email_audit enable row level security;

-- Read-only for the admin.
create policy admin_read on public.observations for select to authenticated using (public.is_admin());
create policy admin_read on public.forecasts for select to authenticated using (public.is_admin());
create policy admin_read on public.warnings for select to authenticated using (public.is_admin());
create policy admin_read on public.feed_log for select to authenticated using (public.is_admin());
create policy admin_read on public.alerts for select to authenticated using (public.is_admin());
create policy admin_read on public.email_audit for select to authenticated using (public.is_admin());

-- Full control of mail groups for the admin.
create policy admin_all on public.mail_groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.group_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Nothing at all for anonymous callers.
revoke all on all tables in schema public from anon;
