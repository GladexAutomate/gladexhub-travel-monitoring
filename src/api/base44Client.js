import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// serverUrl empty ('') only works when this app is served FROM Base44's own
// sandboxed hosting — same-origin, so a relative /api path resolves
// correctly with no config. Everywhere else (local dev outside the sandbox,
// and any external host like Vercel), there's nothing to resolve a relative
// /api path against, so calls must go straight to the app's real backend
// URL — exactly what Base44's own appBaseUrl config exists for (this is the
// documented way to use Base44 as a backend from an external app/host).
// Local dev additionally gets a same-origin /api proxy from
// @base44/vite-plugin (dev-server only, no effect on the production
// build) — that's a convenience, not a requirement, since calling
// appBaseUrl directly works in both places.
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: appBaseUrl || '',
  requiresAuth: false,
  appBaseUrl
});
