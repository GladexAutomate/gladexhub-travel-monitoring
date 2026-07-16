import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import bcrypt from 'npm:bcryptjs@2.4.3';

const READABLE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I

function generatePassword(length = 10) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += READABLE_CHARS[Math.floor(Math.random() * READABLE_CHARS.length)];
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
    if (!requester.is_active) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }
    if (requester.role !== 'admin' && requester.role !== 'super_admin') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    let target;
    try {
      target = await base44.asServiceRole.entities.SyncedEmployee.get(targetId);
    } catch (e) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }
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