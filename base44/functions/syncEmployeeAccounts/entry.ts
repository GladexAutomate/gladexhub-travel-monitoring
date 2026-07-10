import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// System-level sync — fetches the full employee list from the external
// accounts API and replaces all SyncedEmployee records. Called by a
// scheduled workflow every 5 minutes (and can be invoked manually).
// Password hashes are intentionally NOT stored — only metadata + active
// status, which is what session validation and the accounts list need.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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
    // they disappear from the response entirely. Instead of delete-all-then-
    // recreate (which would lose their record), we upsert by email and mark
    // any previously-known employee who's absent from this sync as inactive.
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

      const record = {
        email,
        employee_code: a.employee_code || '',
        full_name: a.full_name || '',
        department: a.department || a.job_title || '',
        role: a.role || '',
        team_name: a.team_name || '',
        is_active: (a.status || a.is_active) === 'active' || a.is_active === true,
      };

      const existingRec = existingByEmail[email];
      if (existingRec) {
        toUpdate.push({ id: existingRec.id, ...record });
      } else {
        toCreate.push(record);
      }
    });

    // Mark any existing employee absent from this API response as inactive.
    let deactivatedCount = 0;
    const toDeactivate = Object.values(existingByEmail)
      .filter((e) => !apiEmails.has(e.email) && e.is_active !== false)
      .map((e) => { deactivatedCount++; return { id: e.id, is_active: false }; });

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.SyncedEmployee.bulkCreate(toCreate);
    }
    if (toUpdate.length > 0) {
      await base44.asServiceRole.entities.SyncedEmployee.bulkUpdate(toUpdate);
    }
    if (toDeactivate.length > 0) {
      await base44.asServiceRole.entities.SyncedEmployee.bulkUpdate(toDeactivate);
    }

    return Response.json({
      synced: list.length,
      created: toCreate.length,
      updated: toUpdate.length,
      deactivated: deactivatedCount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});