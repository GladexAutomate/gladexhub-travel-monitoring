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

    // Try common table names to find what exists
    const candidates = [
      'bookings_6fbdd6b2', 'bookings', 'ticket_details_b1d64ca0',
      'ticket_details', 'tickets', 'flight_emails',
      'hotel_details_a2f30717', 'hotel_details', 'tour_details_2bf757ca',
      'tour_details', 'transfer_details_b9a92c90', 'transfer_details',
      'customer_bookings', 'sales', 'orders'
    ];

    const results = [];
    for (const table of candidates) {
      const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      results.push({
        table,
        status: r.status,
        exists: r.status !== 404,
      });
    }

    const found = results.filter((r) => r.exists).map((r) => r.table);

    return Response.json({
      url,
      foundTables: found,
      allResults: results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});