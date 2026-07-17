# GladexHub Flight Tracker — Testing & Implementation Guide

Verified against the actual codebase as of 2026-07-18. Every claim below was
checked directly against source files (paths cited); anything that could
**not** be verified this way is explicitly flagged as such under "Unverified"
— do not treat those as confirmed working.

---

## 1. Search & Query Capabilities

### 1.1 Search box (`AdminFlightManagement.jsx`)

The single free-text search box matches, case-insensitively, as a **substring**
(not exact match) against these fields on each row:

| Field searched | Source | Example |
|---|---|---|
| `booking_ref` | `flight_emails.booking_ref` | `MPNNWH` |
| Route string | joined `flights[].route`, space-separated | `MNL-MPH` |
| GDX number | joined from Fusioo via `gdxByBookingRef` | `22319` |
| Client name | joined from Fusioo via `gdxByBookingRef` | `Marieta` |

Source: `AdminFlightManagement.jsx` lines ~432-438 (`matchesSearch`).

**Not searchable:** airline name, email type, dates, agent name, team name —
these have their own dedicated filter dropdowns instead (see 1.2).

### 1.2 Filters

| Filter | Who sees it | Options | Notes |
|---|---|---|---|
| Type | Everyone | All / Confirmation / Reschedule / Cancellation / Needs Attention | |
| Airline | Everyone | Dynamic list derived from data actually present | |
| Team | admin/super_admin only | Dynamic, each labeled with its Team Leader if known | A `team_leader` account has only one team, so no dropdown needed |
| Agent | admin/super_admin, team_leader | Dynamic, narrows to selected Team if set | Not shown to a plain `agent` (they only ever see their own bookings) |
| Departure date From/To | Everyone | Native date picker | Filters on `flights[0].departure_date` |

### 1.3 Identifiers and their real formats

| Identifier | Format | Example |
|---|---|---|
| `booking_ref` (AirAsia/Cebu Pacific/HK Express) | 5-8 alphanumeric | `MPNNWH`, `WDWUFJ` |
| `booking_ref` (PAL advisory, no real PNR in the email) | Passenger name (surrogate, NOT a real ref) | `CANDELARIA PEROCHO YAP` |
| `booking_ref` (Needs Attention rows) | Raw email subject, truncated to 120 chars | `Flight UL314 Delayed` |
| `flight_no` | `<2-char airline code><2-4 digit number>`, space-normalized | `PR 454`, `Z2 426`, `5J 909` |
| `gmail_message_id` | Gmail's internal hex message ID | `19f6a7eef327d2ec` (not user-facing, internal key only) |

### 1.4 Edge cases and expected behavior

| Scenario | Expected result | Verified? |
|---|---|---|
| Empty search box | Shows everything the role/filters already allow | Yes — `!q \|\| ...` short-circuits (line 434) |
| Search matches nothing | Table shows "No upcoming flight emails found." | Yes — empty-state row exists (line 728-733) |
| `dateFrom` after `dateTo` | Silently returns zero rows — **no error message shown** | Yes, and this is a real gap — see §8 |
| Non-existent GDX/booking ref searched | Same as "no match" — empty table, no distinct "not found" messaging | Yes |
| Special characters / SQL-like input in search box | Harmless — it's a plain JS `.includes()` string match, not a query sent to any backend | Yes (client-side only, line 433-438) |
| XSS-style input (`<script>...`) in search box | Not executable — React escapes all rendered text by default; no `dangerouslySetInnerHTML` used in the table | Yes, checked the whole file for `dangerouslySetInnerHTML` — none found |

**There is no "invalid search" error state** — the search box has no format
requirements, so nothing a user types can produce a validation error. The only
practical "invalid input" is the date-range case above.

---

## 2. API Documentation

### 2.1 Base44 backend functions (`base44/functions/*/entry.ts`)

All are Deno HTTP functions invoked via `base44.functions.invoke(name, body)`
from the frontend, or on a schedule (workflows). None expose a public REST
path outside Base44's own routing — there is no separate API gateway.

