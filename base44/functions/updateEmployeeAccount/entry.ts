import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_ROLES = ['agent', 'team_leader', 'hr', 'admin', 'super_admin'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { requesterEmail, targetId, role, is_active } = await req.json();

    const requesterEmailLower = (requesterEmail || '').trim().toLowerCase();
    if (!requesterEmailLower || !targetId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterRows = await base44.asServiceRole.entities.SyncedEmployee.filter({
      email: requesterEmailLower,
    });
    const requester = requesterRows[0];
    if (!requester) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const requesterActive = requester.is_active_override !== null && requester.is_active_override !== undefined
      ? requester.is_active_override
      : requester.is_active;
    const requesterRole = requester.role_override || requester.role;
    if (!requesterActive) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }
    if (requesterRole !== 'super_admin') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (requester.id === targetId) {
      return Response.json({ error: "Can't change your own role or status here." }, { status: 400 });
    }

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return Response.json({ error: `Invalid role: ${role}` }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.SyncedEmployee.get(targetId);
    if (!target) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }

    const patch = {};
    if (role !== undefined) patch.role_override = role;
    if (is_active !== undefined) patch.is_active_override = is_active;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await base44.asServiceRole.entities.SyncedEmployee.update(targetId, patch);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});