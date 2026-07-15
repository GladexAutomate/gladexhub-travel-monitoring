import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Employee login — fetches the full account list from the external API
// (key stays server-side), finds the user by email or employee_code,
// verifies the password, and checks active status.
//
// The API returns plain-text generated_password (not bcrypt), so we use
// a constant-time comparison to avoid timing attacks.
Deno.serve(async (req) => {
  try {
    const { identifier, password } = await req.json();

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

    const trimmed = (identifier || '').trim().toLowerCase();
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

    // The API uses generated_password (plain text). Fall back to
    // password_hash/password for compatibility if the API format changes.
    const storedPassword = account.generated_password || account.password_hash || account.password;
    if (!storedPassword) {
      return Response.json(
        { error: 'Account configuration error: no password set' },
        { status: 500 }
      );
    }

    // Constant-time comparison to mitigate timing attacks on plain-text passwords.
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

    // Check active status — API uses status: "active", legacy used is_active: boolean.
    const isActive = account.status === 'active' || account.is_active === true;
    if (!isActive) {
      return Response.json(
        { error: 'This account has been deactivated.' },
        { status: 403 }
      );
    }

    // The external API (employeeaccount table) has no role field — roles
    // are managed in admin_accounts (automate Supabase project), seeded per
    // the SQL migration: default 'agent', with Ashley Sarabia and Kevin
    // Timbol as super_admin. Look up the role there after API auth.
    const supabaseUrl = Deno.env.get('VITE_AUTOMATE_SUPABASE_URL');
    const supabaseKey = Deno.env.get('VITE_AUTOMATE_SUPABASE_ANON_KEY');
    let role = 'agent';
    if (supabaseUrl && supabaseKey) {
      try {
        const acctRes = await fetch(
          `${supabaseUrl}/rest/v1/admin_accounts?select=email,role`,
          { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
        );
        if (acctRes.ok) {
          const acctRows = await acctRes.json();
          const normalizedEmail = (account.email || '').trim().toLowerCase();
          const match = acctRows.find(
            (r) => (r.email || '').trim().toLowerCase() === normalizedEmail
          );
          if (match?.role) role = match.role;
        }
      } catch {
        // admin_accounts lookup failed — default to 'agent'.
      }
    }

    const sessionUser = {
      name: account.full_name,
      email: account.email,
      employeeCode: account.employee_code,
      department: account.department || account.job_title || '',
      role,
      team: account.team_name || '',
    };

    return Response.json({ user: sessionUser });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});