import { createClient } from '@supabase/supabase-js';

// Fusioo apps -> Supabase sync. Full refresh every run — a few thousand
// rows per app, same ballpark query-supabase.js already handles for
// flight_emails in one call. Requires CRON_SECRET in the Authorization
// header, same convention as the other cron-triggered /api/* functions.
//
// NOT wired to a recurring trigger yet — the Fusioo access token
// (FUSIOO_ACCESS_TOKEN / VITE_FUSIOO_TOKEN) is short-lived and its
// refresh_token was confirmed dead on a live test (invalid_grant), and
// Base44's own existing scheduled sync may still be actively running
// against the same Fusioo rate limit — turn that off first, then confirm a
// working long-lived token, before scheduling this to run automatically.
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
    throw new Error(`Fusioo API error (${response.status}) at offset ${offset} for app ${appId}: ${await response.text()}`);
  }
  const body = await response.json();
  return body.data || [];
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

    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
