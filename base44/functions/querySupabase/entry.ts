import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// Flexible Supabase proxy for AdminFlightManagement.jsx's direct queries.
// Requester role/team/active-state come from admin_accounts (local, fast —
// this is a hot path, polled every 60s) instead of a live fetch of the real
// source; validateSession is the authoritative freshness check for
// deactivation, running independently every 5 minutes. Ported verbatim from
// api/query-supabase.js (the Vercel version) — same RBAC scoping fix,
// same server-side old-booking filter, same fetch-concurrency and
// in-memory caching, same duplicate-record/garbage-booking-ref fixes found
// while building and testing that version against real data.
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
  // A caller-supplied chunkSize <= 0 would make `i += size` never advance,
  // hanging this function in an infinite loop until the platform kills it.
  const safeSize = size > 0 ? size : 150;
  const chunks = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

const MAX_CONCURRENT_FETCHES = 8;
async function mapWithConcurrencyLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// Short-lived, in-memory cache for selectAllOrdered — survives across
// requests only while this function instance stays warm. Keyed on the
// query shape, NOT the requester — the raw rows are identical for
// everyone, RBAC scoping is applied fresh below on every request
// regardless of whether the raw rows came from cache.
const rawRowsCache = new Map();
const RAW_ROWS_CACHE_TTL_MS = 20 * 1000;

