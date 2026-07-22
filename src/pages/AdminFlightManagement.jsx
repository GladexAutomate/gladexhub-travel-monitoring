import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { invokeApi } from "@/lib/vercelApi";
import { useAuth, ADMIN_LIKE_ROLES } from "@/hooks/useAuth";
import FlightTrackerSidebar from "@/components/FlightTrackerSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldAlert,
  Plane,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  LogOut,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Phone,
  Mail,
  ChevronLeft,
  Archive,
  UserCircle,
  Tv,
  PlaneTakeoff,
  PlaneLanding,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const ROLE_LABELS = {
  agent: "Agent",
  team_leader: "Team Leader",
  hr: "HR",
  admin: "Admin",
  super_admin: "Super Admin",
};

const PAGE_SIZE = 50;

// Why a flight email's booking_ref did/didn't resolve to an internal GDX
// booking — developer-only diagnostics, shown in the expanded row detail.
const DEBUG_REASON_LABELS = {
  OK: "Matched — GDX booking found.",
  NO_TICKET: "Walang ticket_details_b1d64ca0 row para sa booking ref na ito (hindi pa naka-encode sa internal system).",
  NO_BOOKING_LINK: "May ticket_details row, pero blangko ang booking_transactions link nito (hindi pa na-connect sa isang GDX booking).",
  BROKEN_LINK: "May booking_transactions value, pero walang tumugmang record sa bookings_6fbdd6b2 (record_id o gdx) — malamang mali o luma ang reference.",
};

