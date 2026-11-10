-- Resending an audited email from the Email audit page.
--
-- The browser cannot send mail, so the admin queues a request here and the
-- alert cycle (secret key) claims it, sends a copy to the original
-- recipients and audits that copy. email_audit stays read-only for the app.

create table public.email_resend_requests (
  id bigint generated always as identity primary key,
  audit_id bigint not null references public.email_audit (id) on delete cascade,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- At most one pending resend per email, so double clicks send one copy.
create unique index email_resend_one_pending
  on public.email_resend_requests (audit_id) where processed_at is null;

alter table public.email_resend_requests enable row level security;

create policy admin_read on public.email_resend_requests
  for select to authenticated using (public.is_admin());
create policy admin_insert on public.email_resend_requests
  for insert to authenticated with check (public.is_admin());

revoke all on public.email_resend_requests from anon;

-- A resent copy points at the first email it repeats.
alter table public.email_audit
  add column resend_of bigint references public.email_audit (id) on delete set null;
