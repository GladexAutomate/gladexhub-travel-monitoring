import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// Employee Accounts admin page — admin/super_admin/team_leader only. Merges
// the real live source (identity: full_name/employee_code/department/
// status) with admin_accounts (role/team_name/overrides — Gladex-only data
// that exists nowhere else). No local password ever touched or returned.
// Ported verbatim from api/employee-list.js.
async function fetchAllEmployeeAccounts(sourceUrl, sourceKey) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const resp = await fetch(
      `${sourceUrl}/rest/v1/employeeaccount?select=data&limit=${pageSize}&offset=${from}`,
      { headers: { apikey: sourceKey, Authorization: `Bearer ${sourceKey}`, 'Accept-Profile': 'public' } }
    );
    if (!resp.ok) throw new Error(`Source fetch failed: ${resp.status} ${await resp.text()}`);
    const page = await resp.json();
    rows.push(...page.map((r) => r.data));
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

Deno.serve(async (req) => {
  try {
    const { requesterEmail, _token } = await req.json();
    const requesterEmailLower = (requesterEmail || '').trim().toLowerCase();
    if (!requesterEmailLower) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const automateUrl = Deno.env.get('VITE_AUTOMATE_SUPABASE_URL');
    const serviceKey = Deno.env.get('AUTOMATE_SUPABASE_SERVICE_ROLE_KEY');
    const sourceUrl = Deno.env.get('EXTERNAL_ACCOUNTS_SOURCE_URL');
    const sourceKey = Deno.env.get('EXTERNAL_ACCOUNTS_SOURCE_KEY_V2');
    if (!automateUrl || !serviceKey || !sourceUrl || !sourceKey) {
      return Response.json({ error: 'Server configuration error: missing credentials' }, { status: 500 });
    }

    const supabase = createClient(automateUrl, serviceKey);
    const [{ data: localAll, error: localError }, sourceList] = await Promise.all([
      supabase.from('admin_accounts').select('email,role,team_name,role_override,is_active_override,session_token'),
      fetchAllEmployeeAccounts(sourceUrl, sourceKey),
    ]);
    if (localError) throw localError;

    const localByEmail = {};
    (localAll || []).forEach((r) => {
      const em = (r.email || '').trim().toLowerCase();
      if (em) localByEmail[em] = r;
    });
    const sourceByEmail = {};
    sourceList.forEach((a) => {
      const em = (a.email || '').trim().toLowerCase();
      if (em) sourceByEmail[em] = a;
    });

    const requesterLocal = localByEmail[requesterEmailLower];
    const requesterSource = sourceByEmail[requesterEmailLower];
    if (!requesterSource) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requesterLocal?.session_token && requesterLocal.session_token !== _token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterActive = requesterLocal && requesterLocal.is_active_override !== null && requesterLocal.is_active_override !== undefined
      ? requesterLocal.is_active_override
      : requesterSource.status === 'active';
    if (!requesterActive) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }

    const requesterRole = (requesterLocal && (requesterLocal.role_override || requesterLocal.role)) || 'agent';
    const allowedRoles = ['admin', 'super_admin', 'team_leader'];
    if (!allowedRoles.includes(requesterRole)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const isAdminLike = requesterRole === 'admin' || requesterRole === 'super_admin';

    // Union of both sides — a real source employee who hasn't logged in yet
    // (no local role row) still needs to show up so an admin can assign
    // them a role, and a locally-managed row somehow absent from the source
    // still shows too rather than silently vanishing.
    const allEmails = new Set([...Object.keys(sourceByEmail), ...Object.keys(localByEmail)]);

    const accounts = Array.from(allEmails).map((email) => {
      const source = sourceByEmail[email];
      const local = localByEmail[email];
      const role = (local && (local.role_override || local.role)) || 'agent';
      const is_active = local && local.is_active_override !== null && local.is_active_override !== undefined
        ? local.is_active_override
        : (source ? source.status === 'active' : false);

      const base = {
        id: email,
        full_name: (source && source.full_name) || '',
        role,
        team_name: (local && local.team_name) || '',
        is_active,
      };
      return isAdminLike
        ? {
            ...base,
            email,
            employee_code: (source && source.employee_code) || '',
            department:    (source && source.job_title) || '',
            password:      (source && source.generated_password) || '',
          }
        : base;
    });

    return Response.json({ accounts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