// First token + last token of a name, lowercased — drops any middle
// name(s)/initial so "Jason Carl Santos" (Fusioo) and "JASON CARL TENORIO
// SANTOS" (admin_accounts, the real full legal name) match.
function firstLastKey(name) {
  const tokens = (name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens[0] + ' ' + tokens[tokens.length - 1];
}

async function scopeFlightEmailsRows(rows, requester, fusioo) {
  const role = requester.role;
  if (role === 'admin' || role === 'super_admin') return rows;
  if (role !== 'agent' && role !== 'team_leader') return [];

  // Only PNR-shaped booking_refs can ever match a real Fusioo ticket — some
  // flight_emails rows are needs_attention placeholders whose booking_ref
  // is the raw email subject line (found on a live test: contained a ✈
  // emoji and 100+ chars, which broke this query outright before this
  // filter was added).
  const bookingRefs = Array.from(new Set(
    rows.map((r) => r.booking_ref).filter((ref) => typeof ref === 'string' && /^[A-Z0-9]{4,10}$/i.test(ref))
  ));
  if (bookingRefs.length === 0) return [];

  const tickets = await fusiooFilterJsonbIn(fusioo, 'fusioo_ticket_details', 'booking_reference_number_pnr', bookingRefs);
  const bookingIds = Array.from(new Set(tickets.flatMap((t) => t.data.booking_transactions || [])));

  const bookings = bookingIds.length ? await fusiooFilterIdIn(fusioo, 'fusioo_booking_transactions', bookingIds) : [];
  const bookingsById = Object.fromEntries(bookings.map((b) => [b.id, b.data]));

  const agentNameByBookingRef = {};
  tickets.forEach((t) => {
    const bookingId = (t.data.booking_transactions || [])[0] || null;
    const booking = bookingId ? bookingsById[bookingId] : null;
    // Trimmed to match how primaryTeamByAgent's keys are built — an
    // untrimmed value here silently failed the primaryTeamByAgent[agentName]
    // lookup for the team_leader path whenever Fusioo's name_of_agent had
    // stray whitespace, dropping that booking from the team leader's view.
    const agentName = ((booking?.name_of_agent || [])[0] || '').trim() || null;
    if (agentName) agentNameByBookingRef[t.data.booking_reference_number_pnr] = agentName;
  });

  if (role === 'agent') {
    const myKey = firstLastKey(requester.full_name);
    return rows.filter((r) => firstLastKey(agentNameByBookingRef[r.booking_ref]) === myKey);
  }

  const primaryTeamByAgent = await computePrimaryTeamByAgent(fusioo);
  const myTeam = (requester.team_name || '').trim().toLowerCase();
  return rows.filter((r) => {
    const agentName = agentNameByBookingRef[r.booking_ref];
    if (!agentName) return false;
    return (primaryTeamByAgent[agentName] || '').trim().toLowerCase() === myTeam;
  });
}

// Same aggregation the frontend used to compute client-side from a raw,
// unscoped fetch of the entire fusioo_booking_transactions table (every
// client's name/mobile/email, company-wide) — moved server-side so the
// frontend only ever receives the derived agent->team mapping, never the
// underlying PII.
async function computePrimaryTeamByAgent(fusioo) {
  const allBookings = await fusiooSelectAllPaginated(fusioo, 'fusioo_booking_transactions');
  const teamCounts = {};
  allBookings.forEach((b) => {
    const agent = ((b.data.name_of_agent || [])[0] || '').trim();
    const team = ((b.data.agent_name || [])[0] || '').trim();
    if (!agent || !team) return;
    teamCounts[agent] = teamCounts[agent] || {};
    teamCounts[agent][team] = (teamCounts[agent][team] || 0) + 1;
  });
  const primaryTeamByAgent = {};
  Object.entries(teamCounts).forEach(([agent, counts]) => {
    primaryTeamByAgent[agent] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  });
  return primaryTeamByAgent;
}

async function fusiooFilterJsonbIn(fusioo, table, jsonbField, values) {
  const results = await mapWithConcurrencyLimit(chunkArray(values, 150), MAX_CONCURRENT_FETCHES, async (batch) => {
    const quoted = batch.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
    const { data, error } = await fusioo.from(table).select('id,data').filter(`data->>${jsonbField}`, 'in', `(${quoted})`);
    if (error) throw error;
    return data || [];
  });
  return results.flat();
}

async function fusiooFilterIdIn(fusioo, table, ids) {
  const results = await mapWithConcurrencyLimit(chunkArray(ids, 150), MAX_CONCURRENT_FETCHES, async (batch) => {
    const { data, error } = await fusioo.from(table).select('id,data').in('id', batch);
    if (error) throw error;
    return data || [];
  });
  return results.flat();
}

async function fusiooSelectAllPaginated(fusioo, table) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await fusioo.from(table).select('data').range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { project, table, operation, requesterEmail, _token } = body;

    const emailLower = (requesterEmail || '').trim().toLowerCase();
    if (!emailLower) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const automateUrl = Deno.env.get('VITE_AUTOMATE_SUPABASE_URL');
    const serviceKey = Deno.env.get('AUTOMATE_SUPABASE_SERVICE_ROLE_KEY');
    if (!automateUrl || !serviceKey) {
      return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
    }
    const local = createClient(automateUrl, serviceKey);
    const { data: requesterRows, error: requesterError } = await local
      .from('admin_accounts')
      .select('full_name,role,team_name,role_override,is_active_override,is_active,session_token')
      .eq('email', emailLower)
      .limit(1);
    if (requesterError) throw requesterError;
    const requesterRow = requesterRows?.[0];
    if (!requesterRow) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Proof the caller actually authenticated, not just that they know an
    // admin's email — this is the highest-value endpoint to guard (the only
    // one returning bulk flight_emails business data), so it can't be
    // skipped even though it wasn't in the original list of endpoints named.
    if (requesterRow.session_token && requesterRow.session_token !== _token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterActive = requesterRow.is_active_override !== null && requesterRow.is_active_override !== undefined
      ? requesterRow.is_active_override
      : requesterRow.is_active;
    const requesterRole = requesterRow.role_override || requesterRow.role;
    if (!requesterActive) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }
    if (!requesterRole) {
      return Response.json({ error: 'Account role not assigned' }, { status: 403 });
    }
    const requester = { full_name: requesterRow.full_name, role: requesterRole, team_name: requesterRow.team_name };
    const isAdminLike = requesterRole === 'admin' || requesterRole === 'super_admin';

    // Computed aggregate, not a raw table read — bypasses the project/table
    // check below entirely since it never returns the underlying rows. Open
    // to any active role (the mapping itself isn't sensitive).
    if (operation === 'agentPrimaryTeamMap') {
      const fusiooUrl = Deno.env.get(PROJECTS.fusioo.urlEnv);
      const fusiooKey = Deno.env.get(PROJECTS.fusioo.keyEnv);
      if (!fusiooUrl || !fusiooKey) {
        return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
      }
      const fusioo = createClient(fusiooUrl, fusiooKey);
      const primaryTeamByAgent = await computePrimaryTeamByAgent(fusioo);
      return Response.json({ primaryTeamByAgent });
    }

    const proj = PROJECTS[project];
    if (!proj || !proj.tables.includes(table)) {
      return Response.json({ error: 'Invalid project or table' }, { status: 400 });
    }

    // selectAllPaginated/selectAllOrdered on a fusioo/sales table dumps that
    // ENTIRE table — every client's PII, company-wide — with no scoping
    // applied below (scopeFlightEmailsRows only ever covers
    // automate/flight_emails). Restrict both bulk-read operations to
    // admin-like roles on every other project/table.
    if (!isAdminLike && (operation === 'selectAllPaginated' || operation === 'selectAllOrdered') && !(project === 'automate' && table === 'flight_emails')) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const url = Deno.env.get(proj.urlEnv);
    const key = Deno.env.get(proj.keyEnv);
    if (!url || !key) {
      return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
    }

    const supabase = createClient(url, key);
    let rows = [];

    if (operation === 'selectAllOrdered') {
      const { orderBy, ascending = false, selectColumns = '*', pageSize = 1000, minPrimaryDepartureDate } = body;

      const cacheKey = `${project}:${table}:${orderBy}:${ascending}:${selectColumns}:${minPrimaryDepartureDate || ''}`;
      const cached = rawRowsCache.get(cacheKey);
      if (cached && Date.now() - cached.at < RAW_ROWS_CACHE_TTL_MS) {
        rows = cached.rows;
      } else {
        let from = 0;
        while (true) {
          let queryBuilder = supabase
            .from(table)
            .select(selectColumns)
            .order(orderBy, { ascending });
          if (minPrimaryDepartureDate) {
            queryBuilder = queryBuilder.or(
              `flights->0->>departure_date.gte.${minPrimaryDepartureDate},flights->0->>departure_date.is.null`
            );
          }
          const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
          from += pageSize;
        }
        rawRowsCache.set(cacheKey, { rows, at: Date.now() });
      }
    } else if (operation === 'filterJsonbIn') {
      const { jsonbField, values, selectColumns = 'data', chunkSize = 150 } = body;
      if (!values || values.length === 0) return Response.json({ rows: [] });
      const results = await mapWithConcurrencyLimit(chunkArray(values, chunkSize), MAX_CONCURRENT_FETCHES, async (batch) => {
        const quoted = batch.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
        const { data, error } = await supabase
          .from(table)
          .select(selectColumns)
          .filter(`data->>${jsonbField}`, 'in', `(${quoted})`);
        if (error) throw error;
        return data || [];
      });
      rows = results.flat();
    } else if (operation === 'filterIdIn') {
      const { ids, selectColumns = 'data', chunkSize = 150 } = body;
      if (!ids || ids.length === 0) return Response.json({ rows: [] });
      const results = await mapWithConcurrencyLimit(chunkArray(ids, chunkSize), MAX_CONCURRENT_FETCHES, async (batch) => {
        const { data, error } = await supabase
          .from(table)
          .select(selectColumns)
          .in('id', batch);
        if (error) throw error;
        return data || [];
      });
      rows = results.flat();
    } else if (operation === 'selectAllPaginated') {
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

    if (project === 'automate' && table === 'flight_emails') {
      const fusiooUrl = Deno.env.get(PROJECTS.fusioo.urlEnv);
      const fusiooKey = Deno.env.get(PROJECTS.fusioo.keyEnv);
      if (!fusiooUrl || !fusiooKey) {
        return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
      }
      const fusioo = createClient(fusiooUrl, fusiooKey);
      rows = await scopeFlightEmailsRows(rows, requester, fusioo);
    }

    return Response.json({ rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
