import { createClient } from '@supabase/supabase-js';

// Accounts client — currently the SAME underlying Supabase project as
// supabaseSales.js (no separate Accounts project with dashboard/SQL access
// exists yet), used only for the admin_accounts table (login credentials +
// role/team for RBAC). Never fetch flight/booking data through this client,
// and never fetch account/login data through supabaseSales — kept as
// separate clients/concerns even while they point at the same project, so
// swapping VITE_ACCOUNTS_SUPABASE_URL/KEY to a real separate project later
// is a one-line env change, not a code change.
const supabaseUrl = import.meta.env.VITE_ACCOUNTS_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_ACCOUNTS_SUPABASE_ANON_KEY;

// createClient() throws synchronously on a missing/invalid URL. Since this
// module can end up in the main app bundle, that throw would crash every
// route, not just the page that needs it — so fall back to placeholder
// values and warn instead, and only let calls actually fail at request time.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Accounts Supabase env vars. Set VITE_ACCOUNTS_SUPABASE_URL and VITE_ACCOUNTS_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabaseAccounts = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
