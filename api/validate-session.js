import { createClient } from '@supabase/supabase-js';

// Polled every 5 minutes by the frontend (useAuth) to detect deactivation
// without a full page reload. Same live-read-through model as
// employee-login.js — is_active is checked against the real source status
// (or a local override), never a locally cached flag, since admin_accounts
// only ever recorded is_active at the moment a row was created and never
// updates it afterward.
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body || {};
    const trimmed = (email || '').trim().toLowerCase();
    if (!trimmed) {
      return res.status(200).json({ valid: false, reason: 'No email provided' });
    }

    const sourceUrl = process.env.EXTERNAL_ACCOUNTS_SOURCE_URL;
    const sourceKey = process.env.EXTERNAL_ACCOUNTS_SOURCE_KEY_V2;
    const automateUrl = process.env.VITE_AUTOMATE_SUPABASE_URL;
    const serviceKey = process.env.AUTOMATE_SUPABASE_SERVICE_ROLE_KEY;
    if (!sourceUrl || !sourceKey || !automateUrl || !serviceKey) {
      // On technical/config errors, don't log the user out — only explicit
      // deactivation or removal should end a session.
      return res.status(200).json({ valid: true, reason: 'error', error: 'Server configuration error' });
    }

    const supabase = createClient(automateUrl, serviceKey);
    const { data: localRows, error: localError } = await supabase
      .from('admin_accounts')
      .select('role,team_name,role_override,is_active_override')
      .eq('email', trimmed)
      .limit(1);
    if (localError) throw localError;
    const local = localRows?.[0] || null;

    // An explicit admin override to deactivated always wins — no reason to
    // still trust "active" from upstream once an admin has said otherwise,
    // and it saves the live source fetch below.
    if (local && local.is_active_override === false) {
      return res.status(200).json({ valid: false, reason: 'deactivated' });
    }

    const list = await fetchAllEmployeeAccounts(sourceUrl, sourceKey);
    const account = list.find((a) => (a.email || '').trim().toLowerCase() === trimmed);
    if (!account) {
      return res.status(200).json({ valid: false, reason: 'not_found' });
    }

    const isActive = local && local.is_active_override !== null && local.is_active_override !== undefined
      ? local.is_active_override
      : account.status === 'active';
    if (!isActive) {
      return res.status(200).json({ valid: false, reason: 'deactivated' });
    }

    return res.status(200).json({
      valid: true,
      user: {
        name: account.full_name || '',
        email: trimmed,
        employeeCode: account.employee_code || '',
        department: account.job_title || '',
        role: (local && (local.role_override || local.role)) || 'agent',
        team: (local && local.team_name) || '',
      },
    });
  } catch (error) {
    // On technical errors, don't log the user out — only explicit
    // deactivation or removal should end a session.
    return res.status(200).json({ valid: true, reason: 'error', error: error.message });
  }
}
