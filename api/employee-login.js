import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// Employee login — reads live from the boss's own real 'employeeaccount'
// database on every attempt. No password is ever stored or cached in our
// own database; only role/team_name live locally in admin_accounts, since
// that assignment doesn't exist anywhere else. Replaces the old Base44
// employeeLogin, which cached a bcrypt hash of the source password locally.
function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

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
    const { identifier, password } = req.body || {};
    const trimmed = (identifier || '').trim().toLowerCase();
    if (!trimmed || !password) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    const sourceUrl = process.env.EXTERNAL_ACCOUNTS_SOURCE_URL;
    const sourceKey = process.env.EXTERNAL_ACCOUNTS_SOURCE_KEY_V2;
    if (!sourceUrl || !sourceKey) {
      return res.status(500).json({ error: 'Server configuration error: missing accounts source credentials' });
    }

    const list = await fetchAllEmployeeAccounts(sourceUrl, sourceKey);
    const account = list.find((a) => {
      const email = (a.email || '').trim().toLowerCase();
      const code = (a.employee_code || '').trim().toLowerCase();
      return email === trimmed || (code && code === trimmed);
    });

    if (!account) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    const email = (account.email || '').trim().toLowerCase();

    const automateUrl = process.env.VITE_AUTOMATE_SUPABASE_URL;
    const serviceKey = process.env.AUTOMATE_SUPABASE_SERVICE_ROLE_KEY;
    if (!automateUrl || !serviceKey) {
      return res.status(500).json({ error: 'Server configuration error: missing local database credentials' });
    }
    const supabase = createClient(automateUrl, serviceKey);

    const { data: localRows, error: localError } = await supabase
      .from('admin_accounts')
      .select('id,role,team_name,role_override,is_active_override,password_override_hash')
      .eq('email', email)
      .limit(1);
    if (localError) throw localError;
    const local = localRows?.[0] || null;

    // An admin-issued reset always wins over the real source's password —
    // see password_override_hash's purpose in admin_accounts_overrides.sql.
    // Everyone else is verified live against the source's real password —
    // never cached, never bcrypt-hashed here, matching the source's own
    // plain-text storage (constant-time compare mitigates timing attacks).
    let passwordOk;
    if (local && local.password_override_hash) {
      passwordOk = bcrypt.compareSync(password, local.password_override_hash);
    } else {
      const sourcePassword = account.generated_password || '';
      if (!sourcePassword) {
        return res.status(500).json({ error: 'Account configuration error: no password set' });
      }
      passwordOk = constantTimeCompare(String(password), String(sourcePassword));
    }
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    const sourceActive = account.status === 'active';
    const isActive = local && local.is_active_override !== null && local.is_active_override !== undefined
      ? local.is_active_override
      : sourceActive;
    if (!isActive) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    if (!local) {
      // First-ever login for a real, active source account — lazily create
      // the local role row instead of requiring a separate sync job to have
      // run first. Defaults to 'agent' until an admin assigns something
      // else. Ignores a duplicate-key race (23505) from a concurrent login.
      const { error: insertError } = await supabase.from('admin_accounts').insert({
        email,
        full_name: account.full_name || '',
        employee_code: account.employee_code || null,
        department: account.job_title || null,
        role: 'agent',
        is_active: true,
      });
      if (insertError && insertError.code !== '23505') throw insertError;
    } else {
      // Best-effort — a failed last_login stamp shouldn't block the login itself.
      supabase.from('admin_accounts').update({ last_login: new Date().toISOString() }).eq('id', local.id)
        .then(() => {})
        .catch(() => {});
    }

    const sessionUser = {
      name: account.full_name || '',
      email,
      employeeCode: account.employee_code || '',
      department: account.job_title || '',
      role: (local && (local.role_override || local.role)) || 'agent',
      team: (local && local.team_name) || '',
    };

    return res.status(200).json({ user: sessionUser });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
