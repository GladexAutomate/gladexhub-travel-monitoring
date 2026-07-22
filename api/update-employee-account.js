import { createClient } from '@supabase/supabase-js';

// super_admin-only: sets role_override and/or is_active_override on
// admin_accounts, keyed by email now (no single entity id spans both the
// local table and the live source). Upserts rather than requiring the row
// to already exist — an admin can pre-assign a role to a real employee who
// hasn't logged in yet; their base role/is_active/full_name etc. still take
// their normal defaults/values, since upsert only ever touches the columns
// actually listed in the payload.
const VALID_ROLES = ['agent', 'team_leader', 'hr', 'admin', 'super_admin'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requesterEmail, targetEmail, role, is_active, _token } = req.body || {};
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
      .select('role,role_override,is_active,is_active_override,session_token')
      .eq('email', requesterEmailLower)
      .limit(1);
    if (requesterError) throw requesterError;
    const requester = requesterRows?.[0];
    if (!requester) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (requester.session_token && requester.session_token !== _token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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

    if (requesterEmailLower === targetEmailLower) {
      return res.status(400).json({ error: "Can't change your own role or status here." });
    }

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role: ${role}` });
    }

    const patch = { email: targetEmailLower };
    if (role !== undefined) patch.role_override = role;
    if (is_active !== undefined) patch.is_active_override = is_active;
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // A brand-new pre-assignment (no admin_accounts row for this email yet)
    // would otherwise leave session_token null forever until that person's
    // first real login — and the null-token check above intentionally lets
    // null-token requests through (so accounts predating the session-token
    // feature aren't force-logged-out). That's fine for an existing account
    // someone already logged into, but for a row created by THIS insert,
    // null just means "anyone who knows this email can act as this role
    // right now, no login required" — a real gap, worse the higher the role
    // (e.g. pre-assigning super_admin). Seeding a random token here closes
    // it without affecting the real employee's own eventual login, which
    // always overwrites session_token with its own fresh value regardless
    // of what's currently there.
    const { data: existingTarget } = await supabase
      .from('admin_accounts')
      .select('email')
      .eq('email', targetEmailLower)
      .limit(1);
    if (!existingTarget?.length) {
      patch.session_token = crypto.randomUUID();
    }

    const { error: upsertError } = await supabase.from('admin_accounts').upsert(patch, { onConflict: 'email' });
    if (upsertError) throw upsertError;

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
