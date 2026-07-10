import bcrypt from 'npm:bcryptjs@2.4.3';

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

    const accounts = await response.json();
    const list = Array.isArray(accounts) ? accounts : (accounts.data || []);

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

    const passwordHash = account.password_hash || account.password;
    if (!passwordHash) {
      return Response.json(
        { error: 'Account configuration error: no password set' },
        { status: 500 }
      );
    }

    const passwordOk = bcrypt.compareSync(password, passwordHash);
    if (!passwordOk) {
      return Response.json(
        { error: 'Invalid email/username or password.' },
        { status: 401 }
      );
    }

    if (account.is_active === false) {
      return Response.json(
        { error: 'This account has been deactivated.' },
        { status: 403 }
      );
    }

    const sessionUser = {
      name: account.full_name,
      email: account.email,
      employeeCode: account.employee_code,
      department: account.department,
      role: account.role,
      team: account.team_name,
    };

    return Response.json({ user: sessionUser });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});