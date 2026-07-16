import { createClient } from '@supabase/supabase-js';

// Sales Supabase — main data: bookings_6fbdd6b2, ticket_details_b1d64ca0,
// flight_emails. Fusioo-linked (synced via webhook). Login/RBAC data is
// separate — see the employeeLogin backend function.
const supabaseUrl = import.meta.env.VITE_SALES_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SALES_SUPABASE_ANON_KEY;

// createClient() throws synchronously on a missing/invalid URL. Since this
// module can end up in the main app bundle, that throw would crash every
// route, not just the page that needs Supabase — so fall back to placeholder
// values and warn instead, and only let calls actually fail at request time.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Sales Supabase env vars. Set VITE_SALES_SUPABASE_URL and VITE_SALES_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabaseSales = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
