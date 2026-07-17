import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import bcrypt from 'npm:bcryptjs@2.4.3';

// super_admin-only (matching updateEmployeeAccount): generates a new random
// password for an employee, hashes it, and saves it to
// password_override_hash on their SyncedEmployee row — which employeeLogin
// checks before falling back to the API-derived password_hash, and which
// syncEmployeeAccounts never touches. So a reset actually sticks instead of
// being silently overwritten by the next 5-minute sync. The plain-text
// password is returned exactly once in this response and is never stored or
// logged anywhere.
const READABLE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I

function generatePassword(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += READABLE_CHARS[bytes[i] % READABLE_CHARS.length];
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { requesterEmail, targetId } = await req.json();

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
    // Overrides always win — matching updateEmployeeAccount, employeeList,
    // employeeLogin, querySupabase, and validateSession. Checking the raw
    // synced fields here would let a requester deactivated or demoted via
    // override keep this endpoint's access until the next external sync.
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

    const target = await base44.asServiceRole.entities.SyncedEmployee.get(targetId);
    if (!target) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }

    const newPassword = generatePassword();
    const password_override_hash = bcrypt.hashSync(newPassword, 10);

    await base44.asServiceRole.entities.SyncedEmployee.update(targetId, { password_override_hash });

    return Response.json({ password: newPassword });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
