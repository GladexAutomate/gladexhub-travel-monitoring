-- Run this in the AUTOMATE Supabase project's SQL Editor (the new project
-- meant to receive parsed flight emails from Google Apps Script/Gmail,
-- replacing the Sales project as that destination). Sales keeps ticket_details
-- and bookings_6fbdd6b2 (GDX/agent data) untouched — only flight_emails moves.
--
-- Schema copied from the Sales project's existing flight_emails table so the
-- frontend (AdminFlightManagement.jsx) and Google Apps Script's
-- saveToSupabase_ (google-apps-script/Code.gs) keep working unchanged once
-- pointed at this project instead.

create table if not exists public.flight_emails (
  id uuid primary key default gen_random_uuid(),
  airline text,
  booking_ref text,
  email_type text,
  flights jsonb,
  received_date timestamptz,
  gmail_message_id text,
  created_at timestamptz not null default now()
);

-- Code.gs upserts with ?on_conflict=gmail_message_id&ignore-duplicates — this
-- unique index is what makes that ON CONFLICT DO NOTHING actually work
-- (without it, every re-run of fetchNewEmails would insert duplicate rows).
create unique index if not exists flight_emails_gmail_message_id_idx
  on public.flight_emails (gmail_message_id);

create index if not exists flight_emails_booking_ref_idx on public.flight_emails (booking_ref);

alter table public.flight_emails enable row level security;

-- Frontend reads with the anon key; writes only ever come from Google Apps
-- Script using the service_role key (which bypasses RLS entirely), so there's
-- deliberately no anon INSERT/UPDATE/DELETE policy here.
drop policy if exists "Allow anon read access" on public.flight_emails;
create policy "Allow anon read access"
  on public.flight_emails
  for select
  to anon
  using (true);