| Function | Purpose | Auth | Verified against |
|---|---|---|---|
| `employeeLogin` | Verify email/employee_code + password, return a session user object | None in (public login endpoint) — verifies via bcrypt against cached `SyncedEmployee.password_hash`/`password_override_hash`; falls back to a live external Accounts API call on cache miss | `employeeLogin/entry.ts` (read in full) |
| `validateSession` | Background check (every 5 min from the frontend) that a logged-in user is still active | `email` param, no token | Referenced in `useAuth.js`; not re-read this pass |
| `employeeList` | Returns the roster of employees (used for Team Leader lookups and the Accounts page) | `requesterEmail` param, checked against `SyncedEmployee` | Referenced in `AdminFlightManagement.jsx` line 546 |
| `querySupabase` | Generic proxy so the frontend can query Supabase without exposing service-role keys | `requesterEmail` param — validated against `SyncedEmployee`, must be `is_active` (post-override) with a role assigned | `querySupabase/entry.ts` (read in full) |
| `resetEmployeePassword` | Super_admin-only: generate + set a new password for another employee | `requesterEmail`, requester must resolve to `role === 'super_admin'` | Built/reviewed this session, not re-read this pass |
| `updateEmployeeAccount` | Super_admin-only: set `role_override`/`is_active_override` on an employee | Same as above, has a self-modification guard | Built/reviewed this session |
| `syncEmployeeAccounts` | Scheduled (5 min): refreshes `SyncedEmployee` cache from the live Accounts API + `admin_accounts` Supabase table, soft-deactivates (not deletes) stale rows | Server-to-server, no caller auth (trigger-invoked) | Built/reviewed this session |
| `syncFusiooData` | Scheduled: full refresh of 5 Fusioo apps into `fusioo_*` Supabase tables | Server-to-server | `syncFusiooData/entry.ts` (read in full) |

**`querySupabase` operations** (the `operation` field in the request body):

| Operation | What it does | Used for |
|---|---|---|
| `selectAllOrdered` | Paginates the whole table (1000 rows/page) ordered by a column | Loading all `flight_emails` |
| `selectAllPaginated` | Paginates the whole table, no ordering | Loading all Fusioo booking rows for the team roster |
| `filterJsonbIn` | `WHERE data->>field IN (...)`, batched 150 values/request | Looking up specific GDX/agent records |
| `filterIdIn` | `WHERE id IN (...)`, batched 150 values/request | Looking up specific rows by primary key |

**Project/table whitelist enforced server-side** (`querySupabase/entry.ts`
lines 12-34) — a request for any table not in this list is rejected with
400, regardless of caller:
- `automate` → `flight_emails` only
- `fusioo` → `fusioo_booking_transactions`, `fusioo_ticket_details`,
  `fusioo_hotel_details`, `fusioo_tour_details`, `fusioo_transfer_details`
- `sales` → `bookings_6fbdd6b2`, `ticket_details_b1d64ca0`

### 2.2 External APIs

