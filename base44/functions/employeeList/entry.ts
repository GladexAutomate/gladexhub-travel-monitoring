import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns the employee list from the synced cache (not the API directly),
// so it's fast and doesn't expose the API key or password hashes.
// Permission-checked: only admin/super_admin/team_leader can call it.
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

    const accounts = await base44.asServiceRole.entities.SyncedEmployee.list();

    return Response.json({ accounts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});