/**
 * Multi-airline flight email -> Supabase sync.
 * Paste this whole file into script.google.com as Code.gs.
 *
 * Required Script Properties (Project Settings > Script Properties):
 *   SUPABASE_URL  - e.g. https://xxxx.supabase.co
 *   SUPABASE_KEY  - the Supabase service_role key (legacy JWT style, starts
 *                   with "eyJ..." — Supabase's newer "sb_secret_..." keys get
 *                   blocked when called from Apps Script's UrlFetchApp, see
 *                   saveToSupabase_ below). Never use this key in frontend/
 *                   browser code.
 *
 * Entry points:
 *   fetchAllHistoricalEmails - run ONCE manually per airline, from the Apps
 *                              Script editor. Backfills matching emails on/
 *                              after CONFIG.HISTORICAL_AFTER_DATE for every
 *                              airline in the AIRLINES list, so the Supabase
 *                              table and admin UI immediately show historical
 *                              data instead of waiting for new emails to
 *                              arrive. Adjust or null out that date to widen
 *                              the backfill.
 *   fetchNewEmails           - the one to put on the time-based trigger
 *                              (every 5 minutes). Only picks up emails that
 *                              haven't been processed yet (no date limit).
 *
 * Both call the same underlying sync logic and are safe to re-run: already
 * labeled threads (Processed / NeedsReview) are excluded from the Gmail
 * search, so running either function again just picks up where it left off.
 *
 * ADDING A NEW AIRLINE: each airline's emails look completely different, so
 * there's no generic parser — every airline needs its own detectEmailType/
 * parseBookingRef/parseFlights functions, verified against a REAL sample
 * email (use debugLogSample() below to pull one). Guessing the format without
 * a real sample does not work reliably — Cebu Pacific's parser needed 3
 * rounds of fixes against real emails before it matched correctly. Once
 * verified, add an entry to the AIRLINES array below.
 */

const CONFIG = {
  LABEL_PROCESSED: 'Processed',
  LABEL_NEEDS_REVIEW: 'NeedsReview',
  PAGE_SIZE: 100,
  // fetchAllHistoricalEmails only pulls emails on/after this date (Gmail
  // search format: YYYY/MM/DD) instead of the entire mailbox history, so the
  // initial backfill doesn't take days on a mailbox with years of emails.
  // Set to null to remove the cutoff and fetch full history.
  HISTORICAL_AFTER_DATE: '2026/06/01',
  // Safety cap for the 5-minute trigger — in practice the -label filter keeps
  // each run small, this just guards against an unexpected backlog spike.
  NEW_EMAILS_MAX_THREADS: 500,
  // Leave headroom under Apps Script's ~6 minute execution limit so a run on
  // a very large mailbox stops cleanly instead of getting killed mid-thread.
  MAX_RUNTIME_MS: 5 * 60 * 1000,
};

// Each entry: { name, senderQuery, detectEmailType, parseBookingRef, parseFlights }.
// senderQuery is a Gmail search fragment, e.g. 'from:(a@x.com OR b@y.com)'.
const AIRLINES = [
  // AirAsia listed first (much smaller backlog than Cebu Pacific) so it gets
  // its turn within the time budget instead of waiting for Cebu Pacific's
  // much larger backlog to fully drain across many manual runs.
  {
    name: 'AirAsia',
    senderQuery: 'from:noreplycustsupport@airasia.com',
    detectEmailType: detectAirAsiaType_,
    parseBookingRef: parseAirAsiaBookingRef_,
    parseFlights: parseAirAsiaFlights_,
  },
  {
    name: 'Cebu Pacific',
    // NOTE: noreply@groups.cebupacificair.com was tried here too, but that's
    // Cebu Pacific's B2B GROUP QUOTATION system (subjects like "Quotation
    // sent (Ref ID GRP...)", "Payment expiry alert") — a completely different
    // email stream, not individual flight bookings. It flooded NeedsReview
    // with false parse errors (quotation emails happen to say "confirmed"
    // somewhere in the body, tripping detectCebuPacificType_). Deliberately
    // excluded.
    senderQuery: 'from:(no-reply@email.mycebupacific.com OR noreply@cebupacificair.com)',
    detectEmailType: detectCebuPacificType_,
    parseBookingRef: parseCebuPacificBookingRef_,
    parseFlights: parseCebuPacificFlights_,
  },
];

