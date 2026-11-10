-- Admin-editable parts of the alert email, one row per category.
-- A category with no row uses the built-in defaults in
-- src/domain/email_sections.ts, so this table starts empty.

create table public.email_sections (
  category text primary key
    check (category in ('wind', 'thunderstorm', 'visibility', 'heat', 'uv', 'cyclone', 'data_stale')),
  -- Keep in step with EMAIL_ICONS in src/domain/email_sections.ts (a test checks).
  icon text not null check (icon in (
    '💨', '🌬️', '🚩', '⛈️', '⚡', '🌩️', '🌫️', '👁️', '🌡️', '🔥', '🥵', '☀️', '😎', '🧴', '🌀', '🌪️', '🌊', '⏱️', '⚠️', '✈️'
  )),
  title text not null check (char_length(trim(title)) between 1 and 60),
  guidance text not null default '' check (char_length(guidance) <= 600),
  updated_at timestamptz not null default now()
);

alter table public.email_sections enable row level security;

-- Full control for the admin (after MFA); the job reads with the secret key.
create policy admin_all on public.email_sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.email_sections from anon;
