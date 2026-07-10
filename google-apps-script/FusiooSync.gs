/**
 * Fusioo apps -> Supabase sync (separate Google Apps Script file/project from
 * Code.gs — that one does Gmail flight emails, this one does Fusioo records).
 * Paste this whole file into script.google.com as FusiooSync.gs.
 *
 * Why this exists: the Sales Supabase project (bookings_6fbdd6b2,
 * ticket_details_b1d64ca0) got paused, and isn't being used anymore. The
 * real source of that data is Fusioo (where agents actually enter bookings),
 * so this pulls straight from Fusioo's API into a new "fusioo" Supabase
 * project instead.
 *
 * Required Script Properties (Project Settings > Script Properties):
 *   FUSIOO_ACCESS_TOKEN    - a Fusioo "private application" access token
 *                            (Fusioo > API Settings > your app > "generate an
 *                            access token from here"). NOT the OAuth
 *                            authorization_code one — that one only had
 *                            records/comments/users consent and expires in
 *                            ~1hr. This one is tied directly to the user who
 *                            generated it and doesn't need the Allow-screen
 *                            dance. If a run logs 401s, regenerate it from
 *                            Fusioo and update this property.
 *   FUSIOO_SUPABASE_URL    - e.g. https://snploarndnyuxapqpegi.supabase.co
 *   FUSIOO_SUPABASE_KEY    - the "fusioo" project's service_role key. Never
 *                            use this key in frontend/browser code.
 *
 * Entry point:
 *   syncFusiooData - put this on a time-based trigger (e.g. every 15-30 min).
 *                    Each run pages through every app in CONFIG.APPS starting
 *                    from where the last run left off (offset saved per app
 *                    in Script Properties), so a full pass spans however many
 *                    runs it takes. Once an app's pass completes (fewer than
 *                    PAGE_SIZE records came back), its offset resets to 0 so
 *                    the next run starts refreshing that app from the top
 *                    again — this is a continuous refresh loop, not a
 *                    one-time backfill, so edited Fusioo records (e.g. status
 *                    changes) eventually get picked up too. It does NOT
 *                    delete rows for records removed in Fusioo — this is
 *                    additive/refresh-only.
 */

const FUSIOO_CONFIG = {
  API_BASE: 'https://api.fusioo.com/v3',
  PAGE_SIZE: 200, // Fusioo's max per the API docs.
  // Leave headroom under Apps Script's ~6 minute execution limit.
  MAX_RUNTIME_MS: 5 * 60 * 1000,
};

// Each entry maps one Fusioo app to one Supabase table. App IDs found by
// opening the app in Fusioo's web UI and reading the "i..." segment out of
// the URL (e.g. gladex.fusioo.com/platform/main#/i037d30c.../BookingTransactions/...).
const FUSIOO_APPS = [
  { name: 'Booking Transactions', appId: 'i037d30cf902f409f81339ce75c1fa930', table: 'fusioo_booking_transactions' },
  { name: 'Ticket Details', appId: 'i531ddc66a84a459982555f699d175ca2', table: 'fusioo_ticket_details' },
  { name: 'Hotel Details', appId: 'ia0bc64962dc04df3b2629f1c9282c99c', table: 'fusioo_hotel_details' },
  { name: 'Tour Details', appId: 'i0f68b99281d94732b4b0b07ef2d0c134', table: 'fusioo_tour_details' },
  { name: 'Transfer Details', appId: 'i69059e8c03a04ab489452fa4f6d5ff21', table: 'fusioo_transfer_details' },
];

function syncFusiooData() {
  const props = PropertiesService.getScriptProperties();
  const fusiooToken = props.getProperty('FUSIOO_ACCESS_TOKEN');
  const supabaseUrl = props.getProperty('FUSIOO_SUPABASE_URL');
  const supabaseKey = props.getProperty('FUSIOO_SUPABASE_KEY');

  if (!fusiooToken || !supabaseUrl || !supabaseKey) {
    Logger.log('ERROR: Set FUSIOO_ACCESS_TOKEN, FUSIOO_SUPABASE_URL, FUSIOO_SUPABASE_KEY in Project Settings > Script Properties before running.');
    return;
  }

  const startTime = Date.now();

  FUSIOO_APPS.forEach(function (app) {
    if (Date.now() - startTime > FUSIOO_CONFIG.MAX_RUNTIME_MS) {
      Logger.log('Out of time budget — stopping before ' + app.name + '. Run again to continue.');
      return;
    }
    syncOneApp_(app, fusiooToken, supabaseUrl, supabaseKey, startTime);
  });
}

