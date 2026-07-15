import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Temporary test — verifies the Sales Supabase credentials work
// by querying the bookings table from the server side.
Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('VITE_SALES_SUPABASE_URL');
    const key = Deno.env.get('VITE_SALES_SUPABASE_ANON_KEY');

    if (!url || !key) {
      return Response.json({
        error: 'Secrets not found in vault',
        urlSet: !!url,
        keySet: !!key,
      }, { status: 500 });
    }

    // Test the actual table names from the dashboard + fetch a sample row
    const tables = [
      'fusioo_booking_transactions',
      'fusioo_hotel_details',
      'fusioo_ticket_details',
      'fusioo_tour_details',
      'fusioo_transfer_details',
    ];

    const results = [];
    for (const table of tables) {
      const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const body = await r.text();
      results.push({
        table,
        status: r.status,
        ok: r.ok,
        sample: r.ok ? body.slice(0, 300) : null,
        error: !r.ok ? body.slice(0, 200) : null,
      });
    }

    return Response.json({ url, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});