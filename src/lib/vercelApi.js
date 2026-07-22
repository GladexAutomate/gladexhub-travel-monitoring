import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

// Drop-in replacement for base44.functions.invoke(name, payload) — same
// call shape (returns { data }), same throw-on-non-2xx behavior every call
// site already handles via `err.response?.data?.error || err.message`.
//
// This same codebase now deploys to BOTH Vercel (our own /api/* serverless
// functions) and Base44 (its own Deno functions, base44/functions/*) —
// Base44's hosting doesn't run our /api/*.js files, and Vercel doesn't run
// Base44's functions, so a single hardcoded call style would only work on
// one of the two. Detected by comparing the current origin against
// appParams.appBaseUrl (Base44's real hosting URL) — running there means
// call through the base44 SDK; anywhere else (Vercel, localhost dev) means
// call our own same-origin /api/* route.
const FUNCTION_ROUTES = {
  employeeLogin: '/api/employee-login',
  validateSession: '/api/validate-session',
  employeeList: '/api/employee-list',
  querySupabase: '/api/query-supabase',
  updateEmployeeAccount: '/api/update-employee-account',
  resetEmployeePassword: '/api/reset-employee-password',
};

function isRunningOnBase44() {
  if (typeof window === 'undefined') return false;
  if (!appParams.appBaseUrl) return false;
  try {
    return new URL(appParams.appBaseUrl).origin === window.location.origin;
  } catch {
    return false;
  }
}

export async function invokeApi(name, payload) {
  if (isRunningOnBase44()) {
    return base44.functions.invoke(name, payload);
  }

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
