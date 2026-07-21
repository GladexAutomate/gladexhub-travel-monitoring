import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// ONE-TIME migration bridge — run this ONCE (from Base44, since it's the
// only thing with access to the SyncedEmployee entity) to copy every
// existing employee record, including admin-issued overrides
// (password_override_hash/role_override/is_active_override), into the new
// public.synced_employee Supabase table. Part of moving the Flight Tracker
// backend off Base44 and onto Vercel serverless functions + Supabase
// directly — Base44 becomes a future duplicate/backup, not the live path.
//
// Safe to re-run: upserts on email (the table's unique column), so running
// it again just re-syncs rather than duplicating rows.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const url = Deno.env.get('VITE_AUTOMATE_SUPABASE_URL');
    const key = Deno.env.get('AUTOMATE_SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      return Response.json(
        { error: 'Missing AUTOMATE_SUPABASE_SERVICE_ROLE_KEY (or VITE_AUTOMATE_SUPABASE_URL) — add it as a Base44 secret first (same project as flight_emails/admin_accounts, service_role key, never the anon key — synced_employee has no anon policy at all).' },
        { status: 500 }
      );
    }

    const employees = await base44.asServiceRole.entities.SyncedEmployee.list();

    const supabase = createClient(url, key);
    const rows = employees.map((e) => ({
      email: e.email,
      employee_code: e.employee_code || null,
      full_name: e.full_name || null,
      department: e.department || null,
      role: e.role || null,
      team_name: e.team_name || null,
      is_active: e.is_active !== undefined && e.is_active !== null ? e.is_active : true,
      password_hash: e.password_hash || null,
      password_override_hash: e.password_override_hash || null,
      last_login: e.last_login || null,
      role_override: e.role_override || null,
      is_active_override: e.is_active_override !== undefined ? e.is_active_override : null,
    }));

    const { error } = await supabase.from('synced_employee').upsert(rows, { onConflict: 'email' });
    if (error) throw error;

    return Response.json({ migrated: rows.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