/**
 * Run this ONCE manually (Apps Script editor > select this function > Run) to
 * backfill flight emails on/after CONFIG.HISTORICAL_AFTER_DATE, for every
 * airline in AIRLINES. Use this right after setup (or after adding a new
 * airline) to confirm the whole pipeline (Gmail -> Supabase -> admin UI)
 * works, without waiting for a new email to arrive.
 *
 * If there's still a lot of matching emails, one run may not finish before
 * the execution time limit — that's fine, it stops cleanly and logs how far
 * it got. Just run the function again and it continues with what's left.
 */
function fetchAllHistoricalEmails() {
  runSync_(CONFIG.HISTORICAL_AFTER_DATE, Infinity);
}

/**
 * Entry point for the time-based trigger (every 5 minutes). Only fetches
 * emails that haven't been processed yet — no date limit, since a new email
 * is always recent anyway.
 */
function fetchNewEmails() {
  runSync_(null, CONFIG.NEW_EMAILS_MAX_THREADS);
}

function buildQuery_(airline, afterDate) {
  let query = airline.senderQuery +
    ' -label:' + CONFIG.LABEL_PROCESSED +
    ' -label:' + CONFIG.LABEL_NEEDS_REVIEW;
  if (afterDate) {
    query += ' after:' + afterDate;
  }
  return query;
}

function runSync_(afterDate, maxThreadsPerAirline) {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const supabaseKey = props.getProperty('SUPABASE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    Logger.log('ERROR: Set SUPABASE_URL and SUPABASE_KEY in Project Settings > Script Properties before running.');
    return;
  }

  const processedLabel = getOrCreateLabel_(CONFIG.LABEL_PROCESSED);
  const needsReviewLabel = getOrCreateLabel_(CONFIG.LABEL_NEEDS_REVIEW);
  const startTime = Date.now();
  let stoppedEarly = false;

  AIRLINES.forEach(function (airline) {
    if (stoppedEarly) return; // out of time budget — skip remaining airlines this run

    const query = buildQuery_(airline, afterDate);
    let saved = 0, duplicates = 0, needsReview = 0, networkErrors = 0, threadsSeen = 0;

    while (threadsSeen < maxThreadsPerAirline) {
      if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
        stoppedEarly = true;
        break;
      }

      // Always search from the top: threads get labeled (Processed/NeedsReview)
      // as they're handled below, which drops them out of this query's results —
      // so position 0 always holds the next not-yet-handled batch. Paginating
      // with an incrementing offset here would skip threads, since the result
      // set shrinks out from under a fixed offset as labels get applied.
      const batchSize = Math.min(CONFIG.PAGE_SIZE, maxThreadsPerAirline - threadsSeen);
      const batch = GmailApp.search(query, 0, batchSize);
      if (batch.length === 0) break;

      batch.forEach(function (thread) {
        const messages = thread.getMessages();
        let threadHasNetworkError = false;
        let threadHasParseError = false;

        messages.forEach(function (message) {
          let result;
          try {
            result = processMessage_(message, airline, supabaseUrl, supabaseKey);
          } catch (err) {
            Logger.log('UNEXPECTED ERROR on message ' + message.getId() + ': ' + err);
            result = 'network_error';
          }

          if (result === 'success') saved++;
          else if (result === 'duplicate') duplicates++;
          else if (result === 'parse_error') { needsReview++; threadHasParseError = true; }
          else if (result === 'network_error') { networkErrors++; threadHasNetworkError = true; }
        });

        // A network error means Supabase may not have received the data yet, so
        // leave the whole thread unlabeled and let the next run retry it.
        if (threadHasNetworkError) return;
        thread.addLabel(threadHasParseError ? needsReviewLabel : processedLabel);
      });

      threadsSeen += batch.length;
      if (batch.length < batchSize) break; // last page
    }

    Logger.log(
      '[' + airline.name + '] threads scanned: ' + threadsSeen +
      ', saved: ' + saved +
      ', duplicates skipped: ' + duplicates +
      ', needs review: ' + needsReview +
      ', network errors (will retry next run): ' + networkErrors
    );
  });

  if (stoppedEarly) {
    Logger.log('Stopped early to avoid the execution time limit — run this function again to continue with the rest.');
  }
}

