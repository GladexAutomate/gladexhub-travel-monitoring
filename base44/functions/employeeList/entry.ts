Deno.serve(async (req) => {
  try {
    const { requesterEmail } = await req.json();

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

    // Verify the requester is authorized to list accounts.
    const requesterEmailLower = (requesterEmail || '').trim().toLowerCase();
    const requester = list.find(
      (a) => (a.email || '').toLowerCase() === requesterEmailLower
    );

    if (!requester) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.is_active === false) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }

    const allowedRoles = ['admin', 'super_admin', 'team_leader'];
    if (!allowedRoles.includes(requester.role)) {
      return Response.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Strip password fields before returning.
    const safe = list.map((a) => {
      const { password_hash, password, ...rest } = a;
      return rest;
    });

    return Response.json({ accounts: safe });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});