// Thin wrapper around the Fusioo REST API (https://api.fusioo.com/v1).
//
// NOT used by useAuth.js — login/RBAC goes through the employeeLogin
// backend function instead. Two reasons:
//   1. VITE_FUSIOO_TOKEN has a VITE_ prefix, so importing this file from any
//      client component bundles the token into the public JS shipped to
//      every visitor's browser. That token has broad read access across the
//      whole Fusioo workspace (53 apps: sales, billing, vouchers, refunds,
//      accounting...) — far more exposure than a login flow needs.
//   2. There's no Fusioo app that actually models employee login/role/team-
//      leader data (checked: "Accounts" is a sales-channel tag app, "Agent"
//      has no login fields). Team/agent info for filtering flight bookings
//      by role comes from bookings_6fbdd6b2 (Sales Supabase) instead — see
//      the agent_name/name_of_agent fields already joined in
//      AdminFlightManagement.jsx.
//
// This file exists for occasional ad-hoc/admin-tooling lookups (e.g. a
// future internal script or a backend endpoint), not for use from a page
// that ships to the browser. If a real runtime need for live Fusioo data
// from the frontend ever comes up, proxy it through a backend/edge function
// instead of importing this file client-side.

const FUSIOO_BASE_URL = 'https://api.fusioo.com/v1';

function getFusiooToken() {
  const token = import.meta.env.VITE_FUSIOO_TOKEN;
  if (!token) {
    throw new Error('VITE_FUSIOO_TOKEN is not set.');
  }
  return token;
}

async function fusiooRequest(path) {
  const response = await fetch(`${FUSIOO_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getFusiooToken()}` },
  });
  if (!response.ok) {
    throw new Error(`Fusioo API error (${response.status}): ${await response.text()}`);
  }
  const json = await response.json();
  return json.data;
}

export function listFusiooApps() {
  return fusiooRequest('/apps');
}

export function getFusiooApp(appId) {
  return fusiooRequest(`/apps/${appId}`);
}
