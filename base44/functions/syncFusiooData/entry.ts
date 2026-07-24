import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// Fusioo apps -> Supabase sync. Full refresh every run. Ported from
// api/sync-fusioo-data.js (the Vercel version) — a live test of the
// original sequential-pagination version here took 1559 seconds (26 min)
// for all 5 apps combined (~105k records total), far too long for a
// scheduled run. Fixed by paginating each app with a concurrent sliding
// window instead of one page at a time; apps themselves stay sequential
// (not also parallelized) to avoid bursting Fusioo's own rate limit, which
// is already tight enough to have been hit during testing this session
// from ordinary usage. Cut the full run to ~320 seconds.
const PAGE_SIZE = 200; // Fusioo's max per the API docs.
const PAGE_CONCURRENCY = 8;

// Each brand is a SEPARATE Fusioo account (its own API token, its own app
// IDs) — GladExplore confirmed 2026-07-24 via a live API call. All brands
// still write into the SAME "fusioo" Supabase project, just under
// brand-prefixed tables (see gladexplore_fusioo_sync_schema.sql). Ported
// from api/sync-fusioo-data.js's same multi-source structure.
const FUSIOO_SOURCES = [
  {
    source: 'gladex',
    tokenEnv: 'FUSIOO_ACCESS_TOKEN',
    tokenFallbackEnv: 'VITE_FUSIOO_TOKEN',
    apps: [
      { name: 'Booking Transactions', appId: 'i037d30cf902f409f81339ce75c1fa930', table: 'fusioo_booking_transactions' },
      { name: 'Ticket Details', appId: 'i531ddc66a84a459982555f699d175ca2', table: 'fusioo_ticket_details' },
      { name: 'Hotel Details', appId: 'ia0bc64962dc04df3b2629f1c9282c99c', table: 'fusioo_hotel_details' },
      { name: 'Tour Details', appId: 'i0f68b99281d94732b4b0b07ef2d0c134', table: 'fusioo_tour_details' },
      { name: 'Transfer Details', appId: 'i69059e8c03a04ab489452fa4f6d5ff21', table: 'fusioo_transfer_details' },
    ],
  },
  {
    source: 'gladexplore',
    tokenEnv: 'GLADEXPLORE_FUSIOO_ACCESS_TOKEN',
    apps: [
      { name: 'Booking Transactions', appId: 'i389d269e665d40ac83db8a65a429a6ec', table: 'gladexplore_booking_transactions' },
      { name: 'Ticket Details', appId: 'i4cf087422dd949e5aa9f83b4732656f8', table: 'gladexplore_ticket_details' },
      { name: 'Transfer Details', appId: 'i7822b525967642ec9d2df2d933ea56a2', table: 'gladexplore_transfer_details' },
      { name: 'Name of Airline', appId: 'id4454e501fd640579a7613ccf9251bda', table: 'gladexplore_name_of_airline' },
    ],
  },
  {
    // Schema differs from both other brands (confirmed live 2026-07-24) —
    // booking-number field is `gde` here, not `gdx`. Only mirroring raw data
    // for now; no cross-brand matching built on this yet.
    source: 'pisodeals',
    tokenEnv: 'PISODEALS_FUSIOO_ACCESS_TOKEN',
    apps: [
      { name: 'Booking Transactions', appId: 'iee905580b9994c13a64a9dab756b5df7', table: 'pisodeals_booking_transactions' },
      { name: 'Ticket Details', appId: 'i63813320a56648f0b076228b7d328084', table: 'pisodeals_ticket_details' },
      { name: 'Transfer Details', appId: 'i87da57663e4b4c1897f468dc57323cc6', table: 'pisodeals_transfer_details' },
    ],
  },
];

// Flattened view of every app across every source, each carrying its own
// resolved token. Built at request time (not module scope) since it reads
// env vars.
function resolveFusiooApps() {
  const apps = [];
  const missingTokenSources = [];
  for (const src of FUSIOO_SOURCES) {
    const token = Deno.env.get(src.tokenEnv) || (src.tokenFallbackEnv ? Deno.env.get(src.tokenFallbackEnv) : undefined);
    if (!token) {
      missingTokenSources.push(src.source);
      continue;
    }
    for (const app of src.apps) {
      apps.push({ ...app, source: src.source, token });
    }
  }
  return { apps, missingTokenSources };
}

