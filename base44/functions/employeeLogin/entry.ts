import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import bcrypt from 'npm:bcryptjs@2.4.3';

// Employee login. Verifies against the bcrypt password_hash cached on
// SyncedEmployee (refreshed every 5 min by syncEmployeeAccounts) so a
// plain-text password only has to leave the external API once per sync
// cycle, not on every single login attempt. Falls back to hitting the
// live API directly only on a cache miss — a brand-new employee logging in
// before the next sync — so onboarding isn't blocked by the 5-minute lag.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { identifier, password } = await req.json();

    const trimmed = (identifier || '').trim().toLowerCase();
    if (!trimmed || !password) {
      return Response.json(
        { error: 'Invalid email/username or password.' },
        { status: 401 }
      );
    }

    const byEmail = await base44.asServiceRole.entities.SyncedEmployee.filter({ email: trimmed });
    let cached = byEmail[0];
    if (!cached) {
      const all = await base44.asServiceRole.entities.SyncedEmployee.list();
      cached = all.find((e) => (e.employee_code || '').toLowerCase() === trimmed);
    }

    if (cached && cached.password_hash) {
      const passwordOk = bcrypt.compareSync(password, cached.password_hash);
      if (!passwordOk) {
        return Response.json(
          { error: 'Invalid email/username or password.' },
          { status: 401 }
        );
      }
      if (!cached.is_active) {
        return Response.json(
          { error: 'This account has been deactivated.' },
          { status: 403 }
        );
      }

      base44.asServiceRole.entities.SyncedEmployee.update(cached.id, {
        last_login: new Date().toISOString(),
      }).catch(() => {});

      const sessionUser = {
        name: cached.full_name,
        email: cached.email,
        employeeCode: cached.employee_code,
        department: cached.department || '',
        role: cached.role || '',
        team: cached.team_name || '',
      };
      return Response.json({ user: sessionUser });
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
        { error: 'Failed to reach accounts service' },
        { status: 502 }
      );
    }

    const raw = await response.json();
    const list = Array.isArray(raw) ? raw : (raw.accounts || raw.data || raw.users || []);

    const account = list.find(
      (a) =>
        (a.email || '').toLowerCase() === trimmed ||
        (a.employee_code || '').toLowerCase() === trimmed
    );

    if (!account) {
      return Response.json(
        { error: 'Invalid email/username or password.' },
        { status: 401 }
      );
    }

    const storedPassword = account.generated_password || account.password_hash || account.password;
    if (!storedPassword) {
      return Response.json(
        { error: 'Account configuration error: no password set' },
        { status: 500 }
      );
    }

    function constantTimeCompare(a, b) {
      if (a.length !== b.length) return false;
      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
      }
      return result === 0;
    }

    const passwordOk = constantTimeCompare(String(password), String(storedPassword));
    if (!passwordOk) {
      return Response.json(
        { error: 'Invalid email/username or password.' },
        { status: 401 }
      );
    }

    const hasStatusField = account.status !== undefined || account.is_active !== undefined;
    const isActive = account.status === 'active' || account.is_active === true;
    if (!isActive) {
      const message = hasStatusField
        ? 'This account has been deactivated.'
        : 'Account status could not be verified. Contact your administrator.';
      return Response.json({ error: message }, { status: 403 });
    }

    const sessionUser = {
      name: account.full_name,
      email: account.email,
      employeeCode: account.employee_code,
      department: account.department || account.job_title || '',
      role: account.role || '',
      team: account.team_name || '',
    };

    return Response.json({ user: sessionUser });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});