const TYPE_STYLES = {
  confirmation: { label: "Confirmation", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  reschedule: { label: "Reschedule", className: "bg-orange-100 text-orange-700 border-orange-200" },
  cancellation: { label: "Cancellation", className: "bg-red-100 text-red-700 border-red-200" },
  // From Code.gs's checkForUnknownAirlineSenders_ — a flight-shaped email
  // from a sender not yet configured in AIRLINES. No parsed flight details
  // (booking_ref holds the raw subject line instead) — someone needs to
  // pull a real sample and add a proper parser.
  needs_attention: { label: "Needs Attention", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

function TypeBadge({ type }) {
  const style = TYPE_STYLES[type] || { label: type || "Unknown", className: "bg-muted text-muted-foreground border-border" };
  return <Badge className={cn("border", style.className)}>{style.label}</Badge>;
}

function formatDate(value, pattern = "MMM d, yyyy") {
  if (!value) return "—";
  try {
    return format(new Date(value), pattern);
  } catch {
    return value;
  }
}

function inferTripType(legs) {
  if (!legs || legs.length === 0) return null;
  if (legs.length === 1) return "One-way";
  if (
    legs.length === 2 &&
    legs[0].origin === legs[1].destination &&
    legs[0].destination === legs[1].origin
  ) {
    return "Round-trip";
  }
  return "Multi-city";
}

// Supabase queries are proxied through the querySupabase backend function
// because the Base44 frontend can't read VITE_ env vars at runtime. These
// wrappers preserve the same return format as the old direct-supabaseFusioo
// versions (fusioo rows come back as { id, data } — we map to just the data
// blob) so the rest of the page's enrichment logic doesn't change. Batching
// is handled server-side.
//
// invokeApi() rejects (throws) on any non-2xx response rather than
// resolving with the error in response.data — so the real backend message
// (e.g. "Account deactivated") only surfaces if we read it out of the
// rejected error here, not by checking response.data.error on success.
function invokeError(err) {
  return new Error(err.response?.data?.error || err.message);
}

async function selectFusiooByJsonbField(table, field, values, requesterEmail) {
  if (!values || values.length === 0) return [];
  try {
    const response = await invokeApi('querySupabase', {
      project: 'fusioo',
      table,
      operation: 'filterJsonbIn',
      jsonbField: field,
      values,
      requesterEmail,
    });
    return (response.data.rows || []).map((row) => row.data);
  } catch (err) {
    throw invokeError(err);
  }
}

async function selectFusiooByIds(table, ids, requesterEmail) {
  if (!ids || ids.length === 0) return [];
  try {
    const response = await invokeApi('querySupabase', {
      project: 'fusioo',
      table,
      operation: 'filterIdIn',
      ids,
      requesterEmail,
    });
    return (response.data.rows || []).map((row) => row.data);
  } catch (err) {
    throw invokeError(err);
  }
}

async function selectFusiooAllRows(table, requesterEmail) {
  try {
    const response = await invokeApi('querySupabase', {
      project: 'fusioo',
      table,
      operation: 'selectAllPaginated',
      requesterEmail,
    });
    return (response.data.rows || []).map((row) => row.data);
  } catch (err) {
    throw invokeError(err);
  }
}

// departure_date is stored as a plain "YYYY-MM-DD" string, so plain string
// comparison sorts/buckets correctly without any Date-object timezone
// pitfalls (parsing a date-only string as UTC and comparing against a local
// "today" can shift the calendar day depending on the browser's timezone).
function getPrimaryDepartureDate(record) {
  return record.flights?.[0]?.departure_date || null;
}

function getPrimaryArrivalDate(record) {
  return record.flights?.[0]?.arrival_date || null;
}

// received_date is a full timestamp (not a plain date string like
// departure_date), so it needs converting to a local-timezone "YYYY-MM-DD"
// key before it can be bucketed/compared against todayDateKey()/
// yesterdayDateKey() the same way departure-date grouping already was.
function getReceivedDateKey(record) {
  if (!record.received_date) return null;
  const d = new Date(record.received_date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Historical backfills before this file's current CONFIG.HISTORICAL_AFTER_DATE
// was narrowed left thousands of 2022-2024 bookings sitting in flight_emails
// — years-old, no longer operationally relevant, just noise in both the
// upcoming and archive views. Filtered here (not deleted from Supabase) so
// the data isn't destroyed, just hidden from day-to-day use.
const MIN_DEPARTURE_DATE = "2026-01-01";

function dateKeyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayDateKey() {
  return dateKeyOffset(0);
}

function yesterdayDateKey() {
  return dateKeyOffset(-1);
}

function paginationRange(page, pageSize, total) {
  if (total === 0) return { start: 0, end: 0 };
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return { start, end };
}

export default function AdminFlightManagement() {
  const { user, logout, isAdminLike } = useAuth();
  const navigate = useNavigate();

  // Whether the agent-primary grouping (and the team/agent roster queries it
  // needs) applies to this role at all — an agent only ever sees their own
  // bookings, so there's nothing to group.
  const groupByAgent = isAdminLike || user?.role === "team_leader";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/admin/flight-tracker-login", { replace: true });
  };

  const { data: records = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["flight_emails"],
    enabled: !!user?.email,
    queryFn: async () => {
      try {
        const response = await invokeApi('querySupabase', {
          project: 'automate',
          table: 'flight_emails',
          operation: 'selectAllOrdered',
          orderBy: 'received_date',
          ascending: false,
          minPrimaryDepartureDate: MIN_DEPARTURE_DATE,
          requesterEmail: user?.email,
        });
        return response.data.rows || [];
      } catch (err) {
        throw invokeError(err);
      }
    },
    // Gmail sync only writes new rows every ~15 min, but poll more often
    // than that so a newly-synced email shows up without anyone needing to
    // notice and click Refresh. refetchOnWindowFocus is on here specifically
    // (overriding the app-wide default in query-client.js) since coming back
    // to this tab is exactly when someone wants the freshest list.
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    // Without this, React Query treats data as stale the instant it lands —
    // so navigating away and back (e.g. Accounts page then back to Flight
    // Emails) re-fetched the whole ~3.8k-row query from scratch even if it
    // had just loaded seconds ago. staleTime just under refetchInterval
    // means a remount within that window reuses the cached data instantly
    // instead of blocking on a new request, while the interval/focus
    // triggers above still keep it genuinely live.
    staleTime: 55 * 1000,
  });

  // GDX/client lookup: flight_emails only holds what the airline email says
  // (no GDX — that's Gladex's own internal reference, not something airlines
  // include). Enrich by joining against the Fusioo data mirror (Sales'
  // ticket_details_b1d64ca0/bookings_6fbdd6b2 are unreachable — that
  // project is paused — and Fusioo is the actual source those tables were
  // synced from anyway): booking_ref -> fusioo_ticket_details
  // (customer_last_name + booking_transactions link) -> fusioo_booking_transactions
  // (gdx). Looked up live on every load rather than stored on flight_emails,
  // so it reflects the current record instead of a stale snapshot.
  //
  // Coverage is inherently partial: agents inconsistently fill in
  // booking_reference_number_pnr on the Fusioo Ticket Details app — many
  // rows have a Sabre/e-ticket number there instead of the actual airline
  // PNR, which is the only thing flight_emails.booking_ref can match
  // against (confirmed 2026-07-10: ~11% of Airline-type tickets have a
  // PNR-shaped value in that field). A booking_ref with no match isn't a
  // bug — the real PNR was simply never recorded on the matching side.
  const bookingRefs = useMemo(
    () => Array.from(new Set(records.map((r) => r.booking_ref).filter(Boolean))),
    [records]
  );

  const { data: gdxByBookingRef = {} } = useQuery({
    queryKey: ["flight_emails_gdx_lookup_fusioo", bookingRefs],
    enabled: bookingRefs.length > 0 && !!user?.email,
    queryFn: async () => {
      const tickets = await selectFusiooByJsonbField(
        "fusioo_ticket_details",
        "booking_reference_number_pnr",
        bookingRefs,
        user?.email
      );

      // booking_transactions on a Fusioo ticket is an array of Fusioo record
      // ids (usually just one) pointing straight at fusioo_booking_transactions.id
      // — a real, always-consistent link (unlike the old Sales table's mixed
      // record_id/gdx-number format), so no format-sniffing needed here.
      const bookingIds = Array.from(
        new Set(tickets.flatMap((t) => t.booking_transactions || []))
      );

      // agent_name/name_of_agent are the same "Team Name"/"Agent Name" fields
      // shown on Fusioo's Booking Transactions app — used for RBAC filtering
      // (team_leader sees their team's bookings, agent sees only their own).
      // Both are stored as single-element arrays on the Fusioo record.
      const bookingRows = await selectFusiooByIds("fusioo_booking_transactions", bookingIds, user?.email);
      const bookingsById = Object.fromEntries(bookingRows.map((b) => [b.id, b]));

      const lookup = {};
      tickets.forEach((t) => {
        const bookingId = (t.booking_transactions || [])[0] || null;
        const booking = bookingId ? bookingsById[bookingId] : null;
        // developer-only diagnostics for why a booking_ref did or didn't
        // resolve to a GDX record — see the debug reason labels below.
        const debug = {
          reason: !bookingId ? "NO_BOOKING_LINK" : !booking ? "BROKEN_LINK" : "OK",
          rawBookingTransactions: bookingId,
          bookingRecordId: booking?.id ?? null,
        };
        const candidate = {
          gdx: booking?.gdx ?? null,
          clientName: booking?.lead_name || t.customer_last_name || null,
          mobile: booking?.mobile_1 || null,
          email: booking?.email_1 || null,
          teamName: (booking?.agent_name || [])[0] || null,
          agentName: (booking?.name_of_agent || [])[0] || null,
          debug,
        };
        const existing = lookup[t.booking_reference_number_pnr];
        // More than one ticket row can share the same PNR (duplicate
        // entries, or a row whose booking_transactions link is missing/
        // malformed). Keep whichever one actually resolves to a GDX instead
        // of letting a later blank row silently overwrite a working match.
        if (!existing || (!existing.gdx && candidate.gdx)) {
          lookup[t.booking_reference_number_pnr] = candidate;
        }
      });

      // booking_refs with no ticket row at all never enter the loop above,
      // so they'd otherwise be missing from the lookup entirely (which is
      // fine for the "—" display, but leaves developer diagnostics with
      // nothing to point to). Fill those in explicitly.
      const ticketedRefs = new Set(tickets.map((t) => t.booking_reference_number_pnr));
      bookingRefs.forEach((ref) => {
        if (!ticketedRefs.has(ref) && !lookup[ref]) {
          lookup[ref] = {
            gdx: null,
            clientName: null,
            mobile: null,
            email: null,
            teamName: null,
            agentName: null,
            debug: { reason: "NO_TICKET", rawBookingTransactions: null, bookingRecordId: null },
          };
        }
      });

      return lookup;
    },
  });

  const airlines = useMemo(
    () => Array.from(new Set(records.map((r) => r.airline).filter(Boolean))).sort(),
    [records]
  );

  // agent_name (the "team" tag on a booking) is set per-transaction, not
  // per-person — the same agent's bookings can carry different team tags
  // depending on who happened to process each one. An agent's real team is
  // therefore whichever tag is the MAJORITY across ALL of their bookings —
  // computed company-wide (the full fusioo_booking_transactions mirror, not
  // just the bookings tied to already-fetched flight_emails, since that
  // subset can be small/skewed for an agent with few linked emails and give
  // the wrong majority. Used for the team_leader RBAC boundary below and for
  // the admin/developer Team filter, so both agree on who's on which team.
  const { data: agentPrimaryTeam = {} } = useQuery({
    queryKey: ["fusioo_agent_team_roster"],
    enabled: groupByAgent && !!user?.email,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const rows = await selectFusiooAllRows("fusioo_booking_transactions", user?.email);
      const counts = {};
      rows.forEach((b) => {
        const agent = ((b.name_of_agent || [])[0] || "").trim();
        const team = ((b.agent_name || [])[0] || "").trim();
        if (!agent || !team) return;
        counts[agent] = counts[agent] || {};
        counts[agent][team] = (counts[agent][team] || 0) + 1;
      });
      const primary = {};
      Object.entries(counts).forEach(([agent, teamCounts]) => {
        primary[agent] = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0][0];
      });
      return primary;
    },
  });

  // RBAC boundary — applied before the user-facing filters below, since this
  // is access control, not a togglable preference. Matched against
  // agent_name (team)/name_of_agent (person) from the Fusioo mirror, joined
  // above — no live Fusioo API call from the frontend.
  const accessScoped = useMemo(() => {
    if (!user) return [];
    if (ADMIN_LIKE_ROLES.includes(user.role)) return records;

    const myName = user.name?.trim().toLowerCase();
    const myTeam = user.team?.trim().toLowerCase();

    return records.filter((r) => {
      const info = gdxByBookingRef[r.booking_ref];
      if (user.role === "agent") {
        return info?.agentName?.trim().toLowerCase() === myName;
      }
      if (user.role === "team_leader") {
        const agentName = info?.agentName?.trim();
        return !!agentName && agentPrimaryTeam[agentName]?.trim().toLowerCase() === myTeam;
      }
      return false;
    });
  }, [records, user, gdxByBookingRef, agentPrimaryTeam]);

  // Derived from accessScoped (not the full lookup) so these options
  // automatically narrow to whatever the role can already see — a
  // team_leader only ever sees their own team_name here, an agent-filter
  // list that only includes agents on their team, etc. Matched against
  // agentPrimaryTeam (an agent's overall team) rather than each booking's own
  // team tag, so this stays consistent with the team_leader RBAC boundary
  // above — picking "Lead Hustlers 1, 2, 3" here shows the exact same set a
  // team_leader on that team would see themselves.
  const teamOptions = useMemo(
    () => Array.from(new Set(accessScoped.map((r) => agentPrimaryTeam[gdxByBookingRef[r.booking_ref]?.agentName]).filter(Boolean))).sort(),
    [accessScoped, gdxByBookingRef, agentPrimaryTeam]
  );
  const agentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          accessScoped
            .filter((r) => teamFilter === "all" || agentPrimaryTeam[gdxByBookingRef[r.booking_ref]?.agentName] === teamFilter)
            .map((r) => gdxByBookingRef[r.booking_ref]?.agentName)
            .filter(Boolean)
        )
      ).sort(),
    [accessScoped, gdxByBookingRef, teamFilter, agentPrimaryTeam]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accessScoped.filter((r) => {
      const departureDate = getPrimaryDepartureDate(r);
      if (departureDate && departureDate < MIN_DEPARTURE_DATE) return false;

      const matchesType = typeFilter === "all" || r.email_type === typeFilter;
      const matchesAirline = airlineFilter === "all" || r.airline === airlineFilter;

      const gdxInfo = gdxByBookingRef[r.booking_ref];
      const matchesTeam = teamFilter === "all" || agentPrimaryTeam[gdxInfo?.agentName] === teamFilter;
      const matchesAgent = agentFilter === "all" || gdxInfo?.agentName === agentFilter;

      const receivedDate = r.received_date ? new Date(r.received_date) : null;
      const matchesFrom = !dateFrom || (receivedDate && receivedDate >= new Date(dateFrom));
      const matchesTo = !dateTo || (receivedDate && receivedDate <= new Date(dateTo + "T23:59:59"));

      const routes = (r.flights || []).map((f) => f.route).join(" ").toLowerCase();
      const matchesSearch =
        !q ||
        r.booking_ref?.toLowerCase().includes(q) ||
        routes.includes(q) ||
        String(gdxInfo?.gdx ?? "").toLowerCase().includes(q) ||
        gdxInfo?.clientName?.toLowerCase().includes(q);

      return matchesType && matchesAirline && matchesTeam && matchesAgent && matchesFrom && matchesTo && matchesSearch;
    });
  }, [accessScoped, search, typeFilter, airlineFilter, teamFilter, agentFilter, dateFrom, dateTo, gdxByBookingRef, agentPrimaryTeam]);

  // Reset both tables back to page 1 whenever a filter changes — otherwise a
  // narrower filter could leave the view stranded on a now-nonexistent page.
  useEffect(() => {
    setPage(1);
    setArchivePage(1);
  }, [search, typeFilter, airlineFilter, teamFilter, agentFilter, dateFrom, dateTo]);

  const todayKey = useMemo(() => todayDateKey(), []);
  const yesterdayKey = useMemo(() => yesterdayDateKey(), []);

  // Split into upcoming (today or later, or no date at all — we can't tell
  // if an undated record is past or future, so default to keeping it
  // visible) vs archive (departure_date strictly before today).
  const { upcoming, archived } = useMemo(() => {
    const up = [];
    const arch = [];
    filtered.forEach((r) => {
      const d = getPrimaryDepartureDate(r);
      if (d && d < todayKey) {
        arch.push(r);
      } else {
        up.push(r);
      }
    });

    // Flat, newest-received-first — no more clustering everything under one
    // agent/team header. Who handled a booking is still visible (as an
    // inline tag on each row, see FlightRows), just not used to group rows
    // together anymore; an admin scanning for "what just happened" no
    // longer has to open every agent's own cluster to find it.
    const byReceivedDateDesc = (a, b) => {
      const ra = a.received_date || "";
      const rb = b.received_date || "";
      return ra < rb ? 1 : ra > rb ? -1 : 0;
    };
    up.sort(byReceivedDateDesc);
    arch.sort(byReceivedDateDesc);

    return { upcoming: up, archived: arch };
  }, [filtered, todayKey]);

  const upcomingPageCount = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const upcomingPage = Math.min(page, upcomingPageCount);
  const upcomingPageItems = upcoming.slice((upcomingPage - 1) * PAGE_SIZE, upcomingPage * PAGE_SIZE);
  const upcomingRange = paginationRange(upcomingPage, PAGE_SIZE, upcoming.length);

  const archivePageCount = Math.max(1, Math.ceil(archived.length / PAGE_SIZE));
  const archivePageSafe = Math.min(archivePage, archivePageCount);
  const archivePageItems = archived.slice((archivePageSafe - 1) * PAGE_SIZE, archivePageSafe * PAGE_SIZE);
  const archiveRange = paginationRange(archivePageSafe, PAGE_SIZE, archived.length);

  const stats = useMemo(
    () => ({
      total: accessScoped.length,
      confirmation: accessScoped.filter((r) => r.email_type === "confirmation").length,
      reschedule: accessScoped.filter((r) => r.email_type === "reschedule").length,
      cancellation: accessScoped.filter((r) => r.email_type === "cancellation").length,
      departingToday: accessScoped.filter((r) => getPrimaryDepartureDate(r) === todayKey).length,
      arrivingToday: accessScoped.filter((r) => getPrimaryArrivalDate(r) === todayKey).length,
    }),
    [accessScoped, todayKey]
  );

  // Team Leader lookup (team_name -> leader's full_name), sourced from
  // admin_accounts (not flight bookings) — shown inline in each agent's
  // group header below (see FlightRows), not as its own column.
  const { data: employeeAccounts = [], isError: isTeamLeaderListError } = useQuery({
    queryKey: ["admin_accounts_hierarchy"],
    enabled: groupByAgent && !!user?.email,
    queryFn: async () => {
      try {
        const response = await invokeApi('employeeList', {
          requesterEmail: user?.email,
        });
        return (response.data?.accounts || []).filter((e) => e.role === 'team_leader');
      } catch (err) {
        throw invokeError(err);
      }
    },
  });

  useEffect(() => {
    if (isTeamLeaderListError) {
      console.error('Failed to load team leader roster — team leader labels will be blank.');
    }
  }, [isTeamLeaderListError]);

  const teamLeaderByTeam = useMemo(
    () => Object.fromEntries(employeeAccounts.filter((e) => e.team_name).map((e) => [e.team_name, e.full_name])),
    [employeeAccounts]
  );

  const colSpanCount = 10;

  return (
    <div className="min-h-screen flex bg-background">
      <FlightTrackerSidebar active="emails" />

      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-orange-500 to-amber-400 rounded-lg">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <p className="font-display font-bold text-sm">Flight Tracker</p>
          </div>
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 text-red-700 text-[10px] font-bold">
            <ShieldAlert className="w-3 h-3" /> ADMIN VIEW
          </span>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-auto space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-display font-bold">Flight Email Management</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Flight confirmation, reschedule, and cancellation emails synced from Gmail.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm mr-1">
                <UserCircle className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{user?.name || "—"}</span>
                <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[user?.role] || user?.role}</Badge>
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh">
                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
              </Button>
              {/* Opens in a new tab so the TV device can navigate straight to
                  that URL and be left open indefinitely — no mouse/keyboard
                  needed there after the one-time login. */}
              <Button variant="outline" size="icon" asChild title="TV Display">
                <a href="/admin/flight-tracker-tv" target="_blank" rel="noopener noreferrer">
                  <Tv className="w-4 h-4" />
                </a>
              </Button>
              <Button variant="outline" className="gap-2" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total Flights" value={stats.total} icon={Plane} />
            <StatCard label="Confirmations" value={stats.confirmation} icon={CheckCircle2} accent="text-emerald-600" iconBg="bg-emerald-50" />
            <StatCard label="Reschedules" value={stats.reschedule} icon={RotateCcw} accent="text-orange-600" iconBg="bg-orange-50" />
            <StatCard label="Cancellations" value={stats.cancellation} icon={XCircle} accent="text-red-600" iconBg="bg-red-50" />
            <StatCard label="Departing Today" value={stats.departingToday} icon={PlaneTakeoff} accent="text-blue-600" iconBg="bg-blue-50" />
            <StatCard label="Arriving Today" value={stats.arrivingToday} icon={PlaneLanding} accent="text-purple-600" iconBg="bg-purple-50" />
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <CardTitle className="text-base font-display">Flight Emails ({filtered.length})</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="confirmation">Confirmation</SelectItem>
                      <SelectItem value="reschedule">Reschedule</SelectItem>
                      <SelectItem value="cancellation">Cancellation</SelectItem>
                      <SelectItem value="needs_attention">Needs Attention</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={airlineFilter} onValueChange={setAirlineFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Airline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Airlines</SelectItem>
                      {airlines.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Team filter — admin/developer only; a team_leader is
                      already scoped to their own team, so there's nothing
                      for them to pick. Each option is labeled with its team
                      leader so admin/developer can see the same
                      team-leader-to-team breakdown a team_leader account
                      would see, without a separate dropdown for it. */}
                  {isAdminLike && (
                    <Select
                      value={teamFilter}
                      onValueChange={(v) => { setTeamFilter(v); setAgentFilter("all"); }}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Teams</SelectItem>
                        {teamOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                            {teamLeaderByTeam[t] ? ` — ${teamLeaderByTeam[t]}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Agent filter — admin/developer (any agent) and
                      team_leader (limited to their own team's agents, per
                      agentOptions above). Not shown for a plain agent, who
                      only ever sees their own bookings anyway. */}
                  {(isAdminLike || user?.role === "team_leader") && (
                    <Select value={agentFilter} onValueChange={setAgentFilter}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {agentOptions.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search ref, route, GDX, or client..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <FlightTableHeader />
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={colSpanCount} className="text-center py-12">
                          <div className="w-6 h-6 mx-auto border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                          {/* This dataset is large (10,000+ rows fetched in full on every
                              load — no incremental/delta fetch yet) — a few seconds here
                              is expected, not a hang. Said explicitly so it doesn't get
                              reported as a bug during testing. */}
                          <p className="text-sm text-muted-foreground mt-3">
                            Loading flight emails — this can take a few seconds with a large dataset.
                          </p>
                        </TableCell>
                      </TableRow>
                    )}

                    {isError && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={colSpanCount} className="text-center py-12 text-red-600">
                          Failed to load flight emails. Check your Supabase connection and try refreshing.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && !isError && upcoming.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={colSpanCount} className="text-center py-12 text-muted-foreground">
                          No upcoming flight emails found.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && !isError && (
                      <FlightRows
                        rows={upcomingPageItems}
                        expandedId={expandedId}
                        setExpandedId={setExpandedId}
                        gdxByBookingRef={gdxByBookingRef}
                        groupByDate
                        todayKey={todayKey}
                        yesterdayKey={yesterdayKey}
                        groupByAgent={groupByAgent}
                        isAdminLike={isAdminLike}
                        teamLeaderByTeam={teamLeaderByTeam}
                        agentPrimaryTeam={agentPrimaryTeam}
                        showDebugInfo={user?.role === "super_admin"}
                      />
                    )}
                  </TableBody>
                </Table>
              </div>

              {!isLoading && !isError && upcoming.length > 0 && (
                <PaginationBar
                  range={upcomingRange}
                  total={upcoming.length}
                  page={upcomingPage}
                  pageCount={upcomingPageCount}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(upcomingPageCount, p + 1))}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setArchiveOpen((o) => !o)}
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-base font-display">Archive ({archived.length})</CardTitle>
                  <span className="text-xs text-muted-foreground">Past departures</span>
                </div>
                {archiveOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </CardHeader>
            {archiveOpen && (
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <FlightTableHeader />
                    <TableBody>
                      {archived.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={colSpanCount} className="text-center py-12 text-muted-foreground">
                            No archived flight emails.
                          </TableCell>
                        </TableRow>
                      )}

                      {archived.length > 0 && (
                        <FlightRows
                          rows={archivePageItems}
                          expandedId={expandedId}
                          setExpandedId={setExpandedId}
                          gdxByBookingRef={gdxByBookingRef}
                          groupByDate
                          todayKey={todayKey}
                          yesterdayKey={yesterdayKey}
                          groupByAgent={groupByAgent}
                          isAdminLike={isAdminLike}
                          teamLeaderByTeam={teamLeaderByTeam}
                          agentPrimaryTeam={agentPrimaryTeam}
                          showDebugInfo={user?.role === "super_admin"}
                        />
                      )}
                    </TableBody>
                  </Table>
                </div>

                {archived.length > 0 && (
                  <PaginationBar
                    range={archiveRange}
                    total={archived.length}
                    page={archivePageSafe}
                    pageCount={archivePageCount}
                    onPrev={() => setArchivePage((p) => Math.max(1, p - 1))}
                    onNext={() => setArchivePage((p) => Math.min(archivePageCount, p + 1))}
                  />
                )}
              </CardContent>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}

const HEADER_CELL_CLASS = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 h-9 whitespace-nowrap";

function FlightTableHeader() {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-8"></TableHead>
        <TableHead className={HEADER_CELL_CLASS}>Airline</TableHead>
        <TableHead className={HEADER_CELL_CLASS}>Booking Ref</TableHead>
        <TableHead className={HEADER_CELL_CLASS}>GDX</TableHead>
        <TableHead className={HEADER_CELL_CLASS}>Client</TableHead>
        <TableHead className={HEADER_CELL_CLASS}>Type</TableHead>
        <TableHead className={HEADER_CELL_CLASS}>Route/s</TableHead>
        <TableHead className={cn(HEADER_CELL_CLASS, "hidden md:table-cell")}>Departure Date</TableHead>
        <TableHead className={cn(HEADER_CELL_CLASS, "hidden md:table-cell")}>Arrival Date</TableHead>
        <TableHead className={cn(HEADER_CELL_CLASS, "hidden md:table-cell")}>Received Date</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// Repeats the same column labels as FlightTableHeader right after every
// agent's name — the real <thead> only ever renders once at the very top of
// the table, so by the time someone scrolls past the first few agents, it's
// long out of view and the columns (GDX, Type, Route/s...) stop being
// obvious. A muted background tint (vs. the plain top header) keeps it
// readable as "this is a reminder", not a second real table.
function FlightColumnLabelsRow() {
  return (
    <TableRow className="hover:bg-transparent bg-muted/40 border-y">
      <TableHead className="w-8"></TableHead>
      <TableHead className={HEADER_CELL_CLASS}>Airline</TableHead>
      <TableHead className={HEADER_CELL_CLASS}>Booking Ref</TableHead>
      <TableHead className={HEADER_CELL_CLASS}>GDX</TableHead>
      <TableHead className={HEADER_CELL_CLASS}>Client</TableHead>
      <TableHead className={HEADER_CELL_CLASS}>Type</TableHead>
      <TableHead className={HEADER_CELL_CLASS}>Route/s</TableHead>
      <TableHead className={cn(HEADER_CELL_CLASS, "hidden md:table-cell")}>Departure Date</TableHead>
      <TableHead className={cn(HEADER_CELL_CLASS, "hidden md:table-cell")}>Arrival Date</TableHead>
      <TableHead className={cn(HEADER_CELL_CLASS, "hidden md:table-cell")}>Received Date</TableHead>
    </TableRow>
  );
}

function groupLabelFor(dateKey, todayKey, yesterdayKey) {
  if (!dateKey) return "No date";
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  return formatDate(dateKey, "EEEE, MMM d, yyyy");
}

function FlightRows({ rows, expandedId, setExpandedId, gdxByBookingRef, groupByDate, todayKey, yesterdayKey, groupByAgent, isAdminLike, teamLeaderByTeam, agentPrimaryTeam, showDebugInfo }) {
  let lastDateKey;
  let isFirstDateGroup = true;
  const colSpanCount = 10;

  return rows.map((r) => {
    const legs = r.flights || [];
    const gdxInfo = gdxByBookingRef[r.booking_ref];
    const tripType = inferTripType(legs);
    const isExpanded = expandedId === r.id;

    const agentKey = gdxInfo?.agentName || "(Unassigned)";
    // The agent's overall team (majority vote across all their bookings),
    // not this specific row's own team tag — a booking's tag can disagree
    // with the agent's real team on a handful of transactions.
    const agentTeam = agentPrimaryTeam?.[agentKey];
    const teamLeaderName = agentTeam ? teamLeaderByTeam?.[agentTeam] : null;

    // Sorted by received_date now (see the parent's useMemo), not clustered
    // by agent/team anymore — who handled a booking is shown inline per row
    // below instead. groupByAgent (true for admin-like/team_leader) still
    // gates whether that inline tag is worth showing at all — a plain
    // 'agent' viewer only ever sees their own bookings anyway.
    const dateKey = getReceivedDateKey(r);
    const showGroupHeader = groupByDate && dateKey !== lastDateKey;
    // The real <thead> (FlightTableHeader) is already sitting right above
    // the very first date group, with nothing but the filter bar in
    // between — an immediate repeat there reads as a plain duplicate, not a
    // helpful reminder. Only worth repeating once there's actually been a
    // scroll past a previous group, so it starts at the SECOND date group
    // onward.
    const showColumnLabelsRow = showGroupHeader && !isFirstDateGroup;
    if (groupByDate && dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      isFirstDateGroup = false;
    }

    return (
      <Fragment key={r.id}>
        {showGroupHeader && (
          <TableRow className="hover:bg-transparent border-0">
            <TableCell colSpan={colSpanCount} className="pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 border-t">
              {groupLabelFor(dateKey, todayKey, yesterdayKey)}
            </TableCell>
          </TableRow>
        )}
        {showColumnLabelsRow && <FlightColumnLabelsRow />}
        <TableRow
          className="cursor-pointer hover:bg-muted/50"
          onClick={() => setExpandedId(isExpanded ? null : r.id)}
        >
          <TableCell>
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </TableCell>
          <TableCell className="font-medium text-sm">{r.airline || "—"}</TableCell>
          <TableCell className="font-mono text-sm">{r.booking_ref || "—"}</TableCell>
          <TableCell className="font-mono text-sm">{gdxInfo?.gdx || "—"}</TableCell>
          <TableCell className="text-sm max-w-[200px]">
            <div className="truncate">{gdxInfo?.clientName || "—"}</div>
            {groupByAgent && (
              <div
                className="flex items-center gap-1 mt-0.5 min-w-0 text-[11px] text-muted-foreground"
                title={`${agentKey}${agentTeam ? ` · ${agentTeam}` : ""}${isAdminLike && teamLeaderName ? ` — TL: ${teamLeaderName}` : ""}`}
              >
                <UserCircle className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {agentKey}
                  {agentTeam && ` · ${agentTeam}`}
                  {isAdminLike && teamLeaderName && ` — TL: ${teamLeaderName}`}
                </span>
              </div>
            )}
          </TableCell>
          <TableCell><TypeBadge type={r.email_type} /></TableCell>
          <TableCell className="text-sm">
            {legs.map((f) => f.route).join(", ") || "—"}
            {tripType && <span className="ml-1.5 text-[10px] text-muted-foreground">({tripType})</span>}
          </TableCell>
          <TableCell className="hidden md:table-cell text-sm">{formatDate(legs[0]?.departure_date)}</TableCell>
          <TableCell className="hidden md:table-cell text-sm">{formatDate(legs[0]?.arrival_date)}</TableCell>
          <TableCell className="hidden md:table-cell text-sm">{formatDate(r.received_date, "MMM d, yyyy h:mm a")}</TableCell>
        </TableRow>
        {isExpanded && (
          <TableRow>
            <TableCell colSpan={colSpanCount} className="bg-muted/30 p-4">
              {(gdxInfo?.mobile || gdxInfo?.email) && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-3 p-3 rounded-lg bg-background border">
                  <span className="font-semibold text-muted-foreground">Contact:</span>
                  {gdxInfo.mobile && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {gdxInfo.mobile}
                    </span>
                  )}
                  {gdxInfo.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {gdxInfo.email}
                    </span>
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {legs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No flight leg details available.</p>
                )}
                {legs.map((leg, i) => (
                  <div key={i} className="p-3 rounded-lg bg-background border">
                    <p className="font-semibold text-sm mb-2">{leg.route || `${leg.origin || "?"}-${leg.destination || "?"}`} · {leg.flight_no || "—"}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <DetailRow label="Origin" value={leg.origin} />
                      <DetailRow label="Destination" value={leg.destination} />
                      <DetailRow
                        label="Departure"
                        value={`${leg.departure_date || "—"} ${leg.departure_time || ""}`}
                        oldValue={leg.original_departure_time ? `${leg.departure_date || "—"} ${leg.original_departure_time}` : null}
                      />
                      <DetailRow
                        label="Arrival"
                        value={`${leg.arrival_date || "—"} ${leg.arrival_time || ""}`}
                        oldValue={leg.original_arrival_time ? `${leg.arrival_date || "—"} ${leg.original_arrival_time}` : null}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Gmail message ID: <span className="font-mono">{r.gmail_message_id}</span>
              </p>
              {showDebugInfo && (
                <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-1">
                  <p className="font-semibold text-amber-800">Developer Debug — booking match status</p>
                  <p>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    {DEBUG_REASON_LABELS[gdxInfo?.debug?.reason] || "Unknown — no debug info recorded."}
                  </p>
                  {gdxInfo?.debug?.rawBookingTransactions && (
                    <p>
                      <span className="text-muted-foreground">ticket_details.booking_transactions:</span>{" "}
                      <span className="font-mono">{gdxInfo.debug.rawBookingTransactions}</span>
                      {gdxInfo.debug.matchedVia && ` (matched via ${gdxInfo.debug.matchedVia})`}
                    </p>
                  )}
                  {gdxInfo?.debug?.bookingRecordId && (
                    <p>
                      <span className="text-muted-foreground">bookings_6fbdd6b2.record_id:</span>{" "}
                      <span className="font-mono">{gdxInfo.debug.bookingRecordId}</span>
                    </p>
                  )}
                </div>
              )}
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    );
  });
}

function PaginationBar({ range, total, page, pageCount, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 pt-4">
      <p className="text-xs text-muted-foreground">
        Showing {range.start}-{range.end} of {total} flights
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1" onClick={onPrev} disabled={page <= 1}>
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>
        <span className="text-xs text-muted-foreground px-1">
          Page {page} of {pageCount}
        </span>
        <Button variant="outline" size="sm" className="gap-1" onClick={onNext} disabled={page >= pageCount}>
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent = "text-orange-600", iconBg = "bg-orange-50" }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", accent)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={cn("text-2xl font-display font-bold leading-tight tabular-nums", accent)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, oldValue }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      {oldValue ? (
        <p className="font-medium">
          <span className="line-through text-muted-foreground/70">{oldValue}</span>
          {" → "}
          <span className="text-orange-600">{value || "—"}</span>
        </p>
      ) : (
        <p className="font-medium">{value || "—"}</p>
      )}
    </div>
  );
}