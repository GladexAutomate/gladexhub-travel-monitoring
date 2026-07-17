# GladexHub Flight Tracker — QA Testing Guide

**Prepared for:** QA Tester
**System:** Flight Email Management Dashboard
**Live URL:** https://gladexhub-travel-monitoring.vercel.app/admin/flight-tracker-login

---

## 1. What This System Does

This dashboard automatically reads flight confirmation, reschedule, and
cancellation emails from a monitored Gmail inbox, and displays them in one
place so the team can track flight changes affecting client bookings — no
one needs to manually check the inbox for updates.

New emails are picked up automatically every few minutes. You do not need
to do anything for that to happen — it runs in the background at all times.

---

## 2. Test Accounts

*(To be filled in before handing this to the tester)*

| Role | Email / Employee Code | Password | What they should be able to see |
|---|---|---|---|
| Admin / Super Admin | _______________ | _______________ | Every team's bookings |
| Team Leader | _______________ | _______________ | Only their own team's bookings |
| Agent | _______________ | _______________ | Only their own bookings |

**Log in at:** https://gladexhub-travel-monitoring.vercel.app/admin/flight-tracker-login

---

## 3. What You Can Search For

Type into the search box at the top of the Flight Emails table:

| You can search by | Example |
|---|---|
| Booking Reference | `MPNNWH` |
| Route | `MNL-MPH` (or just `MNL`) |
| GDX Number | `22319` |
| Client Name | `Marieta` (partial name works) |

Not searchable in the search box (use the dropdown filters above the table
instead): **Type, Airline, Team, Agent, Departure Date**.

**Good to know:**
- The search box doesn't care about capital letters.
- Typing part of a word is fine — you don't need to type the whole thing.
- If nothing matches, you'll just see "No upcoming flight emails found." —
  that's normal, not an error.

---

## 4. Keywords That Trigger "Needs Attention" Detection

If an email arrives from a sender the system doesn't already recognize, it
still gets caught — **as long as the subject line contains one of these
words or phrases** (not case-sensitive):

```
itinerary, booking reference, e-ticket, eticket, flight confirmation,
boarding pass, reschedule, rebooking, rebook, cancellation, cancelled,
canceled, flight change, schedule change, schedule update, flight update,
flight advisory, travel advisory, flight disruption, disrupted, delayed, delay, PNR
```

**To test this yourself:** send an email (from any address, including your
own) to the monitored inbox with a subject like:

> "URGENT Flight Cancellation Notice — QA TEST"

Wait about 5–10 minutes, refresh the dashboard, and search "QA TEST" — it
should appear with a yellow **"Needs Attention"** badge.

**Note:** an email with none of the above keywords in its subject will NOT
be picked up by this safety net — that's expected, not a bug, since the
system needs some signal that the email is flight-related.

---

## 5. Expected Behavior Summary

| Situation | What should happen |
|---|---|
| A real flight change email arrives from a known airline | Shows up automatically with the correct Confirmation/Reschedule/Cancellation badge |
| An email arrives from an unrecognized sender but has a flight-related subject | Shows up as "Needs Attention" (yellow badge) |
| An email is clearly unrelated (marketing, internal notes, bounced mail) | Does NOT show up on the dashboard at all |
| The dashboard is loading | You'll see a spinner and the message "Loading flight emails — this can take a few seconds with a large dataset." This is normal — the system currently loads the full dataset (10,000+ records) each time. A few seconds' delay is expected, not a bug. |
| You search for something that doesn't exist | "No upcoming flight emails found." — not an error |
| You set the date filter's "From" later than "To" | Currently shows an empty result silently, with no warning message. This is a known limitation, not something to report as new. |
| Wrong password entered | Generic message: "Invalid email/username or password." (it will never tell you which part was wrong) |
| Logging into a deactivated account | "This account has been deactivated." |

---

## 6. Test Cases

For each test, the **Expected Result** is already known to be correct. Your
job is to confirm the app actually behaves that way.

**TC-01 — Known booking is searchable**
Search `MPNNWH`.
Expected: One row — Cebu Pacific, Confirmation, Route MNL-MPH / MPH-MNL
(Round-trip), Client "Marieta Pineda Clarito".

**TC-02 — Type filter works**
Set Type filter to "Reschedule".
Expected: Only orange "Reschedule"-badged rows appear.

**TC-03 — Combined filters narrow further**
Type = Reschedule, then also Airline = Philippine Airlines.
Expected: Fewer results than TC-02, all Philippine Airlines only.

**TC-04 — Stat cards match the list**
Note the 4 stat numbers at the top. Filter to each type one at a time and
compare to the "(N)" count next to "Flight Emails".
Expected: Each filtered count matches its stat card exactly.

**TC-05 — Admin sees everything, grouped correctly**
Log in as Admin.
Expected: Every team visible, grouped under a "TEAM" label then "AGENT"
label. A team with no assigned leader shows "not yet assigned" rather than
blank.

**TC-06 — Team Leader sees only their team**
Log in as Team Leader.
Expected: Only bookings from their own team's agents. No Team filter
dropdown shown.

**TC-07 — Agent sees only their own bookings**
Log in as Agent.
Expected: Only that agent's own bookings. No Team/Agent filter dropdowns
shown.

**TC-08 — Wrong password is handled safely**
Enter correct username, wrong password.
Expected: Generic invalid-credentials message, no hint about which field
was wrong.

**TC-09 — Deactivated account is blocked**
Log in with a known-deactivated test account.
Expected: "This account has been deactivated."

**TC-10 — New unrecognized email isn't lost**
Follow the steps in Section 4 above.
Expected: Appears as "Needs Attention" within 1-2 sync cycles.

**TC-11 — Junk emails don't clutter the dashboard**
(Ask an admin to help send a test email with subject like "Contracted Rate
Request".)
Expected: Does NOT appear on the dashboard.

**TC-12 — Date range with "From" after "To"**
Set Departure Date "From" later than "To".
Expected: Empty result, no error shown. This is known/expected — do not
report as a new bug.

---

## 7. How to Report an Issue

For anything that doesn't match its "Expected Result" above, please note:

1. **Test ID** (e.g. TC-04)
2. **What you expected** vs. **what actually happened**
3. **Screenshot**
4. **Steps to reproduce it again**

Send your findings back through the usual channel.

---

*Questions during testing? Reach out before assuming something is broken —
some slowness and specific messages listed above are expected behavior, not
bugs.*