| API | Purpose | Auth | Rate limits | Verified? |
|---|---|---|---|---|
| Gmail (via Apps Script `GmailApp`/`UrlFetchApp`, not a REST call from this codebase) | Read mailbox, search, label threads | Apps Script's own OAuth (the script owner's Google account) | **Unverified** — Google publishes Apps Script quotas (email reads, `UrlFetchApp` calls per day) but no confirmation here of current usage vs. those caps. Verify in the Apps Script project's **Executions** page + Google's quota docs. |
| Supabase REST (via `querySupabase` proxy, and directly from `Code.gs` using the service_role key) | Read/write `flight_emails`, `fusioo_*`, `bookings_*` tables | `apikey`/`Authorization: Bearer` (anon key from the frontend's perspective via the proxy; service_role key server-side in Apps Script and `syncFusiooData`) | **Unverified** — dependent on the specific Supabase project's plan tier. Check the Supabase dashboard's usage/quota page. |
| Fusioo API (`api.fusioo.com/v3/records/apps/{appId}`) | Fetch booking/ticket/hotel/tour/transfer records | `Authorization: Bearer {FUSIOO_ACCESS_TOKEN}` | **Unverified** — no documented limit found in this codebase; check Fusioo's own API docs/support. |
| External Accounts API (`ACCOUNTS_API_URL`) | Live employee directory, used on `employeeLogin` cache-miss only | `x-api-key` header | **Unverified** — third-party system outside this repo. |

### 2.3 Fallback behavior

| Component | On failure | Verified against |
|---|---|---|
| `querySupabase` (any operation) | Throws → caught by `invokeError()` → React Query surfaces `isError` → UI shows "Failed to load flight emails. Check your Supabase connection and try refreshing." | `AdminFlightManagement.jsx` lines 720-726 |
| `Code.gs` → Supabase write (`saveToSupabase_`) | Non-2xx or network exception → logged, returns `'network_error'` → **thread is left unlabeled** so the next sync run retries it automatically | `Code.gs` `saveToSupabase_` |
| `Code.gs` → per-message unexpected exception | Caught in `runSync_`, logged, treated as `network_error` (same retry behavior) | `Code.gs` `runSync_` |
| `employeeLogin` cache miss + Accounts API unreachable | Returns `502 Failed to reach accounts service` | `employeeLogin/entry.ts` line 96-101 |

### 2.4 Dependencies between APIs

- The dashboard (`AdminFlightManagement.jsx`) → **only** talks to Base44
  functions, never Supabase directly (browser can't read server env vars).
- `querySupabase` → talks to whichever Supabase project (`automate`/`fusioo`/
  `sales`) the request specifies → each is a fully independent Postgres
  project; none of the three depend on each other.
- `Code.gs` → talks to Gmail **and** the `automate` Supabase project
  directly (has its own service_role key in Script Properties, bypasses
  `querySupabase` entirely since it's not running inside Base44).
- `syncFusiooData` → talks to the Fusioo API **and** the `fusioo` Supabase
  project directly.
- If Base44 itself is down, the entire admin dashboard is unusable (every
  data call routes through it) — but `Code.gs`'s Gmail→Supabase sync is
  **unaffected**, since it never touches Base44.

---

## 3. Data Fetching Validation

**Verified: no mock/dummy/sample/fake/placeholder data exists anywhere in
this codebase.** Checked via:

```
grep -rniE "mock|dummy|fake data|sample data|placeholder data" src/ base44/
```

— zero matches. Every value rendered in the admin dashboard, Customer Portal,
and TV Display comes from a real `querySupabase`/Base44 function call against
a real Supabase table or the Fusioo API. There is currently no test/staging
data-fetch path to accidentally leave enabled in production, because none
exists to begin with.

**How to independently re-verify this claim** (don't just take this
document's word for it):
1. Open browser DevTools → Network tab while using the dashboard.
2. Confirm every data-bearing request is a `POST` to
   `/api/apps/.../functions/querySupabase` (or `employeeList`/`employeeLogin`
   etc.) — not a request to any `localhost`, `jsonplaceholder`, or hardcoded
   local JSON file.
3. Re-run the grep above yourself after any future code change — this is a
   point-in-time check, not an enforced guard.

**Safeguard recommendation (not yet implemented):** there is currently no
automated test or lint rule that would catch someone introducing mock data
later. Recommend a CI grep step (same pattern as above) that fails the build
if `mock`/`dummy`/`sample data` patterns appear outside test files.

---

## 4. Email Processing & Google Apps Script Integration

### 4.1 Complete flow (verified against `google-apps-script/Code.gs` in full)

```
Gmail inbox
  │
  ▼
[Per-airline loop — AIRLINES array, one Gmail search per configured sender]
  │  query = senderQuery + "-label:Processed -label:NeedsReview" [+ after:date]
  ▼
detectEmailType(subject, body) ──null──► labeled NeedsReview, logged as SKIP
  │ (type found)
  ▼
parseBookingRef(body, subject) + parseFlights(body, subject)
  │
  ├─ missing/empty ──► labeled NeedsReview, logged as PARSE ERROR
  │                     + if type is reschedule/cancellation: ALSO saved as a
  │                       bare "needs_attention" dashboard row (so it's not
  │                       invisible outside Gmail)
  │
  ▼ (both present)
saveToSupabase_() → upsert on gmail_message_id, ignore-duplicates
  │
  ├─ network/HTTP error ──► thread left UNLABELED (retried next run)
  ├─ duplicate (already saved) ──► logged, thread labeled Processed
  └─ success ──► logged, thread labeled Processed

[Safety net — checkForUnknownAirlineSenders_, runs after every sync]
  │  broad keyword search, ALL senders, same date cutoff as above
  ▼
sender in KNOWN_AIRLINE_SENDERS? ──yes──► skip (already handled above)
  │ no
  ▼
isLikelyNoise_(sender, subject)? ──yes──► labeled UnknownAirlineSender only, not saved/alerted
  │ no
  ▼
labeled UnknownAirlineSender + saved as "needs_attention" dashboard row
  + batched into one alert email to the mailbox owner
```

### 4.2 What guarantees no email is silently skipped

| Guarantee | Mechanism | Verified against |
|---|---|---|
| Already-handled emails aren't reprocessed forever, but aren't silently dropped either | `-label:Processed -label:NeedsReview` exclusion — Processed/NeedsReview are the only two "handled" states, both reachable/reviewable in Gmail | `buildQuery_`, `checkForUnknownAirlineSenders_` |
| A parse failure doesn't mean data loss | Always labeled `NeedsReview` (visible in Gmail), and for reschedule/cancellation specifically, also surfaced on the dashboard via `saveNeedsAttentionRow_` | `processMessage_` |
| A network/Supabase outage doesn't lose the email | Thread is left **unlabeled** on `network_error` — next run's query still matches it (no Processed/NeedsReview label was applied), so it retries automatically every cycle until it succeeds | `runSync_`, `saveToSupabase_` |
| An airline changing its sending address doesn't go unnoticed | `checkForUnknownAirlineSenders_` searches broadly by subject keyword, not by sender — a new/changed address still matches on content | `checkForUnknownAirlineSenders_` |
| Long-running syncs don't get silently killed mid-batch | `MAX_RUNTIME_MS` (5 min) checked every batch; on trip, logs "Stopped early..." and cleanly stops — next scheduled run picks up where it left off (nothing was left half-processed, since labeling only happens after a message's full success/failure is known) | `runSync_` |
| Duplicate emails don't create duplicate rows | Supabase upsert `on_conflict=gmail_message_id` with `resolution=ignore-duplicates` | `saveToSupabase_` |

### 4.3 Known, real gaps (not hypothetical — found this session)

| Gap | Impact | Status |
|---|---|---|
| Apps Script trigger error rate showing 13.23% (per the Triggers page, as of 2026-07-17 10:39 PM) | Some fraction of scheduled runs are failing | **Root cause not yet investigated** — likely includes pre-fix historical failures (AirAsia/PAL bugs fixed today), but not confirmed. Check the Executions log for the specific error message on recent failures. |
| Cebu Pacific "Itinerary Receipt" emails intermittently fail to parse flights (`bookingRef` extracted fine, `flights.length === 0`) | A small number of real confirmation emails land in NeedsReview instead of being saved | Found via a live `fetchAllHistoricalEmails` run (see execution log ~10:12 AM this session); root cause (likely a layout variant) not yet diagnosed |
| AirSWIFT (`info@air-swift.com`, `itinerary@air-swift.com`) is a real, recurring 5th airline sending genuine cancellation/schedule-change advisories | Currently only visible as "Needs Attention" (no parsed flight details) — not lost, but not fully structured either | Not yet added to `AIRLINES`/`KNOWN_AIRLINE_SENDERS` — needs a dedicated parser verified against a real sample, same process as the other 4 |
| `no-reply@philippineairlines.com` (hyphenated — distinct from `noreply@philippineairlines.com`) reschedule confirmations | Body layout not yet verified against a real "Your Flight Change is Confirmed" sample from this specific address | Currently falls through to `parsePALBoardingPassFlights_`, which will likely fail to match → lands in NeedsReview, not lost, but not parsed either |

### 4.4 Retry mechanism (already covered above, summarized)

- **Parse failures:** never retried automatically (the format genuinely
  doesn't match any known layout) — surfaces in `NeedsReview` for a human to
  investigate, and a subsequent `resetNeedsReviewEmails()` run will retry it
  once the parser is fixed.
- **Network/Supabase failures:** retried automatically, no manual action
  needed — every subsequent sync run re-attempts unlabeled threads.
- **Execution timeout:** retried automatically on the next scheduled run.

### 4.5 Logging / audit trail

- **Currently:** `Logger.log()` calls only, visible in the Apps Script
  **Executions** page — no persisted/exportable audit log, no alerting
  beyond the one `MailApp.sendEmail` for newly-found unknown senders.
- **Recommendation (not yet implemented):** write a per-run summary row
  (timestamp, per-airline counts, unknown-sender count) into its own
  Supabase table, so historical sync health is queryable instead of living
  only in Apps Script's execution history (which has a retention limit).

### 4.6 How to verify every received email is processed

There is **no single "processed count" you can trust blindly** — verification
requires cross-referencing two independent counts:

1. In Gmail, search `-label:Processed -label:NeedsReview -label:UnknownAirlineSender`
   scoped to a known sender/date range — this should return **zero** threads
   for any period the sync has already run over. Any result here is a real
   miss.
2. Compare Gmail's raw sender-scoped thread count (no label filter) against
   `select count(*) from flight_emails where airline = 'X'` in Supabase for
   the same period — a mismatch (accounting for expected NeedsReview/
   duplicate counts) means something didn't make it through.

---

## 5. QA Testing Plan

| Category | What to check |
|---|---|
| **Happy path** | A real known booking searches correctly; filters narrow results correctly; stat cards match filtered counts; role-based visibility scopes correctly (§ see Test Cases). |
| **Error scenarios** | Wrong password shows the generic invalid-credentials message (never reveals *which* field was wrong); deactivated account shows "This account has been deactivated."; Supabase unreachable shows the dashboard's error banner, not a blank/broken page. |
| **Edge cases** | `dateFrom` after `dateTo` (currently silent empty result, no error — flag as a gap, not a pass); searching a booking ref that doesn't exist; a team with no assigned Team Leader (`teamLeaderByTeam` gap) shows "not yet assigned" rather than a blank/broken header. |
| **API failures** | Simulate by temporarily revoking a Supabase anon key (staging only, never production) — confirm the dashboard degrades to its error banner rather than crashing white-screen. |
| **Network interruptions** | Disconnect network mid-`fetchNewEmails` run — on reconnect, the next scheduled run should retry any `network_error` thread automatically (see §4.2). |
| **Duplicate records** | Manually re-run `fetchAllHistoricalEmails` on an already-fully-synced mailbox — expect `duplicates skipped` counts in the log, zero new `saved` rows, zero duplicate rows in Supabase (enforced by the `gmail_message_id` unique upsert). |
| **Missing records** | Cross-check per §4.6. |
| **Invalid user inputs** | Login form: empty identifier/password, SQL-meta-characters, extremely long strings — all should fail gracefully with the generic invalid-credentials message (verify none produce a 500 or stack trace on screen). |
| **Email delivery failures** | N/A to this system directly — Gmail delivery itself isn't something this codebase controls; scope stops at "email arrived in the inbox." |
| **Data synchronization issues** | Compare `flight_emails` row counts / latest `received_date` against the Gmail inbox's actual latest matching email — a large gap indicates the trigger stopped running (check Triggers page's "Last run" and the 13.23% error rate flagged in §4.3). |
| **Security testing** | Confirm `querySupabase` rejects an inactive/deactivated employee (§2.1); confirm the **known RBAC gap** (§8) — any active employee, including a plain `agent`, can currently call `querySupabase` directly with `operation: selectAllOrdered` and receive the FULL unscoped `flight_emails` table, bypassing the frontend's team/agent filtering entirely, since that scoping only happens client-side. |
| **Performance testing** | `selectAllOrdered`/`selectAllPaginated` fetch the ENTIRE table every time (1000-row pages) — with 10,000+ rows already, this cost grows unbounded over time; no incremental/delta fetch exists yet. Flag as a scaling risk, not an immediate bug. |

---

## 6. Test Cases

| Test ID | Objective | Steps | Expected Result | Pass/Fail Criteria |
|---|---|---|---|---|
| TC-01 | Known booking is searchable and correct | 1. Log in. 2. Search `MPNNWH`. | One row: Cebu Pacific, Confirmation, MNL-MPH/MPH-MNL, Marieta Pineda Clarito. | Fail if row missing, wrong airline/type/route/client, or duplicate rows appear. |
| TC-02 | Type filter narrows correctly | 1. Set Type = Reschedule. | Only orange "Reschedule"-badged rows shown. | Fail if any other type appears. |
| TC-03 | Combined filters narrow further | 1. Type = Reschedule. 2. Airline = Philippine Airlines. | Subset of TC-02's results, all Philippine Airlines. | Fail if a non-PAL row remains, or if the count didn't shrink from TC-02. |
| TC-04 | Stat cards match filtered counts | 1. Clear filters, note all 4 stat numbers. 2. Filter each type one at a time, compare row count. | Filtered row count == that type's stat card number, for all 3 non-total types. | Fail on any mismatch. |
| TC-05 | admin/super_admin sees everything, grouped correctly | 1. Log in as admin. | Every team's bookings visible; dark "TEAM" header rows before "AGENT" header rows; a team with no assigned leader shows "not yet assigned". | Fail if any team/agent is missing, mislabeled, or the leader label is blank instead of "not yet assigned". |
| TC-06 | team_leader sees only their team | 1. Log in as team_leader. | Only bookings from agents on that team_leader's team; no Team filter dropdown present. | Fail if another team's booking appears, or the Team filter shows. |
| TC-07 | agent sees only their own bookings | 1. Log in as agent. | Only that agent's own bookings; no Team or Agent filter dropdowns. | Fail if another agent's booking appears. |
| TC-08 | Login rejects wrong password | 1. Enter valid identifier, wrong password. | Generic "Invalid email/username or password." — no hint about which field. | Fail if the error reveals whether the identifier or password was wrong. |
| TC-09 | Login rejects deactivated account | 1. Log in as a known-deactivated test account. | "This account has been deactivated." | Fail if login succeeds. |
| TC-10 | Password reset persists through the 5-min sync | 1. Super_admin resets a test employee's password. 2. Wait 5+ min (past a `syncEmployeeAccounts` cycle). 3. Log in with the new password. | Login succeeds with the reset password — override wasn't clobbered by the sync. | Fail if the old password still works, or the new one doesn't. |
| TC-11 | Role/active override persists through the 5-min sync | 1. Super_admin changes a test employee's role or deactivates them. 2. Wait 5+ min. 3. Check their effective role/active state. | Override still in effect. | Fail if the sync reverted it. |
| TC-12 | Unrecognized-sender email is not lost | 1. Send a flight-shaped-subject test email from an unconfigured address to the monitored inbox. 2. Run/wait for sync. | Row appears with a yellow "Needs Attention" badge, booking_ref = the test subject line. | Fail if nothing appears after 2 sync cycles. |
| TC-13 | Genuine noise is filtered from Needs Attention | 1. Send a test email with subject containing "contracted rate" or from a `mailer-daemon` address. 2. Run/wait for sync. | Thread gets labeled `UnknownAirlineSender` in Gmail but does **not** appear on the dashboard or trigger the alert email. | Fail if it appears on the dashboard. |
| TC-14 | Duplicate sync run doesn't create duplicate rows | 1. Run `fetchAllHistoricalEmails` twice in a row on a fully-synced mailbox. | Second run: `saved: 0` for every airline, `duplicates skipped` > 0 where applicable. | Fail if `saved` > 0 on the second run for emails that existed before the first run. |
| TC-15 | `dateFrom` after `dateTo` (known gap) | 1. Set Departure Date From to a date after Date To. | Currently: silently zero rows, no error shown. | This is EXPECTED per current behavior — log as a UX gap to fix, not a regression if it stays this way until addressed. |
| TC-16 | RBAC bypass via direct API call (security gap) | 1. As a logged-in `agent`, call `base44.functions.invoke('querySupabase', {project:'automate', table:'flight_emails', operation:'selectAllOrdered', ..., requesterEmail: <agent's email>})` directly from the browser console. | Currently: succeeds, returns the FULL unscoped table. | This is a KNOWN, documented gap (§8) — confirms it hasn't been silently fixed; do not close this test as "fixed" without a corresponding code change closing §8's gap. |

---

## 7. Deployment Requirements (Vercel)

*(Skipping anything requiring backend/infra access the QA tester doesn't
have — this section is for whoever owns the Vercel deployment, not the
UI-only tester.)*

### 7.1 Environment variables required (per `.env.example`, verified)

| Variable | Purpose | Safe to expose in frontend bundle? |
|---|---|---|
| `VITE_BASE44_APP_ID` | Identifies this app to Base44's backend | Yes |
| `VITE_BASE44_APP_BASE_URL` | The app's `*.base44.app` backend URL | Yes |
| `VITE_BASE44_FUNCTIONS_VERSION` | (If used) pins backend function version | Yes |
| `VITE_SALES_SUPABASE_URL` / `VITE_SALES_SUPABASE_ANON_KEY` | Sales project — bookings/tickets | Yes (anon/publishable key only) |
| `VITE_ACCOUNTS_SUPABASE_URL` / `VITE_ACCOUNTS_SUPABASE_ANON_KEY` | Accounts project — login/RBAC | Yes (anon key only) |
| `VITE_AUTOMATE_SUPABASE_URL` / `VITE_AUTOMATE_SUPABASE_ANON_KEY` | Automate project — `flight_emails` | Yes (anon key only) |
| `VITE_FUSIOO_TOKEN` | Fusioo bearer token | **Caution** — `VITE_` prefix means it ships in the public bundle; per the codebase's own comment, never use it for runtime login/RBAC checks |
| `FUSIOO_CLIENT_ID` / `FUSIOO_CLIENT_SECRET` | Fusioo OAuth (server-side use) | No — do not prefix with `VITE_`, do not expose |
| `EXTERNAL_ACCOUNTS_SOURCE_URL` / `EXTERNAL_ACCOUNTS_SOURCE_KEY` | External employee directory (one-time copy source) | No |

**Base44-side secrets (not part of the Vercel frontend build, live in Base44's
own environment):** `ACCOUNTS_API_URL`, `ACCOUNTS_API_KEY`,
`FUSIOO_ACCESS_TOKEN`, `VITE_FUSIOO_SUPABASE_URL`,
`FUSIOO_SUPABASE_SERVICE_ROLE_KEY` (never in the frontend), and each Supabase
project's own `anon` key duplicated server-side.

**Google Apps Script Script Properties (separate system, not Vercel/Base44
at all):** `SUPABASE_URL`, `SUPABASE_KEY` (the Automate project's
**service_role** key — never put this in Vercel/frontend env vars).

### 7.2 Build configuration

- Standard Vite build (`npm run build` → `vite build`), per `vite.config.js`.
- The `@base44/vite-plugin` auto-enables an `/api` dev-server proxy to
  `VITE_BASE44_APP_BASE_URL` **only if that env var is set** — confirm it's
  set in Vercel's environment (all environments: Production/Preview/
  Development) or API calls will 404 in preview deployments the same way
  they did locally before this was fixed.
- No custom `vercel.json` found in the repo as of this pass — Vercel's
  framework auto-detection (Vite) should apply; **verify this is still true
  at actual deploy time**, don't assume.

### 7.3 Deployment steps (standard Vercel flow — verify against your actual Vercel project settings, not assumed here)

1. Connect the GitHub repo to a Vercel project (or confirm it's already connected).
2. Set all `VITE_*` environment variables from §7.1 in Vercel's dashboard.
3. Trigger a deploy (push to `main`, or manual redeploy).
4. **Smoke test immediately after deploy:** log in, confirm the dashboard loads real data (not a blank/error screen), confirm the TV Display route loads.

### 7.4 Monitoring recommendations (not yet implemented)

- No error-tracking service (Sentry or similar) integrated in this codebase as of this pass — recommend adding one so a production error doesn't rely on a user reporting it.
- No uptime/health-check endpoint exists — recommend a simple `/api/health` or scheduled synthetic login+query check.

### 7.5 Rollback procedure

- Standard Vercel rollback: redeploy a previous successful deployment from the Vercel dashboard's Deployments list — this repo has no custom rollback tooling of its own.
- **Separately:** the Google Apps Script side has no deployment versioning tied to Vercel at all — a bad `Code.gs` change must be manually reverted by pasting the previous known-good version back into `script.google.com` (see git history for prior versions).

---

## 8. Production Readiness Review

### 8.1 Potential failure points (verified, not hypothetical)

1. **`querySupabase` has no server-side per-row RBAC** (§2.1, §5, TC-16) —
   any active employee can bypass the frontend's team/agent scoping by
   calling the function directly. This is the single most significant
   security gap in the current system.
2. **Apps Script trigger error rate (13.23% per the last observed reading)**
   — not yet root-caused. Could indicate a recurring transient failure
   (Gmail quota, Supabase timeout) that's silently eating some fraction of
   sync runs.
3. **`selectAllOrdered`/`selectAllPaginated` refetch the entire table on
   every call** — no incremental sync. As `flight_emails` grows
   (10,000+ rows already), this is a growing latency/cost risk, not an
   immediate outage risk.
4. **GitHub↔Base44 two-way sync is broken at the platform level** (confirmed
   earlier this session, not fixable from this side) — meaning the code
   pushed to GitHub and what's actually live on Base44 can silently drift
   apart if someone forgets to manually paste a change into Base44's editor.
   **This is a real data-loss-adjacent risk**: a fix committed to git is
   NOT live until manually re-applied in Base44.

### 8.2 Possible data-loss scenarios

- None identified for the **email ingestion path itself** — every failure
  mode found (parse error, network error, unknown sender) has a
  label-based or dashboard-based fallback that keeps the email visible
  somewhere (see §4.2). The closest thing to a real loss scenario is: if a
  thread is manually/accidentally re-labeled `Processed` in Gmail by a
  human before the system saved it — but that's a human-error scenario
  outside the system's own logic, not a code defect.
- **Employee override loss:** `syncEmployeeAccounts` was specifically fixed
  this session to soft-deactivate (not delete) a stale employee row, so an
  admin's password/role override survives a temporary disappearance from
  the external API. Verify this specific behavior with TC-11 above.

### 8.3 Risks that could cause emails to be skipped

Ranked by how likely they are to actually occur, based on what's been found
this session:

1. **A new airline/sender format not yet added** — mitigated (not
   eliminated) by the Needs Attention safety net, but a genuinely NEW
   airline's emails will show up unstructured until someone builds a proper
   parser for it (AirSWIFT is a live example right now, §4.3).
2. **A known airline changing its email layout without changing its sender
   address** — the safety net does NOT catch this case (it only flags
   unrecognized *senders*, not unrecognized *layouts* from a known sender).
   A known-sender parse failure still surfaces via NeedsReview + (for
   reschedule/cancellation) the dashboard fallback — but confirmation-type
   layout changes from a known sender have no such fallback (§4.2 excludes
   confirmations from the dashboard-fallback by design, to avoid noise).
3. **Apps Script's own execution failures** (the 13.23% error rate) — until
   root-caused, this is the least-understood risk in the whole pipeline.

### 8.4 Recommended safeguards and monitoring (prioritized)

1. **Investigate the 13.23% trigger error rate** — read the actual error
   messages in the Apps Script Executions log; this is the highest-priority
   unknown.
2. **Close the `querySupabase` RBAC gap** — replicate the agent/team scoping
   logic server-side, or at minimum log/alert on any `selectAllOrdered`
   call from a non-admin role so misuse is at least visible.
3. **Add a persisted sync-health log** (§4.5) so "did the last N runs
   actually succeed" is queryable without digging through Apps Script's own
   execution history.
4. **Resolve the GitHub↔Base44 drift risk** — either get Base44 Support to
   fix the sync, or establish a strict manual checklist (already informally
   in place this session) so no fix is ever considered "done" until
   confirmed live in Base44 too.
5. **Add error tracking to the Vercel-deployed frontend** (§7.4).

### 8.5 What was NOT verified in this pass, and how to verify it

| Item | Why not verified | How to verify |
|---|---|---|
| Actual Supabase/Fusioo/Gmail rate limits | No usage dashboard access in this session | Check each service's own dashboard/console for current quota usage |
| Whether `vercel.json` or Vercel project settings match what's assumed in §7 | Deployment console not accessible from this session | Check the live Vercel project's Settings → Environment Variables and Build & Development Settings |
| Whether the 13.23% Apps Script error rate is old (pre-fix) or ongoing | Only the aggregate percentage was observed, not individual error messages | Open the Executions log, filter to recent runs, read actual error text |
| Root cause of the intermittent Cebu Pacific "Itinerary Receipt" parse failures | A specific failing sample wasn't pulled and inspected this session | Use `debugLogMessageById()` in `Code.gs` with one of the failing message IDs from the log, inspect the real body, compare against `parseCebuPacificFlights_`'s expected layout |
| PAL's `no-reply@philippineairlines.com` reschedule body layout | No real sample of that specific email successfully pulled yet | Use `debugLogSampleBySubject()` scoped to that sender + a "Flight Change is Confirmed" subject keyword |