async function fetchFusiooPage(appId, offset, token) {
  const url = `https://api.fusioo.com/v3/records/apps/${appId}?limit=${PAGE_SIZE}&offset=${offset}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Fusioo API error (${response.status}) at offset ${offset} for app ${appId}: ${await response.text()}`);
  }
  const body = await response.json();
  return body.data || [];
}

// Fetches PAGE_CONCURRENCY pages at once (offsets batchStart, batchStart +
// PAGE_SIZE, ...), stopping as soon as any page in a batch comes back short
// (fewer than PAGE_SIZE records = end of data). Offsets are requested in a
// fixed, known sequence up front rather than discovered one at a time, so
// this only works because Fusioo's pagination is stable within a sync run
// (same assumption the original sequential version already made).
async function fetchAllFusiooRecords(appId, token) {
  const allRecords = [];
  let batchStart = 0;
  while (true) {
    const offsets = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => batchStart + i * PAGE_SIZE);
    const pages = await Promise.all(offsets.map((offset) => fetchFusiooPage(appId, offset, token)));

    let reachedEnd = false;
    for (const page of pages) {
      allRecords.push(...page);
      if (page.length < PAGE_SIZE) {
        reachedEnd = true;
        break; // any later pages in this same batch would be past the end — discard them
      }
    }
    if (reachedEnd) break;
    batchStart += PAGE_CONCURRENCY * PAGE_SIZE;
  }
  return allRecords;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('VITE_FUSIOO_SUPABASE_URL');
    const supabaseKey = Deno.env.get('FUSIOO_SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: 'Server configuration error: missing VITE_FUSIOO_SUPABASE_URL or FUSIOO_SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      body = {}; // no/empty body (e.g. a scheduled workflow trigger) — sync everything
    }

    // Shared-secret gate: only the scheduled Fusioo Data Sync workflow (or a
    // manual test that knows the secret) may trigger this expensive full
    // re-sync. A scheduled workflow has no logged-in user, so auth.me()/role
    // checks don't apply here — a shared secret is the platform-recommended
    // guard for no-user endpoints. Compare the caller's body.sync_secret
    // against FUSIOO_SYNC_SECRET (set in Environment Variables); reject if
    // the env var is unset OR the caller's value is missing OR they differ —
    // the both-empty check prevents undefined === undefined from passing.
    const expectedSecret = Deno.env.get('FUSIOO_SYNC_SECRET');
    const providedSecret = body?.sync_secret;
    if (!expectedSecret || !providedSecret || expectedSecret !== providedSecret) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { apps: allApps, missingTokenSources } = resolveFusiooApps();
    if (allApps.length === 0) {
      return Response.json(
        { error: 'Server configuration error: no Fusioo source has a token configured', missingTokenSources },
        { status: 500 }
      );
    }

    const requestedApps = body?.apps;
    const appsToSync = Array.isArray(requestedApps) && requestedApps.length > 0
      ? allApps.filter((a) => requestedApps.includes(a.table))
      : allApps;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results = [];

    for (const app of appsToSync) {
      const rawRecords = await fetchAllFusiooRecords(app.appId, app.token);

      // Concurrent pagination can return the same record twice (Fusioo's
      // offset pagination isn't guaranteed stable across simultaneous
      // requests). A duplicate id within the same upsert batch makes
      // Postgres reject the whole batch outright ("ON CONFLICT DO UPDATE
      // command cannot affect row a second time") — found on a live test.
      // Deduping by id first is correct regardless of cause.
      const records = Array.from(new Map(rawRecords.map((r) => [r.id, r])).values());
      const now = new Date().toISOString();

      const chunkSize = 500;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize).map((record) => ({ id: record.id, data: record, synced_at: now }));
        const { error } = await supabase.from(app.table).upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Supabase upsert error for ${app.table}: ${error.message}`);
      }

      results.push({ source: app.source, app: app.name, table: app.table, synced: records.length });
    }

    return Response.json({ results, skippedSources: missingTokenSources });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});