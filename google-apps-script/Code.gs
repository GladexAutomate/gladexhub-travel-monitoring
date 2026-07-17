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
  HISTORICAL_AFTER_DATE: '2026/01/01',
  // Safety cap for the 5-minute trigger — in practice the -label filter keeps
  // each run small, this just guards against an unexpected backlog spike.
  NEW_EMAILS_MAX_THREADS: 500,
  // Leave headroom under Apps Script's ~6 minute execution limit so a run on
  // a very large mailbox stops cleanly instead of getting killed mid-thread.
  MAX_RUNTIME_MS: 5 * 60 * 1000,
  // Label applied by checkForUnknownAirlineSenders_ below — a flight-shaped
  // email from a sender NOT in KNOWN_AIRLINE_SENDERS (airline changed its
  // sending address, or a genuinely new airline) so it's still visible
  // instead of silently never matching any AIRLINES[].senderQuery.
  LABEL_UNKNOWN_SENDER: 'UnknownAirlineSender',
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
  {
    name: 'HK Express',
    senderQuery: 'from:noreply@yourbooking.hkexpress.com',
    detectEmailType: detectHKExpressType_,
    parseBookingRef: parseHKExpressBookingRef_,
    parseFlights: parseHKExpressFlights_,
  },
  {
    name: 'Philippine Airlines',
    senderQuery: 'from:noreply@philippineairlines.com',
    detectEmailType: detectPALType_,
    parseBookingRef: parsePALBookingRef_,
    parseFlights: parsePALFlights_,
  },
];

// Flat list of every sender address configured in AIRLINES above — kept as a
// separate plain list (rather than parsing each senderQuery's Gmail-search
// syntax back apart) purely so checkForUnknownAirlineSenders_ below can do a
// simple address comparison. MUST be kept in sync by hand whenever a sender
// is added, removed, or changed above.
const KNOWN_AIRLINE_SENDERS = [
  'noreplycustsupport@airasia.com',
  'no-reply@email.mycebupacific.com',
  'noreply@cebupacificair.com',
  'noreply@yourbooking.hkexpress.com',
  'noreply@philippineairlines.com',
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

  // Safety net so a sender change or a brand-new airline is never silently
  // invisible — runs every time this does (so every 5 minutes via
  // fetchNewEmails), not just when someone remembers to check manually.
  checkForUnknownAirlineSenders_();
}

/**
 * Broadly searches ALL mail (no sender restriction) for flight-booking-shaped
 * subjects, then flags any match whose sender ISN'T in KNOWN_AIRLINE_SENDERS.
 * The per-airline loop in runSync_ can only ever find emails from senders we
 * already configured — if an airline switches its sending address, or a new
 * one starts emailing this mailbox, those emails would otherwise never
 * appear anywhere and nobody would know. This catches that case: it doesn't
 * try to parse the email (there's no parser for an unknown format yet), it
 * just labels it and sends an alert so a human can pull a real sample and
 * add a proper AIRLINES entry — same "verify against a real sample" process
 * as every other airline here.
 */