function processMessage_(message, airline, supabaseUrl, supabaseKey) {
  const subject = message.getSubject() || '';
  const body = message.getPlainBody() || '';
  const receivedDate = message.getDate();
  const gmailMessageId = message.getId();

  const emailType = airline.detectEmailType(subject, body);
  if (!emailType) {
    Logger.log('SKIP (unrecognized email type): "' + subject + '" [' + gmailMessageId + ']');
    return 'parse_error';
  }

  const bookingRef = airline.parseBookingRef(body);
  const flights = airline.parseFlights(body);

  if (!bookingRef || flights.length === 0) {
    Logger.log(
      'PARSE ERROR: could not extract booking_ref/flights from "' + subject + '" [' + gmailMessageId + ']' +
      ' (bookingRef=' + bookingRef + ', flights found=' + flights.length + ')'
    );
    return 'parse_error';
  }

  const record = {
    airline: airline.name,
    booking_ref: bookingRef,
    email_type: emailType,
    flights: flights,
    received_date: receivedDate.toISOString(),
    gmail_message_id: gmailMessageId,
  };

  return saveToSupabase_(record, supabaseUrl, supabaseKey);
}

// ============================================================
// Cebu Pacific — verified against real "Itinerary Receipt" emails.
// ============================================================

function detectCebuPacificType_(subject, body) {
  const subj = subject.toLowerCase();
  const bod = body.toLowerCase();

  // Check the more specific types first so e.g. "Reschedule Confirmation"
  // doesn't get misclassified as a plain booking confirmation.
  if (subj.indexOf('cancell') !== -1) return 'cancellation';
  if (subj.indexOf('reschedule') !== -1) return 'reschedule';
  if (subj.indexOf('itinerary receipt') !== -1 || bod.indexOf('confirmed') !== -1) return 'confirmation';

  return null;
}

function parseCebuPacificBookingRef_(body) {
  const match = body.match(/BOOKING REFERENCE NO\.?\s*[:\-]?\s*([A-Z0-9]{5,8})/i);
  return match ? match[1].toUpperCase() : null;
}

