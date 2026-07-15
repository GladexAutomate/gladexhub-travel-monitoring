import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// Flexible Supabase proxy — the Base44 frontend can't read VITE_ env vars
// at runtime (see src/lib/supabase*.js and fetchSupabaseData comments), so
// all direct Supabase queries from AdminFlightManagement.jsx route through
// here. The backend reads project credentials via Deno.env and validates
// every request against a strict project + table whitelist.
//
// Uses the supabase-js client (same library as the frontend) so PostgREST
// URL building / jsonb filter encoding is handled identically.
const PROJECTS = {
  automate: {
    urlEnv: 'VITE_AUTOMATE_SUPABASE_URL',
    keyEnv: 'VITE_AUTOMATE_SUPABASE_ANON_KEY',
    tables: ['flight_emails'],
  },
  fusioo: {
    urlEnv: 'VITE_FUSIOO_SUPABASE_URL',
    keyEnv: 'VITE_FUSIOO_SUPABASE_ANON_KEY',
    tables: [
      'fusioo_booking_transactions',
      'fusioo_ticket_details',
      'fusioo_hotel_details',
      'fusioo_tour_details',
      'fusioo_transfer_details',
    ],
  },
  sales: {
    urlEnv: 'VITE_SALES_SUPABASE_URL',
    keyEnv: 'VITE_SALES_SUPABASE_ANON_KEY',
    tables: ['bookings_6fbdd6b2', 'ticket_details_b1d64ca0'],
  },
};

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project, table, operation } = body;

    const proj = PROJECTS[project];
    if (!proj || !proj.tables.includes(table)) {
      return Response.json({ error: 'Invalid project or table' }, { status: 400 });
    }

    const url = Deno.env.get(proj.urlEnv);
    const key = Deno.env.get(proj.keyEnv);
    if (!url || !key) {
      return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
    }

    const supabase = createClient(url, key);
    let rows = [];

    if (operation === 'selectAllOrdered') {
      // Fetch every row ordered, paginating past PostgREST's default cap.
      const { orderBy, ascending = false, selectColumns = '*', pageSize = 1000 } = body;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(selectColumns)
          .order(orderBy, { ascending })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
    } else if (operation === 'filterJsonbIn') {
      // Filter by data->>field in (val1, val2, ...) with URL-length batching.
      const { jsonbField, values, selectColumns = 'data', chunkSize = 150 } = body;
      if (!values || values.length === 0) return Response.json({ rows: [] });
      const results = await Promise.all(
        chunkArray(values, chunkSize).map(async (batch) => {
          const quoted = batch.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
          const { data, error } = await supabase
            .from(table)
            .select(selectColumns)
            .filter(`data->>${jsonbField}`, 'in', `(${quoted})`);
          if (error) throw error;
          return data || [];
        })
      );
      rows = results.flat();
    } else if (operation === 'filterIdIn') {
      // Filter by id in (id1, id2, ...) with URL-length batching.
      const { ids, selectColumns = 'data', chunkSize = 150 } = body;
      if (!ids || ids.length === 0) return Response.json({ rows: [] });
      const results = await Promise.all(
        chunkArray(ids, chunkSize).map(async (batch) => {
          const { data, error } = await supabase
            .from(table)
            .select(selectColumns)
            .in('id', batch);
          if (error) throw error;
          return data || [];
        })
      );
      rows = results.flat();
    } else if (operation === 'selectAllPaginated') {
      // Fetch every row (no filter, no order) with pagination.
      const { selectColumns = 'data', pageSize = 1000 } = body;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(selectColumns)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
    } else {
      return Response.json({ error: 'Invalid operation' }, { status: 400 });
    }

    return Response.json({ rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});