function syncOneApp_(app, fusiooToken, supabaseUrl, supabaseKey, startTime) {
  const props = PropertiesService.getScriptProperties();
  const offsetKey = 'FUSIOO_OFFSET_' + app.table;
  let offset = parseInt(props.getProperty(offsetKey) || '0', 10);

  let totalSynced = 0;
  let stoppedEarly = false;

  while (true) {
    if (Date.now() - startTime > FUSIOO_CONFIG.MAX_RUNTIME_MS) {
      stoppedEarly = true;
      break;
    }

    const records = fetchFusiooRecords_(app.appId, offset, fusiooToken);
    if (records === null) {
      // Network/auth error already logged by fetchFusiooRecords_ — leave
      // the offset where it is so the next run retries this same page.
      return;
    }
    if (records.length === 0) break; // reached the end of this app's records

    const ok = upsertToSupabase_(app.table, records, supabaseUrl, supabaseKey);
    if (!ok) return; // error already logged — retry this same offset next run

    totalSynced += records.length;
    offset += records.length;
    props.setProperty(offsetKey, String(offset));

    if (records.length < FUSIOO_CONFIG.PAGE_SIZE) break; // last page for this app
  }

  if (!stoppedEarly) {
    // Full pass completed this run — restart from the top next time so
    // edited/updated Fusioo records eventually get re-synced too.
    props.setProperty(offsetKey, '0');
  }

  Logger.log(
    '[' + app.name + '] synced ' + totalSynced + ' record(s) this run' +
    (stoppedEarly ? ' (stopped early, resuming next run at offset ' + offset + ')' : ' (full pass complete, will restart from the top next run)')
  );
}

function fetchFusiooRecords_(appId, offset, fusiooToken) {
  const url = FUSIOO_CONFIG.API_BASE + '/records/apps/' + appId +
    '?limit=' + FUSIOO_CONFIG.PAGE_SIZE + '&offset=' + offset;

  const options = {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + fusiooToken,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code === 401) {
      Logger.log('FUSIOO AUTH ERROR (401) — the access token is likely expired/revoked. Regenerate it in Fusioo (API Settings > the application > generate access token) and update FUSIOO_ACCESS_TOKEN in Script Properties.');
      return null;
    }
    if (code < 200 || code >= 300) {
      Logger.log('FUSIOO ERROR (' + code + ') at offset ' + offset + ': ' + response.getContentText());
      return null;
    }
    const body = JSON.parse(response.getContentText());
    return body.data || [];
  } catch (err) {
    Logger.log('FUSIOO UNREACHABLE at offset ' + offset + ': ' + err);
    return null;
  }
}

function upsertToSupabase_(table, records, supabaseUrl, supabaseKey) {
  const url = supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + table + '?on_conflict=id';
  const now = new Date().toISOString();
  const rows = records.map(function (record) {
    return { id: record.id, data: record, synced_at: now };
  });

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      Prefer: 'resolution=merge-duplicates',
      // Apps Script's default UrlFetchApp User-Agent starts with "Mozilla/5.0",
      // which trips Supabase's secret-key browser-use protection.
      'User-Agent': 'GladexTours-FusiooSync/1.0 (Google Apps Script; server-side)',
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code >= 200 && code < 300) return true;
    Logger.log('SUPABASE ERROR (' + code + ') upserting into ' + table + ': ' + response.getContentText());
    return false;
  } catch (err) {
    Logger.log('SUPABASE UNREACHABLE upserting into ' + table + ': ' + err);
    return false;
  }
}

/**
 * Manual test helper — run this from the Apps Script editor to sync just one
 * app (default: Booking Transactions) and see the log output immediately,
 * instead of waiting for/setting up the full trigger.
 */
function debugSyncOneApp() {
  const props = PropertiesService.getScriptProperties();
  const fusiooToken = props.getProperty('FUSIOO_ACCESS_TOKEN');
  const supabaseUrl = props.getProperty('FUSIOO_SUPABASE_URL');
  const supabaseKey = props.getProperty('FUSIOO_SUPABASE_KEY');

  if (!fusiooToken || !supabaseUrl || !supabaseKey) {
    Logger.log('ERROR: Set FUSIOO_ACCESS_TOKEN, FUSIOO_SUPABASE_URL, FUSIOO_SUPABASE_KEY in Project Settings > Script Properties before running.');
    return;
  }

  const app = FUSIOO_APPS[0]; // <- change index to test a different app
  syncOneApp_(app, fusiooToken, supabaseUrl, supabaseKey, Date.now());
}