-- Fusioo sync destination tables — new Supabase project ("fusioo",
-- snploarndnyuxapqpegi.supabase.co), created 2026-07-10 specifically to
-- hold data pulled from Fusioo (Booking Transactions, Ticket/Hotel/Tour/
-- Transfer Details), replacing the equivalent tables that used to live in
-- the now-paused Sales project (bookings_6fbdd6b2, ticket_details_b1d64ca0).
--
-- One row per Fusioo record: `id` is Fusioo's own record id (already
-- globally unique, e.g. "i037d30cf..."), `data` is the raw JSON object
-- fetched from https://api.fusioo.com/v3/records/apps/{app_id} verbatim —
-- nothing is dropped or reshaped, since Fusioo's field set varies a lot
-- per transaction type and per app. Query specific fields with ->>'field'.
-- `synced_at` tracks when the sync script last wrote/touched this row.
--
-- Written by the sync script using the service_role key
-- (FUSIOO_SUPABASE_SERVICE_ROLE_KEY) — never the anon key, so there's no
-- anon INSERT/UPDATE/DELETE policy below, only SELECT for the app to read.
--
-- Run this in the "fusioo" Supabase project's SQL Editor.

create table if not exists public.fusioo_booking_transactions (
  id text primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.fusioo_booking_transactions enable row level security;
drop policy if exists "Allow anon read access" on public.fusioo_booking_transactions;
create policy "Allow anon read access" on public.fusioo_booking_transactions
  for select to anon using (true);

create table if not exists public.fusioo_ticket_details (
  id text primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.fusioo_ticket_details enable row level security;
drop policy if exists "Allow anon read access" on public.fusioo_ticket_details;
create policy "Allow anon read access" on public.fusioo_ticket_details
  for select to anon using (true);

create table if not exists public.fusioo_hotel_details (
  id text primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.fusioo_hotel_details enable row level security;
drop policy if exists "Allow anon read access" on public.fusioo_hotel_details;
create policy "Allow anon read access" on public.fusioo_hotel_details
  for select to anon using (true);

create table if not exists public.fusioo_tour_details (
  id text primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.fusioo_tour_details enable row level security;
drop policy if exists "Allow anon read access" on public.fusioo_tour_details;
create policy "Allow anon read access" on public.fusioo_tour_details
  for select to anon using (true);

create table if not exists public.fusioo_transfer_details (
  id text primary key,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.fusioo_transfer_details enable row level security;
drop policy if exists "Allow anon read access" on public.fusioo_transfer_details;
create policy "Allow anon read access" on public.fusioo_transfer_details
  for select to anon using (true);

-- Indexes on frequently-filtered jsonb fields (matches the columns
-- AdminFlightManagement.jsx used to query on bookings_6fbdd6b2/
-- ticket_details_b1d64ca0 — gdx, agent_name/name_of_agent, PNR lookup).
create index if not exists fusioo_booking_transactions_gdx_idx
  on public.fusioo_booking_transactions ((data->>'gdx'));
create index if not exists fusioo_ticket_details_pnr_idx
  on public.fusioo_ticket_details ((data->>'booking_reference_number_pnr'));
