-- 1. Email sections per phase: each alert level (info, watch, warning,
--    stand-down) and the all-clear gets its own icon, title and guidance.
-- 2. Admin-editable alert thresholds.

-- ------------------------------------------------------- email sections
-- Existing rows were edits for every level, so they become the watch row
-- and are copied to the other levels. The all-clear copy gets no guidance,
-- because all-clear emails did not show any before; so emails built from
-- edited sections stay exactly as they were.
alter table public.email_sections
  add column phase text not null default 'watch'
    check (phase in ('info', 'watch', 'warning', 'standdown', 'cleared'));
alter table public.email_sections drop constraint email_sections_pkey;
alter table public.email_sections add primary key (category, phase);

insert into public.email_sections (category, phase, icon, title, guidance, updated_at)
select s.category,
       p.phase,
       s.icon,
       s.title,
       case when p.phase = 'cleared' then '' else s.guidance end,
       s.updated_at
from public.email_sections s
cross join (values ('info'), ('warning'), ('standdown'), ('cleared')) as p (phase)
where s.phase = 'watch';

alter table public.email_sections alter column phase drop default;

-- ------------------------------------------------------ alert thresholds
-- One row per measured category. A null limit means the category never
-- reaches that level. A category with no row uses DEFAULT_THRESHOLDS in
-- src/domain/thresholds.ts, so this table starts empty. The app checks that
-- each more severe level needs a more extreme reading.
create table public.alert_thresholds (
  category text primary key
    check (category in ('wind', 'visibility', 'heat', 'uv')),
  info numeric check (info >= 0),
  watch numeric check (watch >= 0),
  warning numeric check (warning >= 0),
  standdown numeric check (standdown >= 0),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(info, watch, warning, standdown) > 0)
);

alter table public.alert_thresholds enable row level security;

-- Every user may read them (mail groups describe each trigger); only a full
-- admin may change when alerts go out. The job reads with the secret key.
create policy app_read on public.alert_thresholds for select to authenticated
  using (public.has_app_access());
create policy admin_insert on public.alert_thresholds for insert to authenticated
  with check (public.is_full_admin());
create policy admin_update on public.alert_thresholds for update to authenticated
  using (public.is_full_admin()) with check (public.is_full_admin());
create policy admin_delete on public.alert_thresholds for delete to authenticated
  using (public.is_full_admin());

revoke all on public.alert_thresholds from anon;
