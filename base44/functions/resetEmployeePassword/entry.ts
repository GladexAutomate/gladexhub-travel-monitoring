import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import bcrypt from 'npm:bcryptjs@2.4.3';

// super_admin-only: generates a new random password for an employee and
// saves its bcrypt hash to admin_accounts.password_override_hash — checked
// first by employeeLogin, ahead of the real source's password, and never
// touched by anything else, so a reset actually sticks. The plain-text
// password is returned exactly once in this response and is never stored
// or logged anywhere. Ported verbatim from api/reset-employee-password.js.
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
    const { requesterEmail, targetEmail } = await req.json();
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
      .select('role,role_override,is_active,is_active_override')
      .eq('email', requesterEmailLower)
      .limit(1);
    if (requesterError) throw requesterError;
    const requester = requesterRows?.[0];
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

    const newPassword = generatePassword();
    const password_override_hash = bcrypt.hashSync(newPassword, 10);

    const { error: upsertError } = await supabase
      .from('admin_accounts')
      .upsert({ email: targetEmailLower, password_override_hash }, { onConflict: 'email' });
    if (upsertError) throw upsertError;

    return Response.json({ password: newPassword });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
