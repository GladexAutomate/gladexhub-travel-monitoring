import { createClient } from '@supabase/supabase-js';

// Fusioo data mirror — destination for Booking Transactions/Ticket/Hotel/
// Tour/Transfer Details pulled from the Fusioo API (see the fusioo_sync_schema.sql
// migration and the backfill scripts that populated it). Used by
// AdminFlightManagement.jsx to resolve which agent/team a flight email
// belongs to, replacing the old ticket_details_b1d64ca0/bookings_6fbdd6b2
// lookup on supabaseSales (Sales project is paused — see git history).
const supabaseUrl = import.meta.env.VITE_FUSIOO_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_FUSIOO_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Fusioo Supabase env vars. Set VITE_FUSIOO_SUPABASE_URL and VITE_FUSIOO_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabaseFusioo = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);