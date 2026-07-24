import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// super_admin/admin: sets role_override and/or is_active_override on
// admin_accounts, keyed by email now (no single entity id spans both the
// local table and the live source). Upserts rather than requiring the row
// to already exist — an admin can pre-assign a role to a real employee who
// hasn't logged in yet. Ported verbatim from api/update-employee-account.js
// — a plain 'admin' may manage agent/team_leader/admin accounts, but not hr
// or super_admin ones (checked on both the target's current role and the
// role being assigned).
const VALID_ROLES = ['agent', 'team_leader', 'hr', 'admin', 'super_admin'];
const RESTRICTED_ROLES_FOR_ADMIN = ['hr', 'super_admin'];

Deno.serve(async (req) => {
  try {
    const { requesterEmail, targetEmail, role, is_active, _token } = await req.json();
    const requesterEmailLower = (requesterEmail || '').trim().toLowerCase();
    const targetEmailLower = (targetEmail || '').trim().toLowerCase();
    if (!requesterEmailLower || !targetEmailLower) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const automateUrl = Deno.env.get('VITE_AUTOMATE_SUPABASE_URL');
    const serviceKey = Deno.env.get('AUTOMATE_SUPABASE_SERVICE_ROLE_KEY');
    if (!automateUrl || !serviceKey) {
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const supabase = createClient(automateUrl, serviceKey);

    const { data: requesterRows, error: requesterError } = await supabase
      .from('admin_accounts')
      .select('role,role_override,is_active,is_active_override,session_token,last_login')
      .eq('email', requesterEmailLower)
      .limit(1);
    if (requesterError) throw requesterError;
    const requester = requesterRows?.[0];
    if (!requester) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same reasoning as query-supabase.js's requester check: a row that's
    // never completed a real login has never been issued a session_token
    // either, so the null-token leniency below would otherwise let anyone
    // who knows this email act as its (possibly super_admin) role.
    if (!requester.last_login) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.session_token && requester.session_token !== _token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterActive = requester.is_active_override !== null && requester.is_active_override !== undefined
      ? requester.is_active_override
      : requester.is_active;
    const requesterRole = requester.role_override || requester.role;
    if (!requesterActive) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }
    if (requesterRole !== 'super_admin' && requesterRole !== 'admin') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const requesterIsPlainAdmin = requesterRole === 'admin';

    if (requesterEmailLower === targetEmailLower) {
      return Response.json({ error: "Can't change your own role or status here." }, { status: 400 });
    }

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return Response.json({ error: `Invalid role: ${role}` }, { status: 400 });
    }
    if (requesterIsPlainAdmin && role !== undefined && RESTRICTED_ROLES_FOR_ADMIN.includes(role)) {
      return Response.json({ error: 'Only a Super Admin can assign the HR or Super Admin role.' }, { status: 403 });
    }

    const patch = { email: targetEmailLower };
    if (role !== undefined) patch.role_override = role;
    if (is_active !== undefined) patch.is_active_override = is_active;
    if (Object.keys(patch).length === 1) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // A brand-new pre-assignment (no admin_accounts row for this email yet)
    // would otherwise leave session_token null forever until that person's
    // first real login, letting anyone who knows the email act as that role
    // with zero authentication in the meantime. Seeding a random token here
    // closes it without affecting the real employee's own eventual login,
    // which always overwrites session_token with its own fresh value.
    const { data: existingTarget } = await supabase
      .from('admin_accounts')
      .select('email,role,role_override')
      .eq('email', targetEmailLower)
      .limit(1);
    if (!existingTarget?.length) {
      patch.session_token = crypto.randomUUID();
    }

    if (requesterIsPlainAdmin) {
      const targetRow = existingTarget?.[0];
      const targetCurrentRole = (targetRow && (targetRow.role_override || targetRow.role)) || 'agent';
      if (RESTRICTED_ROLES_FOR_ADMIN.includes(targetCurrentRole)) {
        return Response.json({ error: 'Only a Super Admin can modify an HR or Super Admin account.' }, { status: 403 });
      }
    }

    const { error: upsertError } = await supabase.from('admin_accounts').upsert(patch, { onConflict: 'email' });
    if (upsertError) throw upsertError;

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
