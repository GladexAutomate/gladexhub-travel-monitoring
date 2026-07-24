import { invokeApi } from "@/lib/vercelApi";

// Shared by AdminFlightManagement.jsx and FlightTrackerTV.jsx — both need
// the same booking_ref -> Fusioo GDX lookup, and duplicating this logic in
// two places is exactly how they drifted out of sync before (TV never got
// the "Unregistered Flights" concept Admin was given).
function invokeError(err) {
  return new Error(err.response?.data?.error || err.message);
}

export async function selectFusiooByJsonbField(table, field, values, requesterEmail) {
  if (!values || values.length === 0) return [];
  try {
    const response = await invokeApi("querySupabase", {
      project: "fusioo",
      table,
      operation: "filterJsonbIn",
      jsonbField: field,
      values,
      requesterEmail,
    });
    return (response.data.rows || []).map((row) => row.data);
  } catch (err) {
    throw invokeError(err);
  }
}

export async function selectFusiooByIds(table, ids, requesterEmail) {
  if (!ids || ids.length === 0) return [];
  try {
    const response = await invokeApi("querySupabase", {
      project: "fusioo",
      table,
      operation: "filterIdIn",
      ids,
      requesterEmail,
    });
    return (response.data.rows || []).map((row) => row.data);
  } catch (err) {
    throw invokeError(err);
  }
}

// booking_ref -> { gdx, clientName, mobile, email, teamName, agentName } for
// every ref in bookingRefs, resolved via Fusioo's ticket_details ->
// booking_transactions link. Refs with no ticket row at all, or a ticket
// with no linked booking, still get an entry (all-null) so callers can tell
// "no GDX yet" apart from "we never even checked this ref".
export async function fetchGdxByBookingRef(bookingRefs, requesterEmail) {
  if (!bookingRefs || bookingRefs.length === 0) return {};

  const tickets = await selectFusiooByJsonbField(
    "fusioo_ticket_details",
    "booking_reference_number_pnr",
    bookingRefs,
    requesterEmail
  );

  const bookingIds = Array.from(new Set(tickets.flatMap((t) => t.booking_transactions || [])));
  const bookingRows = await selectFusiooByIds("fusioo_booking_transactions", bookingIds, requesterEmail);
  const bookingsById = Object.fromEntries(bookingRows.map((b) => [b.id, b]));

  const lookup = {};
  tickets.forEach((t) => {
    const bookingId = (t.booking_transactions || [])[0] || null;
    const booking = bookingId ? bookingsById[bookingId] : null;
    const candidate = {
      gdx: booking?.gdx ?? null,
      clientName: booking?.lead_name || t.customer_last_name || null,
      mobile: booking?.mobile_1 || null,
      email: booking?.email_1 || null,
      teamName: (booking?.agent_name || [])[0] || null,
      agentName: (booking?.name_of_agent || [])[0] || null,
    };
    const existing = lookup[t.booking_reference_number_pnr];
    if (!existing || (!existing.gdx && candidate.gdx)) {
      lookup[t.booking_reference_number_pnr] = candidate;
    }
  });

  const ticketedRefs = new Set(tickets.map((t) => t.booking_reference_number_pnr));
  bookingRefs.forEach((ref) => {
    if (!ticketedRefs.has(ref) && !lookup[ref]) {
      lookup[ref] = { gdx: null, clientName: null, mobile: null, email: null, teamName: null, agentName: null };
    }
  });

  return lookup;
}
