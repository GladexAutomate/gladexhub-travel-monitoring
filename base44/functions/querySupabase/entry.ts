import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

// Flexible Supabase proxy — the Base44 frontend can't read VITE_ env vars
// at runtime (see src/lib/supabase*.js), so all direct Supabase queries
// from AdminFlightManagement.jsx route through here. The backend reads
// project credentials via Deno.env and validates every request against a
// strict project + table whitelist.
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

// Mirrors AdminFlightManagement.jsx's accessScoped/gdxByBookingRef exactly
// (same join path, same trim/lowercase comparisons) — this used to be the
// KNOWN GAP noted below: an active 'agent' or 'team_leader' could call this
// function directly (bypassing the frontend's client-side filter entirely)
// and receive the FULL, unscoped flight_emails table. Only applies to
// flight_emails; every other table this function serves has no per-row RBAC
// requirement to begin with.
async function scopeFlightEmailsRows(rows, requester, fusioo) {
  const role = requester.role_override || requester.role;
  if (role === 'admin' || role === 'super_admin') return rows; // unrestricted, same as ADMIN_LIKE_ROLES client-side

  // Anything other than agent/team_leader (e.g. 'hr', or no role) gets
  // nothing — matches accessScoped's `return false` fallthrough exactly.
  if (role !== 'agent' && role !== 'team_leader') return [];

  const bookingRefs = Array.from(new Set(rows.map((r) => r.booking_ref).filter(Boolean)));
  if (bookingRefs.length === 0) return [];

  // Step 1: booking_ref -> fusioo_ticket_details.booking_transactions link.
  const tickets = await fusiooFilterJsonbIn(fusioo, 'fusioo_ticket_details', 'booking_reference_number_pnr', bookingRefs);
  const bookingIds = Array.from(new Set(tickets.flatMap((t) => t.data.booking_transactions || [])));

  // Step 2: fusioo_booking_transactions.id -> name_of_agent (per-booking agent).
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
    const myName = (requester.full_name || '').trim().toLowerCase();
    return rows.filter((r) => (agentNameByBookingRef[r.booking_ref] || '').trim().toLowerCase() === myName);
  }

  // team_leader: need each matched agent's PRIMARY team — majority vote
  // across ALL of fusioo_booking_transactions (an agent's team tag varies
  // per-transaction), same as agentPrimaryTeam client-side. This is a full
  // table scan on every team_leader call — heavier than the agent path, but
  // correctness here is the point of this fix, not speed.
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
  const results = await Promise.all(
    chunkArray(values, 150).map(async (batch) => {
      const quoted = batch.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',');
      const { data, error } = await fusioo.from(table).select('id,data').filter(`data->>${jsonbField}`, 'in', `(${quoted})`);
      if (error) throw error;
      return data || [];
    })
  );
  return results.flat();
}

async function fusiooFilterIdIn(fusioo, table, ids) {
  const results = await Promise.all(
    chunkArray(ids, 150).map(async (batch) => {
      const { data, error } = await fusioo.from(table).select('id,data').in('id', batch);
      if (error) throw error;
      return data || [];
    })
  );
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
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project, table, operation, requesterEmail } = body;

    // Flight-tracker auth: validate the caller is an active employee. NOT
    // base44.auth.me() — flight tracker users authenticate via the
    // employeeaccount table (see useAuth.js / employeeLogin), not base44
    // auth, so there is no base44 token on the request. Same pattern as
    // employeeList / validateSession.
    const emailLower = (requesterEmail || '').trim().toLowerCase();
    if (!emailLower) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const requesterRows = await base44.asServiceRole.entities.SyncedEmployee.filter({
      email: emailLower,
    });
    const requester = requesterRows[0];
    if (!requester) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // An admin-issued override always wins over the synced value — see
    // role_override/is_active_override on the SyncedEmployee entity.
    const requesterActive = requester.is_active_override !== null && requester.is_active_override !== undefined
      ? requester.is_active_override
      : requester.is_active;
    const requesterRole = requester.role_override || requester.role;
    if (!requesterActive) {
      return Response.json({ error: 'Account deactivated' }, { status: 403 });
    }
    if (!requesterRole) {
      return Response.json({ error: 'Account role not assigned' }, { status: 403 });
    }

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

    // Server-side RBAC enforcement for flight_emails — the frontend's own
    // accessScoped filter still runs too, but this is what actually closes
    // the gap: a non-admin employee calling this function directly (curl,
    // browser console, etc.) no longer receives the unscoped table.
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