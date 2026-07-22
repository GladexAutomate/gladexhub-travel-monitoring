import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Refreshes the FlightEmailCache entity — a persistent, pre-filtered
// (flights[0].departure_date >= 2026-01-01 OR null) and pre-sorted
// (received_date DESC) copy of flight_emails. querySupabase's hot path reads
// this instead of re-running the expensive JSONB-filtered, paginated
// flight_emails query on every 60s dashboard poll. RBAC scoping still runs
// fresh per request in querySupabase against these cached rows — the cache
// only stores raw rows, never the scoped result.
//
// Diff-based to keep the 2-minute cadence cheap: creates new rows, updates
// rows whose payload changed (detected via a stored SHA-256 hash), and
// deletes rows no longer in the source. Gmail sync is append-only and only
// adds a handful of rows every ~15 min, so a typical run does near-zero
// writes; the first run backfills everything.
const MIN_DEPARTURE_DATE = '2026-01-01';
const PAGE_SIZE = 1000;
const BULK_SIZE = 500;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchSourceRows(supabase) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('flight_emails')
      .select('*')
      .order('received_date', { ascending: false })
      .or(`flights->0->>departure_date.gte.${MIN_DEPARTURE_DATE},flights->0->>departure_date.is.null`)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

Deno.serve(async (req) => {
  try {
    const automateUrl = Deno.env.get('VITE_AUTOMATE_SUPABASE_URL');
    const serviceKey = Deno.env.get('AUTOMATE_SUPABASE_SERVICE_ROLE_KEY');
    if (!automateUrl || !serviceKey) {
      return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
    }

    const supabase = createClient(automateUrl, serviceKey);
    const b44 = createClientFromRequest(req);

    const sourceRows = await fetchSourceRows(supabase);

    // source_id -> { row, hash }
    const sourceById = new Map();
    for (const row of sourceRows) {
      const id = String(row.id);
      const hash = await sha256Hex(JSON.stringify(row));
      sourceById.set(id, { row, hash });
    }

    // existing cache records: source_id -> { id (entity id), hash }
    const existing = new Map();
    let skip = 0;
    while (true) {
      const page = await b44.asServiceRole.entities.FlightEmailCache.list('-created_date', 1000, skip);
      if (!page || page.length === 0) break;
      for (const r of page) {
        if (r.source_id) existing.set(r.source_id, { id: r.id, hash: r.payload_hash });
      }
      if (page.length < 1000) break;
      skip += 1000;
    }

    const toCreate = [];
    const toUpdate = [];
    for (const [sourceId, { row, hash }] of sourceById) {
      const ex = existing.get(sourceId);
      if (!ex) {
        toCreate.push({ source_id: sourceId, received_date: row.received_date || null, payload: row, payload_hash: hash });
      } else if (ex.hash !== hash) {
        toUpdate.push({ id: ex.id, received_date: row.received_date || null, payload: row, payload_hash: hash });
      }
    }
    const toDelete = [];
    for (const [sourceId] of existing) {
      if (!sourceById.has(sourceId)) toDelete.push(sourceId);
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;
    for (let i = 0; i < toCreate.length; i += BULK_SIZE) {
      const chunk = toCreate.slice(i, i + BULK_SIZE);
      await b44.asServiceRole.entities.FlightEmailCache.bulkCreate(chunk);
      created += chunk.length;
    }
    for (let i = 0; i < toUpdate.length; i += BULK_SIZE) {
      const chunk = toUpdate.slice(i, i + BULK_SIZE);
      await b44.asServiceRole.entities.FlightEmailCache.bulkUpdate(chunk);
      updated += chunk.length;
    }
    for (let i = 0; i < toDelete.length; i += BULK_SIZE) {
      const chunk = toDelete.slice(i, i + BULK_SIZE);
      await b44.asServiceRole.entities.FlightEmailCache.deleteMany({ source_id: { $in: chunk } });
      deleted += chunk.length;
    }

    return Response.json({ source: sourceRows.length, created, updated, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});