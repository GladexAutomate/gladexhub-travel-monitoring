import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// Fusioo apps -> Supabase sync. Runs on a schedule (see the
// SyncFusiooData workflow) instead of the old Google Apps Script version
// (google-apps-script/FusiooSync.gs, never deployed) — this way it lives on
// the same backend as everything else instead of a separate Google account
// with its own trigger/quota to manage.
//
// Full refresh every run: unlike the Apps Script version, which paged
// across multiple runs to stay under Apps Script's ~6-minute execution
// ceiling, Base44 functions don't have that constraint at this data volume
// (a few thousand rows per app, same ballpark querySupabase already
// handles for flight_emails in one call) — so each scheduled run just
// re-fetches every record from every app below and upserts it.
const PAGE_SIZE = 200; // Fusioo's max per the API docs.

const FUSIOO_APPS = [
  { name: 'Booking Transactions', appId: 'i037d30cf902f409f81339ce75c1fa930', table: 'fusioo_booking_transactions' },
  { name: 'Ticket Details', appId: 'i531ddc66a84a459982555f699d175ca2', table: 'fusioo_ticket_details' },
  { name: 'Hotel Details', appId: 'ia0bc64962dc04df3b2629f1c9282c99c', table: 'fusioo_hotel_details' },
  { name: 'Tour Details', appId: 'i0f68b99281d94732b4b0b07ef2d0c134', table: 'fusioo_tour_details' },
  { name: 'Transfer Details', appId: 'i69059e8c03a04ab489452fa4f6d5ff21', table: 'fusioo_transfer_details' },
];

async function fetchFusiooRecords(appId, offset, token) {
  const url = `https://api.fusioo.com/v3/records/apps/${appId}?limit=${PAGE_SIZE}&offset=${offset}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Fusioo API error (${response.status}) at offset ${offset} for app ${appId}`);
  }
  const body = await response.json();
  return body.data || [];
}

Deno.serve(async (req) => {
  try {
    const fusiooToken = Deno.env.get("FUSIOO_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("VITE_FUSIOO_SUPABASE_URL");
    const supabaseKey = Deno.env.get("FUSIOO_SUPABASE_SERVICE_ROLE_KEY");

    if (!fusiooToken || !supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: 'Server configuration error: missing FUSIOO_ACCESS_TOKEN, VITE_FUSIOO_SUPABASE_URL, or FUSIOO_SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results = [];

    for (const app of FUSIOO_APPS) {
      let offset = 0;
      let total = 0;

      while (true) {
        const records = await fetchFusiooRecords(app.appId, offset, fusiooToken);
        if (records.length === 0) break;

        const now = new Date().toISOString();
        const rows = records.map((record) => ({ id: record.id, data: record, synced_at: now }));

        const { error } = await supabase.from(app.table).upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Supabase upsert error for ${app.table}: ${error.message}`);

        total += records.length;
        offset += records.length;
        if (records.length < PAGE_SIZE) break;
      }

      results.push({ app: app.name, table: app.table, synced: total });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
