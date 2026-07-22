import { createClient } from '@supabase/supabase-js';

// Fusioo apps -> Supabase sync. Full refresh every run — requires
// CRON_SECRET in the Authorization header, same convention as the other
// cron-triggered /api/* functions.
//
// PERFORMANCE: a live test of the original sequential-pagination version
// took 1559 seconds (26 min) for all 5 apps combined (~105k records total)
// — far past any realistic Vercel function timeout. Fixed by paginating
// each app with a concurrent sliding window instead of one page at a time;
// apps themselves stay sequential (not also parallelized) to avoid bursting
// Fusioo's own rate limit, which is already tight enough to have been hit
// during testing this session from ordinary usage.
//
// Requesting the longest duration Vercel allows on whatever plan this is
// deployed under — harmless to request more than the plan grants, it's
// just capped. Optional `apps` in the request body (array of table names)
// lets a caller sync just a subset in one invocation, as a manual fallback
// if even the concurrent version doesn't fit in one run on this plan —
// e.g. one Vercel Cron per app instead of one for all five.
export const config = { maxDuration: 300 };

const PAGE_SIZE = 200; // Fusioo's max per the API docs.
const PAGE_CONCURRENCY = 8;

const FUSIOO_APPS = [
  { name: 'Booking Transactions', appId: 'i037d30cf902f409f81339ce75c1fa930', table: 'fusioo_booking_transactions' },
  { name: 'Ticket Details', appId: 'i531ddc66a84a459982555f699d175ca2', table: 'fusioo_ticket_details' },
  { name: 'Hotel Details', appId: 'ia0bc64962dc04df3b2629f1c9282c99c', table: 'fusioo_hotel_details' },
  { name: 'Tour Details', appId: 'i0f68b99281d94732b4b0b07ef2d0c134', table: 'fusioo_tour_details' },
  { name: 'Transfer Details', appId: 'i69059e8c03a04ab489452fa4f6d5ff21', table: 'fusioo_transfer_details' },
];

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

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const fusiooToken = process.env.FUSIOO_ACCESS_TOKEN || process.env.VITE_FUSIOO_TOKEN;
    const supabaseUrl = process.env.VITE_FUSIOO_SUPABASE_URL;
    const supabaseKey = process.env.FUSIOO_SUPABASE_SERVICE_ROLE_KEY;

    if (!fusiooToken || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Server configuration error: missing FUSIOO_ACCESS_TOKEN, VITE_FUSIOO_SUPABASE_URL, or FUSIOO_SUPABASE_SERVICE_ROLE_KEY' });
    }

    // Vercel Cron triggers are always a plain GET with no body — apps must
    // be filterable via a query string (?apps=table1,table2) for a
    // per-app-scheduled cron entry to work, not just via a POST body (used
    // for manual/local testing).
    const requestedApps = req.body?.apps || (typeof req.query?.apps === 'string' ? req.query.apps.split(',') : undefined);
    const appsToSync = Array.isArray(requestedApps) && requestedApps.length > 0
      ? FUSIOO_APPS.filter((a) => requestedApps.includes(a.table))
      : FUSIOO_APPS;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results = [];

    for (const app of appsToSync) {
      const rawRecords = await fetchAllFusiooRecords(app.appId, fusiooToken);

      // BUG FOUND on a live full-run test: concurrent pagination can return
      // the same record twice (Fusioo's offset pagination isn't guaranteed
      // stable across simultaneous requests — a record shifting position
      // between two concurrently-fetched pages lands it in both). A
      // duplicate id within the same upsert batch makes Postgres reject the
      // whole batch outright ("ON CONFLICT DO UPDATE command cannot affect
      // row a second time"). Deduping by id first is correct regardless of
      // cause — a repeated id is the same record, last-write-wins is fine
      // since both copies came from the same fetch.
      const records = Array.from(new Map(rawRecords.map((r) => [r.id, r])).values());
      const now = new Date().toISOString();

      // Upsert in chunks — a single request with tens of thousands of rows
      // risks an oversized payload; PostgREST/Supabase handles this size
      // comfortably.
      const chunkSize = 500;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize).map((record) => ({ id: record.id, data: record, synced_at: now }));
        const { error } = await supabase.from(app.table).upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Supabase upsert error for ${app.table}: ${error.message}`);
      }

      results.push({ app: app.name, table: app.table, synced: records.length });
    }

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}