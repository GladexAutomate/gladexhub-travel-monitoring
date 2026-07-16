import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns the employee list from the synced cache (not the API directly),
// so it's fast and doesn't expose the API key. Permission-checked: only
// admin/super_admin/team_leader can call it. password_hash is never
// returned, and a team_leader caller (who doesn't need other employees'
// PII, only name/role/team for grouping labels) gets a reduced projection
// — full contact/employee-code details are admin/super_admin-only.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { requesterEmail } = await req.json();

    const requesterEmailLower = (requesterEmail || '').trim().toLowerCase();
    if (!requesterEmailLower) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterRows = await base44.asServiceRole.entities.SyncedEmployee.filter({
      email: requesterEmailLower,
    });

    const requester = requesterRows[0];
    if (!requester) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requester.is_active) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }

    const allowedRoles = ['admin', 'super_admin', 'team_leader'];
    if (!allowedRoles.includes(requester.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const isAdminLike = requester.role === 'admin' || requester.role === 'super_admin';
    const rawAccounts = await base44.asServiceRole.entities.SyncedEmployee.list();

    const accounts = rawAccounts.map((e) => {
      const base = { id: e.id, full_name: e.full_name, role: e.role, team_name: e.team_name, is_active: e.is_active };
      return isAdminLike
        ? { ...base, email: e.email, employee_code: e.employee_code, department: e.department }
        : base;
    });

    return Response.json({ accounts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});