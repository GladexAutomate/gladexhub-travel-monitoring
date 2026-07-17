import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function effectiveRole(e) {
  return e.role_override || e.role || '';
}
function effectiveActive(e) {
  return e.is_active_override !== null && e.is_active_override !== undefined
    ? e.is_active_override
    : e.is_active;
}

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

    if (!effectiveActive(requester)) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }

    const requesterRole = effectiveRole(requester);
    const allowedRoles = ['admin', 'super_admin', 'team_leader'];
    if (!allowedRoles.includes(requesterRole)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const isAdminLike = requesterRole === 'admin' || requesterRole === 'super_admin';
    const rawAccounts = await base44.asServiceRole.entities.SyncedEmployee.list();

    const accounts = rawAccounts.map((e) => {
      const base = {
        id: e.id,
        full_name: e.full_name,
        role: effectiveRole(e),
        team_name: e.team_name,
        is_active: effectiveActive(e),
      };
      return isAdminLike
        ? { ...base, email: e.email, employee_code: e.employee_code, department: e.department }
        : base;
    });

    return Response.json({ accounts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});