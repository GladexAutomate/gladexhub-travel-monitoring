import { createClient } from '@supabase/supabase-js';

// Flexible Supabase proxy for AdminFlightManagement.jsx's direct queries.
// Requester role/team/active-state now come from admin_accounts (local,
// fast — this is a hot path, polled every 60s) instead of a live fetch of
// the real source; validate-session.js is the authoritative freshness check
// for deactivation, running independently every 5 minutes, so this doesn't
// need to duplicate that live check on every single poll.
// Short-lived, in-memory cache for selectAllOrdered — survives across
// requests only while this serverless instance stays warm (Vercel reuses
// warm containers between nearby invocations; a cold start just starts
// empty, never wrong). Keyed on the query shape, NOT the requester — the
// raw rows are identical for everyone, RBAC scoping is applied fresh below
// on every request regardless of whether the raw rows came from cache, so
// this never leaks data across permission levels. Multiple people/tabs
// (dashboard + TV display, several admins) polling within the same few
// seconds hit this instead of Supabase each time.
const rawRowsCache = new Map();
const RAW_ROWS_CACHE_TTL_MS = 20 * 1000;

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

// A large flight_emails table (thousands of unique booking_refs) can chunk
// into 50+ batches — firing all of them at once via Promise.all blew past
// Node's default per-origin connection limit and failed outright ("fetch
// failed") on a live test against the real ~8,600-unique-ref dataset. Capped
// concurrency keeps every batch eventually served without needing a single
// connection burst large enough to trip that limit.
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

// First token + last token of a name, lowercased — drops any middle
// name(s)/initial so "Jason Carl Santos" (Fusioo) and "JASON CARL TENORIO
// SANTOS" (admin_accounts, the real full legal name) match. A single-token
// name just returns that token as-is.
function firstLastKey(name) {
  const tokens = (name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens[0] + ' ' + tokens[tokens.length - 1];
}

// Mirrors AdminFlightManagement.jsx's accessScoped/gdxByBookingRef exactly
// (same join path, same trim/lowercase comparisons) — closes the gap where
// an active 'agent' or 'team_leader' calling this function directly (curl,
// browser console, etc.) would otherwise receive the FULL, unscoped
// flight_emails table. Only applies to flight_emails.
async function scopeFlightEmailsRows(rows, requester, fusioo) {
  const role = requester.role;
  if (role === 'admin' || role === 'super_admin') return rows;

  if (role !== 'agent' && role !== 'team_leader') return [];

  // BUG FOUND on a live test against the real dataset: some flight_emails
  // rows aren't real bookings at all — needs_attention placeholders (saved
  // by Code.gs before today's noise-filter fix) whose booking_ref is the
  // raw EMAIL SUBJECT LINE instead of a real PNR, e.g. "GLADEX SM (Reference
  // Code: SJYOHV) ... Manila (MNL) ✈ Calgary Intl (YYC) - Travel Itinerary"
  // — 100+ chars, including a ✈ emoji. Passed through unfiltered, these
  // broke the Fusioo query outright ("TypeError: fetch failed", reproduced
  // even one request at a time — not a concurrency issue). They could also
  // never match a real fusioo_ticket_details.booking_reference_number_pnr
  // anyway, so excluding anything not PNR-shaped is strictly correct, not
  // just defensive.
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
    const agentName = (booking?.name_of_agent || [])[0] || null;
    if (agentName) agentNameByBookingRef[t.data.booking_reference_number_pnr] = agentName;
  });

  if (role === 'agent') {
    // First+last name only, middle name(s) dropped — admin_accounts holds
    // the full legal name from the boss's real HR records ("JASON CARL
    // TENORIO SANTOS") while Fusioo's name_of_agent is manually typed and
    // commonly drops the middle name ("Jason Carl Santos"). An exact-string
    // match found 0 matches across a real sample of agents who definitely
    // have real bookings — every 'agent'-role user was seeing zero of their
    // own bookings. Confirmed by the user: match on first+last only.
    const myKey = firstLastKey(requester.full_name);
    return rows.filter((r) => firstLastKey(agentNameByBookingRef[r.booking_ref]) === myKey);
  }

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

  const myTeam = (requester.team_name || '').trim().toLowerCase();
  return rows.filter((r) => {
    const agentName = agentNameByBookingRef[r.booking_ref];
    if (!agentName) return false;
    return (primaryTeamByAgent[agentName] || '').trim().toLowerCase() === myTeam;
  });
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { project, table, operation, requesterEmail, _token } = body;

    const emailLower = (requesterEmail || '').trim().toLowerCase();
    if (!emailLower) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const automateUrl = process.env.VITE_AUTOMATE_SUPABASE_URL;
    const serviceKey = process.env.AUTOMATE_SUPABASE_SERVICE_ROLE_KEY;
    if (!automateUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
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
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Proof the caller actually authenticated, not just that they know an
    // admin's email — this is the highest-value endpoint to guard (the only
    // one returning bulk flight_emails business data), so it can't be
    // skipped even though it wasn't in the original list of endpoints named.
    if (requesterRow.session_token && requesterRow.session_token !== _token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requesterActive = requesterRow.is_active_override !== null && requesterRow.is_active_override !== undefined
      ? requesterRow.is_active_override
      : requesterRow.is_active;
    const requesterRole = requesterRow.role_override || requesterRow.role;
    if (!requesterActive) {
      return res.status(403).json({ error: 'Account deactivated' });
    }
    if (!requesterRole) {
      return res.status(403).json({ error: 'Account role not assigned' });
    }
    const requester = { full_name: requesterRow.full_name, role: requesterRole, team_name: requesterRow.team_name };

    const proj = PROJECTS[project];
    if (!proj || !proj.tables.includes(table)) {
      return res.status(400).json({ error: 'Invalid project or table' });
    }

    const url = process.env[proj.urlEnv];
    const key = process.env[proj.keyEnv];
    if (!url || !key) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const supabase = createClient(url, key);
    let rows = [];

    if (operation === 'selectAllOrdered') {
      // minPrimaryDepartureDate: server-side equivalent of the frontend's
      // getPrimaryDepartureDate() >= cutoff filter (see
      // AdminFlightManagement.jsx) — cuts thousands of years-old backfilled
      // bookings out of the fetch entirely instead of downloading everything
      // and filtering client-side. Verified against a live count to match
      // the JS-computed result exactly before shipping this. Keeps any row
      // with no parsed departure_date at all (needs_attention placeholders),
      // matching the client-side fallback of "can't tell, so keep it".
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
      if (!values || values.length === 0) return res.status(200).json({ rows: [] });
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
      if (!ids || ids.length === 0) return res.status(200).json({ rows: [] });
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
      return res.status(400).json({ error: 'Invalid operation' });
    }

    if (project === 'automate' && table === 'flight_emails') {
      const fusiooUrl = process.env[PROJECTS.fusioo.urlEnv];
      const fusiooKey = process.env[PROJECTS.fusioo.keyEnv];
      if (!fusiooUrl || !fusiooKey) {
        return res.status(500).json({ error: 'Missing Supabase credentials' });
      }
      const fusioo = createClient(fusiooUrl, fusiooKey);
      rows = await scopeFlightEmailsRows(rows, requester, fusioo);
    }

    return res.status(200).json({ rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
