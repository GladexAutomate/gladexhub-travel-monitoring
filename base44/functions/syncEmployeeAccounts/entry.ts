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

    // Neither role nor team_name is reliably present on the external accounts
    // API (it has no team_name field at all). Both live in the admin_accounts
    // table (accounts Supabase project), seeded/maintained separately. Fetch
    // both once per sync cycle and merge by email so every SyncedEmployee
    // carries the correct RBAC role and team. Employees absent from
    // admin_accounts default to role 'agent' and a blank team_name. team_name
    // is only populated for team leaders assigned a team in admin_accounts;
    // the API's own value (always empty today) is preferred when present, with
    // admin_accounts as the fallback when it's blank.
    const accountsUrl = Deno.env.get("VITE_ACCOUNTS_SUPABASE_URL");
    const accountsKey = Deno.env.get("VITE_ACCOUNTS_SUPABASE_ANON_KEY");
    const adminProfileMap = {};
    if (accountsUrl && accountsKey) {
      const accountsSupabase = createClient(accountsUrl, accountsKey);
      const { data: adminRows, error: adminError } = await accountsSupabase
        .from('admin_accounts')
        .select('email,role,team_name');
      if (!adminError && Array.isArray(adminRows)) {
        adminRows.forEach((r) => {
          const em = (r.email || '').trim().toLowerCase();
          if (em) {
            adminProfileMap[em] = {
              role: r.role || '',
              team_name: r.team_name || '',
            };
          }
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

    // Handle multiple common API response formats.
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
      // Can't find an array — return diagnostics so the format can be identified.
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

    // The API only returns active employees — when someone becomes inactive
    // they disappear from the response entirely. We upsert by email and
    // soft-deactivate (is_active: false) any cached record that's absent
    // from this sync — NOT a hard delete. A hard delete would destroy
    // role_override/is_active_override/password_override_hash on that row;
    // if the employee later reappears in the API (a pagination glitch, a
    // transient short response, or a real reactivation), they'd come back
    // through the toCreate path as a brand-new row with every admin
    // override silently and permanently lost. Soft-deactivating still kicks
    // them out (validateSession/employeeLogin both resolve is_active via
    // is_active_override ?? is_active, so this correctly blocks login) while
    // preserving the row — and preserving it means an explicit
    // is_active_override=true would correctly keep them logged-in-able
    // through a spurious API gap, which a hard delete could never do.
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
      const profile = adminProfileMap[email] || {};

      // Hash fresh on every sync so a password change on the source side is
      // picked up; if the API's password field is temporarily missing, keep
      // whatever hash we already had cached rather than wiping it.
      const plaintextPassword = a.generated_password || a.password || '';
      const password_hash = plaintextPassword
        ? (looksLikeBcryptHash(plaintextPassword) ? plaintextPassword : bcrypt.hashSync(plaintextPassword, 10))
        : (existingRec?.password_hash || '');

      const record = {
        email,
        employee_code: a.employee_code || '',
        full_name: a.full_name || '',
        department: a.department || a.job_title || '',
        role: profile.role || a.role || 'agent',
        team_name: a.team_name || profile.team_name || '',
        is_active: true,
        password_hash,
      };

      if (existingRec) {
        toUpdate.push({ id: existingRec.id, ...record });
      } else {
        toCreate.push(record);
      }
    });

    // Soft-deactivate any cached employee no longer in the API response —
    // see the comment above for why this is an update, not a delete.
    const staleUpdates = Object.values(existingByEmail)
      .filter((e) => !apiEmails.has(e.email))
      .map((e) => ({ id: e.id, is_active: false }));

    // Independent, disjoint ID sets — no ordering dependency between them.
    await Promise.all([
      toCreate.length > 0 ? base44.asServiceRole.entities.SyncedEmployee.bulkCreate(toCreate) : null,
      toUpdate.length > 0 ? base44.asServiceRole.entities.SyncedEmployee.bulkUpdate(toUpdate) : null,
      staleUpdates.length > 0 ? base44.asServiceRole.entities.SyncedEmployee.bulkUpdate(staleUpdates) : null,
    ]);

    return Response.json({
      synced: list.length,
      created: toCreate.length,
      updated: toUpdate.length,
      deactivated: staleUpdates.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});