function parseCebuPacificFlights_(body) {
  // Layout per leg:
  //   MNL-MPH
  //      5J  909
  //   21 Aug 2026 DEPARTURE
  //   1:30pm Manila - Ninoy Aquino International Airport Terminal 3
  //   21 Aug 2026 ARRIVAL
  //   2:40pm Boracay (Caticlan) - Godofredo P. Ramos Airport
  // Date and time are on separate lines with the literal word
  // DEPARTURE/ARRIVAL between them (not adjacent), and the flight number can
  // have multiple spaces before the digits (e.g. "5J  909").
  const flights = [];
  const flightNoRegex = /5J\s*\d{2,4}/gi;
  const routeRegex = /\b([A-Z]{3})\s*(?:-|–|to|>)\s*([A-Z]{3})\b/;
  const departureRegex = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+DEPARTURE\s+(\d{1,2}:\d{2}\s?(?:AM|PM)?)/i;
  const arrivalRegex = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+ARRIVAL\s+(\d{1,2}:\d{2}\s?(?:AM|PM)?)/i;

  const flightMatches = [];
  let m;
  while ((m = flightNoRegex.exec(body)) !== null) {
    flightMatches.push({ text: m[0].toUpperCase().replace(/^5J\s*/i, '5J '), index: m.index });
  }

  flightMatches.forEach(function (fm) {
    // Route sits just before the flight number — look backward only.
    const routeWindowStart = Math.max(0, fm.index - 150);
    const routeWin = body.slice(routeWindowStart, fm.index);
    const routeMatch = routeWin.match(routeRegex);

    // Departure/arrival sit after the flight number — look forward only.
    // Forward-only matters: on the 2nd+ leg, a backward-looking window would
    // still contain the PREVIOUS leg's arrival block, and since .match()
    // returns the leftmost match, it would grab that stale arrival instead
    // of this leg's own one. Starting exactly at fm.index avoids that.
    const dtWindowEnd = Math.min(body.length, fm.index + 600);
    const dtWin = body.slice(fm.index, dtWindowEnd);
    const departureMatch = dtWin.match(departureRegex);
    const arrivalMatch = dtWin.match(arrivalRegex);

    if (!routeMatch || !departureMatch || !arrivalMatch) return;

    const origin = routeMatch[1].toUpperCase();
    const destination = routeMatch[2].toUpperCase();

    flights.push({
      route: origin + '-' + destination,
      flight_no: fm.text,
      origin: origin,
      destination: destination,
      departure_date: normalizeDate_(departureMatch[1]),
      departure_time: normalizeTime_(departureMatch[2]),
      arrival_date: normalizeDate_(arrivalMatch[1]),
      arrival_time: normalizeTime_(arrivalMatch[2]),
    });
  });

  return flights;
}

// ============================================================
// AirAsia — verified against a real "Flight Reschedule Notice" email from
// noreplycustsupport@airasia.com. This sender only sends reschedule notices
// to this mailbox (no confirmation/cancellation sample seen yet) — if one
// shows up, detectAirAsiaType_ below will flag it as "confirmation"/
// "cancellation" but parseAirAsiaFlights_ may not match its layout, so it'll
// land in NeedsReview for manual follow-up rather than silently mis-parsing.
// ============================================================

function detectAirAsiaType_(subject, body) {
  const subj = subject.toLowerCase();
  if (subj.indexOf('cancel') !== -1) return 'cancellation';
  if (subj.indexOf('reschedule') !== -1) return 'reschedule';
  if (subj.indexOf('confirmation') !== -1 || subj.indexOf('itinerary') !== -1 || subj.indexOf('e-ticket') !== -1) return 'confirmation';
  return null;
}

function parseAirAsiaBookingRef_(body) {
  const match = body.match(/Booking number\s*:\s*([A-Z0-9]{5,8})/i);
  return match ? match[1].toUpperCase() : null;
}