function checkForUnknownAirlineSenders_() {
  const label = getOrCreateLabel_(CONFIG.LABEL_UNKNOWN_SENDER);
  const query =
    'subject:(itinerary OR "booking reference" OR "e-ticket" OR eticket OR ' +
    '"flight confirmation" OR "boarding pass" OR reschedule OR cancellation OR ' +
    'cancelled OR "flight change" OR "schedule change" OR "schedule update" OR PNR)' +
    ' -label:' + CONFIG.LABEL_UNKNOWN_SENDER +
    ' -label:' + CONFIG.LABEL_PROCESSED +
    ' -label:' + CONFIG.LABEL_NEEDS_REVIEW;
  const threads = GmailApp.search(query, 0, 100);

  const findings = [];
  threads.forEach(function (thread) {
    const message = thread.getMessages()[0];
    const fromHeader = message.getFrom();
    const addressMatch = fromHeader.match(/<([^>]+)>/);
    const fromEmail = (addressMatch ? addressMatch[1] : fromHeader).toLowerCase();

    const isKnown = KNOWN_AIRLINE_SENDERS.some(function (known) {
      return fromEmail === known.toLowerCase();
    });
    if (isKnown) return; // already covered by the per-airline loop in runSync_

    thread.addLabel(label);
    findings.push(fromHeader + ' | ' + message.getSubject());
  });

  if (findings.length === 0) {
    Logger.log('checkForUnknownAirlineSenders_: no unrecognized-sender flight emails found.');
    return;
  }

  Logger.log('checkForUnknownAirlineSenders_: found ' + findings.length + ' email(s) from an unconfigured sender:');
  findings.forEach(function (f) { Logger.log('  ' + f); });

  const alertBody =
    'Found ' + findings.length + ' email(s) that look like flight bookings but come from ' +
    'a sender NOT configured in AIRLINES (Code.gs):\n\n' +
    findings.join('\n') +
    '\n\nThis usually means either an airline changed its sending address, or a new ' +
    'airline started emailing this mailbox. They\'ve been labeled "' + CONFIG.LABEL_UNKNOWN_SENDER + '" ' +
    'in Gmail so they won\'t repeat this alert. Pull a real sample (see debugLogSample() ' +
    'in Code.gs) and add a proper AIRLINES entry once you confirm the format.';
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Flight Tracker: unrecognized airline sender(s) found', alertBody);
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
// AirAsia — verified against real emails from noreplycustsupport@airasia.com.
// This sender only sends reschedule/reroute/cancellation notices to this
// mailbox (no fresh booking confirmation sample seen yet — bookings are made
// by agents directly, not by the customer receiving a confirmation email
// here) — three known layouts, all handled by parseAirAsiaFlights_:
//   1. "Flight Reschedule Notice" — same flight number, route repeated
//      before an original block and a revised block (Layout A/B below).
//   2. "Extended Flight Change Option" — a reroute to a different airport;
//      two different flight numbers/routes close together, each appearing
//      once (falls out of the same loop as two separate legs).
//   3. "Flight Cancellation Notice" — no Flight Number/Depart date block at
//      all, just a narrative sentence (handled by the fallback regex).
// If a genuinely new layout shows up, it'll land in NeedsReview for manual
// follow-up rather than silently mis-parsing.
// ============================================================

function detectAirAsiaType_(subject, body) {
  const subj = subject.toLowerCase();
  if (subj.indexOf('cancel') !== -1) return 'cancellation';
  // "Important Update: Extended Flight Change Option..." is a reroute
  // notice — same family as a reschedule, just a different subject phrasing
  // (verified against a real sample: no "reschedule" word in the subject at all).
  if (subj.indexOf('reschedule') !== -1 || subj.indexOf('flight change') !== -1) return 'reschedule';
  if (subj.indexOf('confirmation') !== -1 || subj.indexOf('itinerary') !== -1 || subj.indexOf('e-ticket') !== -1) return 'confirmation';
  return null;
}

function parseAirAsiaBookingRef_(body) {
  const match = body.match(/Booking number\s*:\s*([A-Z0-9]{5,8})/i);
  return match ? match[1].toUpperCase() : null;
}

function parseAirAsiaFlights_(body) {
  // TWO known layouts for a reschedule notice — AirAsia has sent both, not
  // just one, verified against real emails:
  //
  // Layout A (plain-text rendering of a 2-column "Original | Revised" table):
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
  //
  // Layout B ("URGENT: AirAsia Flight Reschedule Notice" subject, route only
  // stated ONCE in the intro paragraph, not repeated per schedule block):
  //   ...your AirAsia flight Z2711 from Manila Int'l (MNL) to Kalibo (KLO)
  //   on 10 Jul, 2026 has been rescheduled...
  //   *Original Schedule *
  //   Flight number : Z2711
  //   Departure Date : 10 Jul, 2026
  //   Depart from Manila Int'l(MNL) : 09:30hrs, local time
  //   Arrive in Kalibo (KLO) : 10:35hrs, local time
  //   *New Schedule*
  //   Flight number : Z2711
  //   Departure Date : 10 Jul, 2026
  //   Depart from Manila Int'l(MNL) : 10:00hrs, local time
  //   Arrive in Kalibo (KLO) : 11:07hrs, local time
  //
  // The whole block repeats once per leg, with the same flight number/route
  // appearing in both the original and revised block (Layout A) or just the
  // flight number repeating with route only stated once up top (Layout B).
  // departure_time/arrival_time always hold the REVISED (current) schedule;
  // original_* fields hold the pre-reschedule time so the admin UI can show
  // a before/after comparison — only set when an original block was
  // actually found and its time differs from the revised one.
  //
  // A third real layout (subject "Important Update: Extended Flight Change
  // Option...") reroutes to a DIFFERENT airport entirely — two separate
  // "Flight Number:" blocks with two DIFFERENT flight numbers/routes close
  // together (original leg, then new leg), not the same flight number
  // repeated. That case falls out of this same loop as two independent
  // single-occurrence groups — captured as two legs rather than merged into
  // one before/after comparison, which is an acceptable simplification for
  // an uncommon case (the flight actually is captured, not silently dropped).
  const flights = [];
  // [A-Z0-9] (not just [A-Z]) for the code portion — AirAsia's own airline
  // code is alphanumeric ("Z2"), and real samples show it both jammed
  // against the flight number ("Z2711") and with a space before it
  // ("Z2 426") — a letters-only code class fails to match the latter since
  // only one digit is left before the space, short of \d{2,4}'s minimum.
  const flightNoRegex = /Flight\s*[Nn]umber\s*:\s*([A-Z0-9]{1,2}\s*\d{2,4})/gi;
  // Route can appear right before the flight number (Layout A, tight
  // backward window) or much earlier in an intro paragraph (Layout B) — the
  // wide 600-char backward window covers both without needing two regexes.
  const routeRegex = /\(([A-Z]{3})\)\s*(?:to|-|–)\s*[^(]*\(([A-Z]{3})\)/gi;
  // Layout A: "Depart date: 03-Aug-2026". Layout B: "Departure Date : 10 Jul, 2026".
  const dateRegex = /Depart(?:ure)? [Dd]ate\s*:\s*(\d{1,2}[-\s][A-Za-z]{3,9},?[-\s]\d{4})/i;
  // Layout A: "Depart: 20:45hrs". Layout B: "Depart from Manila Int'l(MNL) : 09:30hrs".
  const departRegex = /Depart(?:\s+from[^:]*)?\s*:\s*(\d{1,2}:\d{2})hrs/i;
  // Layout A: "Arrive: 22:00hrs". Layout B: "Arrive in Kalibo (KLO) : 10:35hrs".
  const arriveRegex = /Arrive(?:\s+in[^:]*)?\s*:\s*(\d{1,2}:\d{2})hrs/i;

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

  // Returns the LAST match in the string, not the first — when a reroute
  // email states two different routes close together (original block, then
  // new block), the naive first-match-in-window approach would misattribute
  // the earlier (original) route to the later flight number every time.
  // Taking the last/closest match still works for the single-route cases
  // (Layout A/B), since there's only one candidate there either way.
  function lastMatchIn(text, regex) {
    let last = null;
    let mm;
    while ((mm = regex.exec(text)) !== null) {
      last = mm;
    }
    return last;
  }

  function extractLegAt(fm) {
    const routeWindowStart = Math.max(0, fm.index - 600);
    const routeWin = body.slice(routeWindowStart, fm.index);
    const routeMatch = lastMatchIn(routeWin, new RegExp(routeRegex.source, 'gi'));

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

  if (flights.length > 0) return flights;

  // Fallback: cancellation notices have no "Flight Number:"/"Depart date:"
  // block structure at all — just a narrative sentence. Verified against a
  // real sample:
  //   "...your flight Z2 426 scheduled to depart from Ninoy Aquino
  //   International Airport (MNL) to Puerto Princesa International Airport
  //   (PPS) on 27-Dec-2026 has been cancelled."
  // No specific time is ever given for a cancelled flight, only the date.
  const cancelMatch = body.match(
    /your flight\s+([A-Z0-9]{1,2}\s*\d{2,4})\s+scheduled to depart from\s+[^(]*\(([A-Z]{3})\)\s*to\s+[^(]*\(([A-Z]{3})\)\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+has been cancelled/i
  );
  if (cancelMatch) {
    flights.push({
      route: cancelMatch[2].toUpperCase() + '-' + cancelMatch[3].toUpperCase(),
      flight_no: cancelMatch[1].toUpperCase().replace(/\s+/, ' '),
      origin: cancelMatch[2].toUpperCase(),
      destination: cancelMatch[3].toUpperCase(),
      departure_date: normalizeDate_(cancelMatch[4]),
      departure_time: null,
      arrival_date: normalizeDate_(cancelMatch[4]),
      arrival_time: null,
      original_departure_time: null,
      original_arrival_time: null,
    });
  }

  return flights;
}

// ============================================================
// HK Express — verified against real emails from
// noreply@yourbooking.hkexpress.com. TWO known layouts:
//   1. "Your HK Express Itinerary" booking confirmation — has a real
//      flight number (UO + digits) per leg.
//   2. "Online Check in is now open for booking XXX" — sent closer to
//      travel date, no flight number anywhere in the email at all, just
//      route/time/date. parseHKExpressFlights_ tries the flight-number
//      layout first and falls back to the check-in layout if that finds
//      nothing.
// cancellation/reschedule wording is guessed generically in
// detectHKExpressType_ below; if either shows up with different layout,
// it'll land in NeedsReview instead of silently mis-parsing.
// ============================================================

function detectHKExpressType_(subject, body) {
  const subj = subject.toLowerCase();
  const bod = body.toLowerCase();
  if (subj.indexOf('cancel') !== -1 || bod.indexOf('has been cancelled') !== -1) return 'cancellation';
  if (subj.indexOf('reschedule') !== -1 || subj.indexOf('changed') !== -1) return 'reschedule';
  if (subj.indexOf('itinerary') !== -1 || subj.indexOf('confirmation') !== -1 || subj.indexOf('check in') !== -1 || subj.indexOf('check-in') !== -1) return 'confirmation';
  return null;
}

function parseHKExpressBookingRef_(body) {
  // Layout: "Booking reference" label, then several blank lines (Gmail's
  // HTML-table-to-plain-text conversion), then the code on its own line.
  const match = body.match(/Booking reference[\s\S]{1,30}?([A-Z0-9]{5,8})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function parseHKExpressFlights_(body) {
  // Layout per leg (each on its own line, lots of blank lines from the
  // HTML table — Departure and Return blocks look identical structurally):
  //   Departure
  //   Lite
  //   Fare Class: O
  //   01:45
  //   To
  //   04:05
  //   MNL
  //   UO517
  //   HKG
  //   08 Sep, 2026, Tue
  //   Ninoy Aquino International Airport
  //   Terminal 3
  //   08 Sep, 2026, Tue          <- arrival date (same day here; can differ
  //   Hong Kong International Airport   on an overnight flight)
  //   Terminal 1
  // Flight number is always "UO" + digits. Origin/destination are bare
  // 3-letter airport codes immediately before/after the flight number.
  //
  // Each "To" arrow between the departure/arrival time is actually a link,
  // so Gmail's plain-text rendering turns it into "To [https://...long-url]"
  // — strip that bracketed URL text first, or it both breaks the time regex
  // (the gap between "To" and the arrival time balloons past any reasonable
  // window) and pollutes the 3-letter-code search (the url path segment
  // "HKE-newsletters" contains "HKE", a false airport-code-shaped match).
  const cleanBody = body.replace(/\[https?:\/\/[^\]]*\]/g, '');
  const flights = [];
  const flightNoRegex = /\bUO\s*\d{2,4}\b/g;
  const timeRegex = /(\d{1,2}:\d{2})[\s\S]{0,60}?To[\s\S]{0,60}?(\d{1,2}:\d{2})/i;
  const dateRegex = /\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}/g;

  let m;
  while ((m = flightNoRegex.exec(cleanBody)) !== null) {
    const flightNo = m[0].toUpperCase().replace(/\s+/, '');
    const idx = m.index;

    const backWin = cleanBody.slice(Math.max(0, idx - 250), idx);
    const fwdWin = cleanBody.slice(idx, Math.min(cleanBody.length, idx + 400));

    const originMatches = backWin.match(/\b[A-Z]{3}\b/g);
    const origin = originMatches ? originMatches[originMatches.length - 1] : null;

    const destMatches = fwdWin.match(/\b[A-Z]{3}\b/g);
    const destination = destMatches ? destMatches[0] : null;

    const timeMatch = backWin.match(timeRegex);
    const dateMatches = fwdWin.match(dateRegex);

    if (!origin || !destination || !timeMatch || !dateMatches) continue;

    flights.push({
      route: origin + '-' + destination,
      flight_no: flightNo,
      origin: origin,
      destination: destination,
      departure_date: normalizeDate_(dateMatches[0]),
      departure_time: normalizeTime_(timeMatch[1]),
      arrival_date: normalizeDate_(dateMatches.length > 1 ? dateMatches[1] : dateMatches[0]),
      arrival_time: normalizeTime_(timeMatch[2]),
    });
  }

  if (flights.length > 0) return flights;
  return parseHKExpressCheckinFlights_(cleanBody);
}

// "Online Check in is now open" layout — no flight number anywhere, just:
//   HKG
//   To [url]
//   MNL
//   17:50
//   Friday, 12 June 2026
//   Hong Kong International Airport
//   Terminal 2
//   20:10
//   Friday, 12 June 2026
//   Ninoy Aquino International Airport
//   Terminal 3
// Dates include a leading day name ("Friday, ") that normalizeDate_ can't
// handle (it expects the day-number first), so the date regex here only
// captures the "DD Month YYYY" part after the comma.
function parseHKExpressCheckinFlights_(cleanBody) {
  const flights = [];
  const legRegex = /\b([A-Z]{3})\b\s*\n+\s*To\s*\n+\s*([A-Z]{3})\b/gi;
  const dateRegex = /[A-Za-z]+,\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/g;

  let m;
  while ((m = legRegex.exec(cleanBody)) !== null) {
    const origin = m[1].toUpperCase();
    const destination = m[2].toUpperCase();
    const fwdWin = cleanBody.slice(m.index, Math.min(cleanBody.length, m.index + 600));
    const times = fwdWin.match(/\d{1,2}:\d{2}/g);
    const dates = Array.from(fwdWin.matchAll(dateRegex)).map((d) => d[1]);

    if (!times || times.length < 2 || dates.length < 2) continue;

    flights.push({
      route: origin + "-" + destination,
      flight_no: null,
      origin: origin,
      destination: destination,
      departure_date: normalizeDate_(dates[0]),
      departure_time: normalizeTime_(times[0]),
      arrival_date: normalizeDate_(dates[1]),
      arrival_time: normalizeTime_(times[1]),
    });
  }

  return flights;
}

// ============================================================
// Philippine Airlines — verified against a real "Boarding Pass" check-in
// notification from noreply@philippineairlines.com. Very low volume from
// this sender (1-2 emails total seen in discovery) and a different email
// event than the booking-confirmation/reschedule/cancellation lifecycle
// tracked for other airlines — treated as 'confirmation' anyway since it
// carries the same route/flight/date info and there's no dedicated
// "boarding_pass" email_type in the admin UI. If a real booking
// confirmation or reschedule/cancellation email from this sender shows up
// with different wording/layout, detectPALType_/parsePALFlights_ may not
// match it — check NeedsReview.
// ============================================================

function detectPALType_(subject, body) {
  const subj = subject.toLowerCase();
  const bod = body.toLowerCase();
  if (subj.indexOf('cancel') !== -1 || bod.indexOf('has been cancelled') !== -1) return 'cancellation';
  // "Your Flight Change is Confirmed - ..." is a reschedule, not a fresh
  // booking confirmation — verified against a real sample. Checked before
  // the confirm check below since that subject also contains "confirmed".
  if (subj.indexOf('reschedul') !== -1 || subj.indexOf('rebook') !== -1 || subj.indexOf('flight change') !== -1) return 'reschedule';
  // 'confirm' (not just 'confirmation') so "...is Confirmed" subjects match too.
  if (subj.indexOf('boarding pass') !== -1 || subj.indexOf('check') !== -1 || subj.indexOf('itinerary') !== -1 || subj.indexOf('confirm') !== -1) return 'confirmation';
  return null;
}

function parsePALBookingRef_(body) {
  // Layout: "...checked in for your flight. *YF8I3E*" immediately followed
  // by the literal label "BOOKING REFERENCE" on the next line.
  const match = body.match(/\*([A-Z0-9]{5,8})\*\s*\n+\s*BOOKING REFERENCE/i);
  return match ? match[1].toUpperCase() : null;
}

function parsePALFlights_(body) {
  // Layout (single leg only in the verified sample — a route with a
  // connection would need a second sample to confirm how it repeats):
  //   MNL
  //   MANILA NINOY AQUINO INTL
  //   Terminal 2 > DGT
  //   DUMAGUETE SIBULAN
  //   PR 2547
  //   Operated by PAL EXPRESS
  //   DEPARTURE ARRIVAL
  //   0605H
  //   29 Jun 2026
  //   Monday 0725H
  //   29 Jun 2026
  //   Monday
  // Times are "HHMMH" (24hr, no colon) rather than the "H:MM AM/PM" style
  // normalizeTime_ expects, so formatted directly here instead.
  // "Terminal N" before the ">" is only present when the departure airport
  // actually has a numbered terminal — smaller airports (e.g. Basco) just
  // show "BSO...> CRK" with no "Terminal" text at all, so that part of the
  // route pattern is optional.
  const flights = [];
  const routeRegex = /\b([A-Z]{3})\b[\s\S]{0,120}?(?:Terminal\s*\d*\s*)?>\s*([A-Z]{3})\b/i;
  const flightNoRegex = /\b(PR|2P)\s*(\d{2,4})\b/i;
  const timeRegex = /(\d{3,4})H\s*\n\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})[\s\S]{0,40}?(\d{3,4})H\s*\n\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i;

  const routeMatch = body.match(routeRegex);
  const flightNoMatch = body.match(flightNoRegex);
  const timeMatch = body.match(timeRegex);

  if (!routeMatch || !flightNoMatch || !timeMatch) return flights;

  flights.push({
    route: routeMatch[1].toUpperCase() + '-' + routeMatch[2].toUpperCase(),
    flight_no: (flightNoMatch[1] + ' ' + flightNoMatch[2]).toUpperCase(),
    origin: routeMatch[1].toUpperCase(),
    destination: routeMatch[2].toUpperCase(),
    departure_date: normalizeDate_(timeMatch[2]),
    departure_time: formatPALTime_(timeMatch[1]),
    arrival_date: normalizeDate_(timeMatch[4]),
    arrival_time: formatPALTime_(timeMatch[3]),
  });

  return flights;
}

function formatPALTime_(raw) {
  const digits = raw.padStart(4, "0");
  return digits.slice(0, 2) + ":" + digits.slice(2);
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
  const gmailSearchFrom = 'noreply@philippineairlines.com'; // <- change this to inspect a different sender
  const threads = GmailApp.search('from:' + gmailSearchFrom, 0, 1);
  if (threads.length === 0) {
    Logger.log('No matching emails found for sender: ' + gmailSearchFrom);
    return;
  }
  const message = threads[0].getMessages()[0];
  Logger.log('SUBJECT: ' + message.getSubject());
  Logger.log('BODY:\n' + message.getPlainBody());
}

/**
 * Debug helper — like debugLogSample but scoped by subject keyword instead
 * of "most recent from this sender", for chasing a specific email type that
 * isn't the sender's most common one (e.g. HK Express also sends "Online
 * Check in is now open" emails, a different layout than the "Itinerary"
 * confirmations debugLogSample would normally find first).
 */
function debugLogSampleBySubject() {
  const gmailSearchFrom = 'noreply@yourbooking.hkexpress.com'; // <- change this
  const subjectKeyword = 'Online Check in'; // <- change this
  const threads = GmailApp.search('from:' + gmailSearchFrom + ' subject:"' + subjectKeyword + '"', 0, 1);
  if (threads.length === 0) {
    Logger.log('No matching emails found for sender ' + gmailSearchFrom + ' with subject containing "' + subjectKeyword + '"');
    return;
  }
  const message = threads[0].getMessages()[0];
  Logger.log('SUBJECT: ' + message.getSubject());
  Logger.log('BODY:\n' + message.getPlainBody());
}

/**
 * One-shot debug helper — pulls real samples from the two new PAL sender
 * addresses checkForUnknownAirlineSenders_ surfaced (neither is the
 * noreply@philippineairlines.com already in AIRLINES): a reschedule from
 * no-reply@philippineairlines.com (note the hyphen — a DIFFERENT address),
 * plus a cancellation and a schedule-change advisory from
 * palflightadvisory@comms.philippineairlines.com. Logs all three in one run
 * so a new PAL parser can be verified against real samples without three
 * separate round-trips.
 */
function debugLogNewPALSamples() {
  function logFirst(query, label) {
    const threads = GmailApp.search(query, 0, 1);
    Logger.log('=== ' + label + ' ===');
    if (threads.length === 0) {
      Logger.log('No matching emails found for: ' + query);
      return;
    }
    const message = threads[0].getMessages()[0];
    Logger.log('SUBJECT: ' + message.getSubject());
    Logger.log('BODY:\n' + message.getPlainBody());
  }

  logFirst('from:no-reply@philippineairlines.com', 'PAL reschedule (no-reply@philippineairlines.com)');
  logFirst('from:palflightadvisory@comms.philippineairlines.com subject:"Cancellation Advisory"', 'PAL cancellation advisory');
  logFirst('from:palflightadvisory@comms.philippineairlines.com subject:"Schedule Change Advisory"', 'PAL schedule change advisory');
}

/**
 * Debug helper — fetches one exact message by its Gmail message id (the
 * bracketed id printed in runSync_'s SAVED/PARSE ERROR log lines) so a
 * specific failing email can be inspected directly instead of re-searching
 * and hoping to land on the same one.
 */
function debugLogMessageById() {
  const messageId = '19d3d164bd93af67'; // <- change this to the id from a log line
  const message = GmailApp.getMessageById(messageId);
  if (!message) {
    Logger.log('No message found for id: ' + messageId);
    return;
  }
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

/**
 * Diagnostic — run this once to find out (a) how many AirAsia emails from
 * noreplycustsupport@airasia.com actually exist in this mailbox with NO
 * label filter (so a stale Processed/NeedsReview label from an old run
 * can't hide them), and (b) which sender address(es) actually send
 * reschedule/cancellation notices for any airline — since flight_emails
 * currently has 8,052 rows and every single one is "confirmation" type,
 * meaning either those emails never arrive at all, or arrive from a sender
 * address not covered by any AIRLINES[].senderQuery (so they're never even
 * searched for, let alone parsed).
 */
function debugFindMissingEmailTypes() {
  Logger.log('=== AirAsia raw count (no label filter) ===');
  const airAsiaThreads = GmailApp.search('from:noreplycustsupport@airasia.com', 0, 50);
  Logger.log('Found ' + airAsiaThreads.length + ' AirAsia thread(s) (capped at 50).');
  airAsiaThreads.forEach(function (thread) {
    const msg = thread.getMessages()[0];
    Logger.log('  [' + msg.getId() + '] ' + msg.getSubject() + ' (' + msg.getDate() + ')');
  });

  Logger.log('=== Broad reschedule/cancellation search (any sender, last 2 years) ===');
  const query = 'subject:(reschedule OR cancelled OR cancellation OR "flight change") newer_than:2y';
  const threads = GmailApp.search(query, 0, 50);
  Logger.log('Found ' + threads.length + ' matching thread(s) (capped at 50).');
  const senderCounts = {};
  threads.forEach(function (thread) {
    const msg = thread.getMessages()[0];
    const from = msg.getFrom();
    senderCounts[from] = (senderCounts[from] || 0) + 1;
    Logger.log('  [' + msg.getId() + '] FROM: ' + from + ' | SUBJECT: ' + msg.getSubject());
  });
  Logger.log('=== Sender breakdown ===');
  Object.keys(senderCounts).forEach(function (from) {
    Logger.log('  ' + from + ': ' + senderCounts[from]);
  });
}

/**
 * Run this ONCE if flight_emails was ever pointed at a DIFFERENT Supabase
 * project before (e.g. an earlier Sales-project setup) — any thread this
 * script already labeled "Processed" back then is permanently invisible to
 * every runSync_ query (they all search "-label:Processed"), so switching
 * the SUPABASE_URL/SUPABASE_KEY Script Properties to a new project does NOT
 * bring that history along; those emails just get silently skipped forever.
 *
 * This removes the Processed label from every thread so the next
 * fetchAllHistoricalEmails does a full re-scan into whatever project is
 * currently configured. Safe to run even if nothing was actually missed —
 * saveToSupabase_ upserts on gmail_message_id with ignore-duplicates, so
 * anything already in the target table just logs as DUPLICATE, no harm.
 * This WILL take a while and re-send every historical email through
 * Supabase again — expect a long run needing several manual re-runs of
 * fetchAllHistoricalEmails to fully drain (each run stops cleanly at the
 * ~5 minute mark and picks up where it left off next time).
 */
function resetAllProcessedEmails() {
  const label = GmailApp.getUserLabelByName(CONFIG.LABEL_PROCESSED);
  if (!label) {
    Logger.log('No Processed label found — nothing to reset.');
    return;
  }
  const threads = label.getThreads();
  threads.forEach(function (thread) {
    thread.removeLabel(label);
  });
  Logger.log('Removed Processed label from ' + threads.length + ' thread(s). Run fetchAllHistoricalEmails (possibly several times) to fully re-scan and re-populate Supabase.');
}
