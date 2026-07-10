-- Run this in the Supabase SQL editor (dashboard > SQL Editor > New query).
-- Standalone table, not part of the existing Base44 entity schema. Safe to run
-- on its own; it does not touch any existing table.

create table if not exists public.flight_emails (
  id uuid primary key default gen_random_uuid(),
  airline text,
  booking_ref text,
  email_type text not null check (email_type in ('confirmation', 'reschedule', 'cancellation')),
  flights jsonb not null default '[]'::jsonb,
  received_date timestamptz,
  gmail_message_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists flight_emails_booking_ref_idx on public.flight_emails (booking_ref);
create index if not exists flight_emails_email_type_idx on public.flight_emails (email_type);
create index if not exists flight_emails_received_date_idx on public.flight_emails (received_date desc);

alter table public.flight_emails enable row level security;

-- The admin page reads with the public anon key (this app does not use Supabase
-- Auth sessions, so "authenticated" role checks are not usable here — access to
-- the admin UI itself is gated by the app's own login instead). This policy only
-- allows SELECT; there is deliberately no anon INSERT/UPDATE/DELETE policy.
create policy "Allow anon read access"
  on public.flight_emails
  for select
  to anon
  using (true);

-- No insert/update/delete policy is created for anon/authenticated roles.
-- Google Apps Script writes using the service_role key, which bypasses RLS
-- entirely, so it does not need (and should not have) a policy here.
