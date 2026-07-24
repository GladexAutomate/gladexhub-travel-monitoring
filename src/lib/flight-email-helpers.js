// Shared by AdminFlightManagement.jsx and FlightTrackerTV.jsx so both pages
// agree on what "today's arrivals/departures" and "unregistered" mean —
// previously only defined in AdminFlightManagement.jsx, which is exactly
// why the TV screen's stats drifted out of sync with the admin dashboard.

export function dateKeyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayDateKey() {
  return dateKeyOffset(0);
}

// departure_date/arrival_date are stored as plain "YYYY-MM-DD" strings, so
// plain string comparison sorts/buckets correctly without any Date-object
// timezone pitfalls.
export function getPrimaryDepartureDate(record) {
  return record.flights?.[0]?.departure_date || null;
}

export function getPrimaryArrivalDate(record) {
  return record.flights?.[0]?.arrival_date || null;
}

// No GDX resolved for this booking_ref — either it matched a real Fusioo
// ticket with no linked GDX booking, or it's a genuine PNR Fusioo doesn't
// have on file. needs_attention rows are explicitly excluded: their
// booking_ref is a raw email subject line (see saveNeedsAttentionRow_ in
// Code.gs), never a real airline PNR, so they can NEVER resolve to a GDX —
// counting them here isn't "no agent assigned yet", it's just "this email
// couldn't be parsed/classified", a different problem.
export function isUnregistered(record, gdxByBookingRef) {
  return record.email_type !== "needs_attention" && !gdxByBookingRef[record.booking_ref]?.gdx;
}