function parseAirAsiaFlights_(body) {
  // Layout (plain-text rendering of a 2-column "Original | Revised" table):
  //   Don Mueang International Airport (DMK) to Chiang Mai International Airport (CNX)
  //   Flight Number: FD 8439
  //   Depart date: 03-Aug-2026
  //   Depart: 20:45hrs      <- ORIGINAL time (before the reschedule)
  //   Arrive: 22:00hrs
  //   Don Mueang International Airport (DMK) to Chiang Mai International Airport (CNX)
  //   Flight Number: FD 8439
  //   Depart date: 03-Aug-2026
  //   Depart: 17:05hrs      <- REVISED time (the actual new schedule)
  //   Arrive: 18:25hrs
  // The whole block repeats once per leg, with the same flight number/route
  // appearing in both the original and revised block. departure_time/
  // arrival_time always hold the REVISED (current) schedule; original_*
  // fields hold the pre-reschedule time so the admin UI can show a before/
  // after comparison — only set when an original block was actually found
  // and its time differs from the revised one.
  const flights = [];
  const flightNoRegex = /Flight Number:\s*([A-Z]{2}\s*\d{2,4})/gi;
  const routeRegex = /\(([A-Z]{3})\)\s*(?:to|-|–)\s*[^(]*\(([A-Z]{3})\)/i;
  const dateRegex = /Depart date:\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i;
  const departRegex = /Depart:\s*(\d{1,2}:\d{2})hrs/i;
  const arriveRegex = /Arrive:\s*(\d{1,2}:\d{2})hrs/i;

  const allMatches = [];
  let m;
  while ((m = flightNoRegex.exec(body)) !== null) {
    allMatches.push({ text: m[1].toUpperCase().replace(/\s+/, ' '), index: m.index });
  }

  // Group occurrences by flight number — normally exactly 2 per leg (original
  // block, then revised block). More than one affected leg just means more
  // distinct flight number groups, each handled independently.
  const occurrencesByFlightNo = {};
  allMatches.forEach(function (fm) {
    (occurrencesByFlightNo[fm.text] = occurrencesByFlightNo[fm.text] || []).push(fm);
  });

  function extractLegAt(fm) {
    const routeWindowStart = Math.max(0, fm.index - 200);
    const routeWin = body.slice(routeWindowStart, fm.index);
    const routeMatch = routeWin.match(routeRegex);

    const fwdWindowEnd = Math.min(body.length, fm.index + 300);
    const fwdWin = body.slice(fm.index, fwdWindowEnd);
    const dateMatch = fwdWin.match(dateRegex);
    const departMatch = fwdWin.match(departRegex);
    const arriveMatch = fwdWin.match(arriveRegex);

    if (!routeMatch || !dateMatch || !departMatch || !arriveMatch) return null;

    return {
      origin: routeMatch[1].toUpperCase(),
      destination: routeMatch[2].toUpperCase(),
      date: normalizeDate_(dateMatch[1]),
      departTime: normalizeTime_(departMatch[1]),
      arriveTime: normalizeTime_(arriveMatch[1]),
    };
  }

  Object.keys(occurrencesByFlightNo).forEach(function (flightNoText) {
    const occurrences = occurrencesByFlightNo[flightNoText];
    const revised = extractLegAt(occurrences[occurrences.length - 1]);
    if (!revised) return;

    const original = occurrences.length > 1 ? extractLegAt(occurrences[0]) : null;
    const timeChanged = original && (original.departTime !== revised.departTime || original.arriveTime !== revised.arriveTime);

    flights.push({
      route: revised.origin + '-' + revised.destination,
      flight_no: flightNoText,
      origin: revised.origin,
      destination: revised.destination,
      departure_date: revised.date,
      departure_time: revised.departTime,
      arrival_date: revised.date,
      arrival_time: revised.arriveTime,
      original_departure_time: timeChanged ? original.departTime : null,
      original_arrival_time: timeChanged ? original.arriveTime : null,
    });
  });

  return flights;
}

// ============================================================
// Shared helpers
// ============================================================

function normalizeDate_(raw) {
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  // Splits on space or dash so it handles both "21 Aug 2026" (Cebu Pacific)
  // and "03-Aug-2026" (AirAsia) without needing a per-airline date parser.
  const parts = raw.trim().split(/[-\s]+/);
  if (parts.length < 3) return raw.trim();
  const day = parts[0].padStart(2, '0');
  const mon = months[parts[1].slice(0, 3).toLowerCase()] || '01';
  const year = parts[2];
  return year + '-' + mon + '-' + day;
}

function normalizeTime_(raw) {
  const m = raw.trim().match(/(\d{1,2}):(\d{2})\s?(AM|PM)?/i);
  if (!m) return raw.trim();
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const meridiem = m[3] ? m[3].toUpperCase() : null;
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return String(hour).padStart(2, '0') + ':' + minute;
}

function saveToSupabase_(record, supabaseUrl, supabaseKey) {
  const url = supabaseUrl.replace(/\/$/, '') + '/rest/v1/flight_emails?on_conflict=gmail_message_id';
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      // ignore-duplicates -> ON CONFLICT DO NOTHING on gmail_message_id, no error thrown.
      // return=representation -> lets us tell "inserted" (rows.length > 0) apart from
      // "duplicate, ignored" (rows.length === 0) using the same response.
      Prefer: 'resolution=ignore-duplicates,return=representation',
      // Apps Script's default UrlFetchApp User-Agent starts with "Mozilla/5.0",
      // which trips Supabase's secret-key browser-use protection (it rejects
      // secret keys on requests that look like they came from a browser).
      // Overriding it identifies this as a server-side script instead.
      'User-Agent': 'GladexTours-FlightSync/1.0 (Google Apps Script; server-side)',
    },
    payload: JSON.stringify(record),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      let rows = [];
      try { rows = JSON.parse(response.getContentText() || '[]'); } catch (e) { rows = []; }

      if (rows.length > 0) {
        Logger.log('SAVED: ' + record.booking_ref + ' (' + record.airline + ', ' + record.email_type + ') [' + record.gmail_message_id + ']');
        return 'success';
      }
      Logger.log('DUPLICATE (already saved, skipped): ' + record.gmail_message_id);
      return 'duplicate';
    }

    Logger.log('SUPABASE ERROR (' + code + ') for ' + record.gmail_message_id + ': ' + response.getContentText());
    return 'network_error';
  } catch (err) {
    Logger.log('SUPABASE UNREACHABLE for ' + record.gmail_message_id + ': ' + err);
    return 'network_error';
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ============================================================
// Debug / maintenance helpers
// ============================================================

/**
 * Discovery helper — run this to find out which airlines actually email this
 * Gmail account. Scans broadly for flight-booking-shaped subjects and lists
 * distinct senders with how many matching emails each has, so we know which
 * ones are worth adding (and roughly how much history each has).
 */
function debugDiscoverAirlineSenders() {
  const query = 'subject:(itinerary OR "booking reference" OR "e-ticket" OR eticket OR "flight confirmation" OR "boarding pass" OR reschedule OR cancellation OR PNR) after:2025/01/01';
  const threads = GmailApp.search(query, 0, 500);

  const senderCounts = {};
  threads.forEach(function (thread) {
    const from = thread.getMessages()[0].getFrom();
    senderCounts[from] = (senderCounts[from] || 0) + 1;
  });

  const sorted = Object.keys(senderCounts).sort(function (a, b) {
    return senderCounts[b] - senderCounts[a];
  });

  Logger.log('Scanned ' + threads.length + ' matching thread(s) across ' + sorted.length + ' distinct sender(s):');
  sorted.forEach(function (sender) {
    Logger.log(senderCounts[sender] + 'x   ' + sender);
  });
}

/**
 * Debug helper — lists subject lines (not full bodies) of emails matching the
 * same broad flight-booking keyword set used by debugDiscoverAirlineSenders,
 * scoped to one sender. Run this FIRST when adding a new airline, to see the
 * airline's real subject wording before guessing keywords for debugLogSample.
 */
function debugListSubjects() {
  const gmailSearchFrom = 'noreplycustsupport@airasia.com'; // <- change this to inspect a different sender
  const query = 'from:' + gmailSearchFrom +
    ' subject:(itinerary OR "booking reference" OR "e-ticket" OR eticket OR "flight confirmation" OR "boarding pass" OR reschedule OR cancellation OR PNR OR confirmation OR receipt OR booking)';
  const threads = GmailApp.search(query, 0, 15);
  Logger.log('Found ' + threads.length + ' matching thread(s) for ' + gmailSearchFrom + ':');
  threads.forEach(function (thread, i) {
    Logger.log((i + 1) + '. ' + thread.getMessages()[0].getSubject());
  });
}

/**
 * Debug helper — logs the raw subject/body of the most recent BOOKING-shaped
 * email (confirmation/itinerary/e-ticket) from a given sender, so a new
 * airline's real format can be checked before writing its detectEmailType/
 * parseBookingRef/parseFlights functions. A plain "from:" search can surface
 * unrelated automated mail (support case follow-ups, marketing, etc.), so
 * this narrows to likely booking subjects first. Edit gmailSearchFrom below
 * to the sender you want to inspect, then run this function.
 */
function debugLogSample() {
  const gmailSearchFrom = 'noreplycustsupport@airasia.com'; // <- change this to inspect a different sender
  const query = 'from:' + gmailSearchFrom + ' subject:"AirAsia Flight Reschedule Notice"';
  let threads = GmailApp.search(query, 0, 1);
  if (threads.length === 0) {
    Logger.log('No booking-shaped email found for ' + gmailSearchFrom + ' — falling back to most recent email from this sender (may not be a booking email).');
    threads = GmailApp.search('from:' + gmailSearchFrom, 0, 1);
  }
  if (threads.length === 0) {
    Logger.log('No matching emails found for sender: ' + gmailSearchFrom);
    return;
  }
  const message = threads[0].getMessages()[0];
  Logger.log('SUBJECT: ' + message.getSubject());
  Logger.log('BODY:\n' + message.getPlainBody());
}

/**
 * Debug helper — dumps a slice of the raw body around a heading (default
 * "Flight Details") with whitespace made visible (regular space vs tab vs
 * non-breaking space vs newline), since Gmail's HTML-to-plain-text conversion
 * can insert characters that look identical in a normal log but behave
 * differently in a regex. Edit gmailSearchFrom/headingPattern to match the
 * airline/section you're debugging.
 */
function debugInspectSection() {
  const gmailSearchFrom = 'noreplycustsupport@airasia.com'; // <- change this to inspect a different sender
  const headingPattern = /flight details|itinerary|departure/i; // <- change this to the heading you're looking for

  const threads = GmailApp.search('from:' + gmailSearchFrom, 0, 1);
  if (threads.length === 0) {
    Logger.log('No matching emails found for sender: ' + gmailSearchFrom);
    return;
  }
  const body = threads[0].getMessages()[0].getPlainBody();
  const idx = body.search(headingPattern);
  const start = Math.max(0, idx === -1 ? 0 : idx);
  const snippet = body.slice(start, start + 800);
  Logger.log('Snippet length: ' + snippet.length + (idx === -1 ? ' (heading not found — showing from the top instead)' : ''));
  Logger.log(visualizeWhitespace_(snippet));
}

function visualizeWhitespace_(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 10) out += '[NL]\n';
    else if (code === 13) out += '[CR]';
    else if (code === 9) out += '[TAB]';
    else if (code === 160) out += '[NBSP]';
    else if (code === 32) out += ' ';
    else if (code < 32) out += '[U+' + code.toString(16) + ']';
    else out += str[i];
  }
  return out;
}

/**
 * Run this AFTER fixing a parsing bug to give already-flagged emails another
 * chance. Removes the NeedsReview label from every thread that has it, so
 * the next fetchAllHistoricalEmails/fetchNewEmails run reprocesses them with
 * the corrected logic instead of skipping them forever.
 */
function resetNeedsReviewEmails() {
  const label = GmailApp.getUserLabelByName(CONFIG.LABEL_NEEDS_REVIEW);
  if (!label) {
    Logger.log('No NeedsReview label found — nothing to reset.');
    return;
  }
  const threads = label.getThreads();
  threads.forEach(function (thread) {
    thread.removeLabel(label);
  });
  Logger.log('Removed NeedsReview label from ' + threads.length + ' thread(s). Run fetchAllHistoricalEmails again to reprocess them.');
}
