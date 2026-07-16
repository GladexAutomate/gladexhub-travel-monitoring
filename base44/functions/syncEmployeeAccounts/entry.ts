import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// System-level sync — fetches the full employee list from the external
// accounts API and replaces all SyncedEmployee records. Called by a
// scheduled workflow every 5 minutes (and can be invoked manually).
//
// The external API returns each employee's password in plain text
// (generated_password). We hash it once here, per sync cycle, and cache
// only the bcrypt hash — employeeLogin then verifies against this cached
// hash instead of re-fetching everyone's plain-text password from the API
// on every single login attempt. password_hash is never returned to the
// frontend (see employeeList/entry.ts).
function looksLikeBcryptHash(value) {
  return /^\$2[aby]?\$\d{2}\$/.test(value);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Role is not stored on the external accounts API — it lives in the
    // admin_accounts table (accounts Supabase project), seeded/maintained
    // separately. Fetch it once per sync cycle and merge by email so every
    // SyncedEmployee carries the correct RBAC role. Employees absent from
    // admin_accounts default to 'agent'.
    const accountsUrl = Deno.env.get("VITE_ACCOUNTS_SUPABASE_URL");
    const accountsKey = Deno.env.get("VITE_ACCOUNTS_SUPABASE_ANON_KEY");
    const roleMap = {};
    if (accountsUrl && accountsKey) {
      const accountsSupabase = createClient(accountsUrl, accountsKey);
      const { data: adminRows, error: adminError } = await accountsSupabase
        .from('admin_accounts')
        .select('email,role');
      if (!adminError && Array.isArray(adminRows)) {
        adminRows.forEach((r) => {
          const em = (r.email || '').trim().toLowerCase();
          if (em && r.role) roleMap[em] = r.role;
        });
      }
    }

    const apiUrl = Deno.env.get("ACCOUNTS_API_URL");
    const apiKey = Deno.env.get("ACCOUNTS_API_KEY");

    if (!apiUrl || !apiKey) {
      return Response.json(
        { error: 'Server configuration error: missing API credentials' },
        { status: 500 }
      );
    }

    const response = await fetch(apiUrl, {
      headers: { 'x-api-key': apiKey },
    });

    if (!response.ok) {
      return Response.json(
        { error: `Accounts service returned ${response.status}` },
        { status: 502 }
      );
    }

    const raw = await response.json();

    let list;
    if (Array.isArray(raw)) {
      list = raw;
    } else if (Array.isArray(raw.data)) {
      list = raw.data;
    } else if (Array.isArray(raw.users)) {
      list = raw.users;
    } else if (Array.isArray(raw.results)) {
      list = raw.results;
    } else if (Array.isArray(raw.employees)) {
      list = raw.employees;
    } else if (Array.isArray(raw.accounts)) {
      list = raw.accounts;
    } else if (Array.isArray(raw.records)) {
      list = raw.records;
    } else if (raw.data && Array.isArray(raw.data.records)) {
      list = raw.data.records;
    } else if (raw.data && Array.isArray(raw.data.users)) {
      list = raw.data.users;
    } else {
      const rawKeys = typeof raw === 'object' && raw !== null ? Object.keys(raw) : [];
      const rawType = typeof raw;
      const rawPreview = JSON.stringify(raw).slice(0, 500);
      return Response.json({
        error: 'Could not find an array of accounts in the API response',
        rawType,
        rawKeys,
        rawPreview,
      }, { status: 500 });
    }

    const existing = await base44.asServiceRole.entities.SyncedEmployee.list();
    const existingByEmail = {};
    existing.forEach((e) => { existingByEmail[e.email] = e; });

    const apiEmails = new Set();
    const toCreate = [];
    const toUpdate = [];

    list.forEach((a) => {
      const email = (a.email || '').trim().toLowerCase();
      if (!email) return;
      apiEmails.add(email);

      const existingRec = existingByEmail[email];

      const plaintextPassword = a.generated_password || a.password || '';
      const password_hash = plaintextPassword
        ? (looksLikeBcryptHash(plaintextPassword) ? plaintextPassword : bcrypt.hashSync(plaintextPassword, 10))
        : (existingRec?.password_hash || '');

      const record = {
        email,
        employee_code: a.employee_code || '',
        full_name: a.full_name || '',
        department: a.department || a.job_title || '',
        role: roleMap[email] || a.role || 'agent',
        team_name: a.team_name || '',
        is_active: true,
        password_hash,
      };

      if (existingRec) {
        toUpdate.push({ id: existingRec.id, ...record });
      } else {
        toCreate.push(record);
      }
    });

    const staleIds = Object.values(existingByEmail)
      .filter((e) => !apiEmails.has(e.email))
      .map((e) => e.id);

    await Promise.all([
      toCreate.length > 0 ? base44.asServiceRole.entities.SyncedEmployee.bulkCreate(toCreate) : null,
      toUpdate.length > 0 ? base44.asServiceRole.entities.SyncedEmployee.bulkUpdate(toUpdate) : null,
      staleIds.length > 0 ? base44.asServiceRole.entities.SyncedEmployee.deleteMany({ id: { $in: staleIds } }) : null,
    ]);

    return Response.json({
      synced: list.length,
      created: toCreate.length,
      updated: toUpdate.length,
      deleted: staleIds.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});