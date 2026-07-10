import { createClient } from '@supabase/supabase-js';

// Automate Supabase — destination for flight_emails only (parsed by Google
// Apps Script/Gmail, see google-apps-script/Code.gs). ticket_details_b1d64ca0
// and bookings_6fbdd6b2 (GDX/agent lookup) stay on supabaseSales — do not
// confuse the two.
const supabaseUrl = import.meta.env.VITE_AUTOMATE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_AUTOMATE_SUPABASE_ANON_KEY;

// createClient() throws synchronously on a missing/invalid URL. Since this
// module can end up in the main app bundle, that throw would crash every
// route, not just the page that needs Supabase — so fall back to placeholder
// values and warn instead, and only let calls actually fail at request time.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Automate Supabase env vars. Set VITE_AUTOMATE_SUPABASE_URL and VITE_AUTOMATE_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabaseAutomate = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
