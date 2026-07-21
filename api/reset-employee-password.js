import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// super_admin-only: generates a new random password for an employee and
// saves its bcrypt hash to admin_accounts.password_override_hash — checked
// first by employee-login.js, ahead of the real source's password, and
// never touched by anything else, so a reset actually sticks. The
// plain-text password is returned exactly once in this response and is
// never stored or logged anywhere.
const READABLE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I

function generatePassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += READABLE_CHARS[bytes[i] % READABLE_CHARS.length];
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requesterEmail, targetEmail } = req.body || {};
    const requesterEmailLower = (requesterEmail || '').trim().toLowerCase();
    const targetEmailLower = (targetEmail || '').trim().toLowerCase();
    if (!requesterEmailLower || !targetEmailLower) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const automateUrl = process.env.VITE_AUTOMATE_SUPABASE_URL;
    const serviceKey = process.env.AUTOMATE_SUPABASE_SERVICE_ROLE_KEY;
    if (!automateUrl || !serviceKey) {
      return res.status(500).json({ error: 'Server configuration error' });
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
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Overrides always win — matching updateEmployeeAccount/employeeList/
    // employee-login/query-supabase/validate-session. Checking the raw
    // synced fields here would let a requester deactivated or demoted via
    // override keep this endpoint's access.
    const requesterActive = requester.is_active_override !== null && requester.is_active_override !== undefined
      ? requester.is_active_override
      : requester.is_active;
    const requesterRole = requester.role_override || requester.role;
    if (!requesterActive) {
      return res.status(403).json({ error: 'Account deactivated' });
    }
    if (requesterRole !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const newPassword = generatePassword();
    const password_override_hash = bcrypt.hashSync(newPassword, 10);

    const { error: upsertError } = await supabase
      .from('admin_accounts')
      .upsert({ email: targetEmailLower, password_override_hash }, { onConflict: 'email' });
    if (upsertError) throw upsertError;

    return res.status(200).json({ password: newPassword });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
