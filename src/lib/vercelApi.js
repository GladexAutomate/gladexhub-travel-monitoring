// Drop-in replacement for base44.functions.invoke(name, payload) — same
// call shape (returns { data }), same throw-on-non-2xx behavior every call
// site already handles via `err.response?.data?.error || err.message` — but
// hits our own same-origin Vercel /api/* functions instead of Base44.
const FUNCTION_ROUTES = {
  employeeLogin: '/api/employee-login',
  validateSession: '/api/validate-session',
  employeeList: '/api/employee-list',
  querySupabase: '/api/query-supabase',
  updateEmployeeAccount: '/api/update-employee-account',
  resetEmployeePassword: '/api/reset-employee-password',
};

export async function invokeApi(name, payload) {
  const route = FUNCTION_ROUTES[name];
  if (!route) throw new Error(`No /api/* route mapped for "${name}"`);

  const response = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error body (e.g. a raw platform 500 page) — data stays null,
    // the status-based Error below still carries a useful message.
  }

  if (!response.ok) {
    const err = new Error(data?.error || `Request to ${route} failed with status ${response.status}`);
    err.response = { data, status: response.status };
    throw err;
  }

  return { data };
}
