import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fetches raw data from the Sales Supabase project (fusioo_* tables).
// The frontend can't access VITE_ env vars directly on Base44, so this
// function acts as a secure proxy with auth + table whitelist.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { table, page = 1, pageSize = 25, search = '' } = await req.json();

    const validTables = [
      'fusioo_booking_transactions',
      'fusioo_hotel_details',
      'fusioo_ticket_details',
      'fusioo_tour_details',
      'fusioo_transfer_details',
    ];

    if (!validTables.includes(table)) {
      return Response.json({ error: 'Invalid table name' }, { status: 400 });
    }

    const url = Deno.env.get('VITE_SALES_SUPABASE_URL');
    const key = Deno.env.get('VITE_SALES_SUPABASE_ANON_KEY');

    if (!url || !key) {
      return Response.json({ error: 'Server configuration error: missing Supabase credentials' }, { status: 500 });
    }

    const offset = (page - 1) * pageSize;
    let query = `/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`;

    if (search) {
      query += `&data::text::ilike.*${encodeURIComponent(search)}*`;
    }

    const res = await fetch(`${url}${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
    });

    if (!res.ok) {
      const errBody = await res.text();
      return Response.json({ error: `Supabase query failed (${res.status}): ${errBody.slice(0, 300)}` }, { status: 502 });
    }

    const rows = await res.json();

    // Total count comes from the Content-Range header: "0-24/22125"
    const contentRange = res.headers.get('content-range') || '';
    const total = contentRange.includes('/') ? parseInt(contentRange.split('/')[1], 10) : rows.length;

    // Each row is { id, data: { ...fields } } — flatten for the frontend.
    const flattened = rows.map((row) => {
      const d = row.data || {};
      return { _record_id: row.id, ...d };
    });

    return Response.json({
      rows: flattened,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});