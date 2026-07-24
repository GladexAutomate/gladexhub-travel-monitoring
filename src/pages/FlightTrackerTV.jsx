import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invokeApi } from "@/lib/vercelApi";
import { useAuth } from "@/hooks/useAuth";
import { Plane, CheckCircle2, RotateCcw, XCircle, AlertTriangle, Volume2 } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { fetchGdxByBookingRef } from "@/lib/fusioo-lookup";
import { todayDateKey, getPrimaryDepartureDate, getPrimaryArrivalDate, isUnregistered } from "@/lib/flight-email-helpers";

// Meant to be left open indefinitely on a wall-mounted TV/monitor with no
// mouse/keyboard — someone logs in once via the normal Flight Tracker login
// (same FlightTrackerAuthGuard as every other /admin route) on that device,
// then just leaves the tab open. No further interaction needed except the
// one-time "Enable Sound" tap below (browsers block audio autoplay until a
// real user gesture happens on the page — there's no way around that).
const REFRESH_MS = 30 * 1000;
const FEED_LIMIT = 30;
const HIGHLIGHT_MS = 20 * 1000;
const SOUND_ENABLED_KEY = "gladex_tv_sound_enabled";

const TYPE_META = {
  confirmation: { label: "Confirmation", icon: CheckCircle2, className: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", glowClassName: "bg-emerald-500/15" },
  reschedule: { label: "Reschedule", icon: RotateCcw, className: "text-orange-400 border-orange-500/40 bg-orange-500/10", glowClassName: "bg-orange-500/20" },
  cancellation: { label: "Cancellation", icon: XCircle, className: "text-red-400 border-red-500/40 bg-red-500/10", glowClassName: "bg-red-500/20" },
  needs_attention: { label: "Needs Attention", icon: AlertTriangle, className: "text-amber-400 border-amber-500/40 bg-amber-500/10", glowClassName: "bg-amber-500/20" },
};

// Rows worth an audible alert when they're brand new — a fresh confirmation
// isn't urgent (it's just a normal new booking), a fresh reschedule/
// cancellation/needs_attention is exactly what this screen exists to surface.
// Ranked most-to-least urgent — when a poll brings in several different
// types at once, only the most urgent one's tone plays (stacking 3
// different overlapping tones would be more confusing than helpful).
const ALERT_TYPES_BY_PRIORITY = ["cancellation", "reschedule", "needs_attention"];

// Each type gets its own recognizable tone/rhythm so someone across the room
// can tell what happened without reading the screen — a cancellation should
// sound more urgent than a routine schedule update. Urgency reads through
// PITCH (higher = more alarming, like a smoke detector, not lower), SPEED
// (rapid beeps, not measured ones), and volume — not just repeat count.
const ALERT_TONES = {
  // Rapid alternating high/low siren (like a real alarm), loud, sharp
  // attack — the most disruptive event (a booking is now void, not just
  // changed).
  cancellation: { frequencies: [1568, 1175], count: 8, gap: 0.11, duration: 0.1, gain: 0.45, type: "square" },
  // Medium pitch, 2 measured beeps, moderate volume — something changed,
  // worth a look, not an emergency.
  reschedule: { frequencies: [880], count: 2, gap: 0.35, duration: 0.3, gain: 0.28, type: "sine" },
  // Single, calm, higher chime, quietest of the three — lowest urgency (an
  // unrecognized sender, not a confirmed change).
  needs_attention: { frequencies: [1046], count: 1, gap: 0, duration: 0.4, gain: 0.22, type: "sine" },
};

function beep(type) {
  const tone = ALERT_TONES[type] || ALERT_TONES.reschedule;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < tone.count; i++) {
      const start = i * tone.gap;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.value = tone.frequencies[i % tone.frequencies.length];
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, ctx.currentTime + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + tone.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + tone.duration + 0.02);
    }
  } catch {
    // Web Audio unavailable — silently skip, the visual flash still works.
  }
}

function invokeError(err) {
  return new Error(err.response?.data?.error || err.message);
}

export default function FlightTrackerTV() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_ENABLED_KEY) === "true");
  // Tracked separately from soundEnabled (which persists in localStorage and
  // stays true forever once tapped once) — fullscreen itself does NOT
  // persist, so exiting it (remote's back button, Escape, closing an
  // overlay) left no way back in: the tap button only ever showed while
  // soundEnabled was still false. Listening for the real fullscreenchange
  // event means the button reappears every time fullscreen is lost, not
  // just the very first time.
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  const [newlySeenIds, setNewlySeenIds] = useState(() => new Set());
  const seenIdsRef = useRef(null); // null until the first successful fetch, so nothing "flashes" on initial load

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: records = [], isError } = useQuery({
    queryKey: ["flight_emails_tv"],
    enabled: !!user?.email,
    queryFn: async () => {
      try {
        const response = await invokeApi("querySupabase", {
          project: "automate",
          table: "flight_emails",
          operation: "selectAllOrdered",
          orderBy: "received_date",
          ascending: false,
          // Matches AdminFlightManagement.jsx's MIN_DEPARTURE_DATE — no
          // reason for a wall display to ever alert on a years-old
          // backfilled booking.
          minPrimaryDepartureDate: "2026-01-01",
          requesterEmail: user?.email,
        });
        return response.data.rows || [];
      } catch (err) {
        throw invokeError(err);
      }
    },
    refetchInterval: REFRESH_MS,
  });

  // Shared with AdminFlightManagement.jsx (src/lib/fusioo-lookup.js) so the
  // TV screen's "Unregistered Flights" stat means exactly the same thing as
  // the admin dashboard's — this page previously had no GDX lookup at all,
  // which is why its stats drifted to a completely different set (plain
  // Confirmations/Reschedules/Cancellations/Needs Attention counts) instead
  // of matching the dashboard's Flight Updates/Arrivals/Departures/
  // Unregistered breakdown.
  const bookingRefs = useMemo(
    () => Array.from(new Set(records.map((r) => r.booking_ref).filter(Boolean))),
    [records]
  );
  const { data: gdxByBookingRef = {} } = useQuery({
    queryKey: ["flight_emails_tv_gdx_lookup_fusioo", bookingRefs],
    enabled: bookingRefs.length > 0 && !!user?.email,
    queryFn: () => fetchGdxByBookingRef(bookingRefs, user?.email),
  });

  const feed = useMemo(() => records.slice(0, FEED_LIMIT), [records]);

  // Diff against the previous poll to find genuinely new rows, flash them,
  // and beep once per batch if any are alert-worthy.
  useEffect(() => {
    if (records.length === 0) return;
    const currentIds = new Set(records.map((r) => r.gmail_message_id));

    if (seenIdsRef.current === null) {
      seenIdsRef.current = currentIds;
      return;
    }

    const freshIds = records
      .filter((r) => !seenIdsRef.current.has(r.gmail_message_id))
      .map((r) => r.gmail_message_id);

    if (freshIds.length > 0) {
      setNewlySeenIds((prev) => new Set([...prev, ...freshIds]));

      if (soundEnabled) {
        const freshIdSet = new Set(freshIds);
        const freshTypes = new Set(records.filter((r) => freshIdSet.has(r.gmail_message_id)).map((r) => r.email_type));
        const mostUrgent = ALERT_TYPES_BY_PRIORITY.find((t) => freshTypes.has(t));
        if (mostUrgent) beep(mostUrgent);
      }

      setTimeout(() => {
        setNewlySeenIds((prev) => {
          const next = new Set(prev);
          freshIds.forEach((id) => next.delete(id));
          return next;
        });
      }, HIGHLIGHT_MS);
    }

    seenIdsRef.current = currentIds;
  }, [records, soundEnabled]);

  const todayKey = useMemo(() => todayDateKey(), []);
  const stats = useMemo(
    () => ({
      updates: records.filter((r) => r.email_type === "reschedule" || r.email_type === "cancellation").length,
      arrivals: records.filter((r) => getPrimaryArrivalDate(r) === todayKey).length,
      departures: records.filter((r) => getPrimaryDepartureDate(r) === todayKey).length,
      unregistered: records.filter((r) => isUnregistered(r, gdxByBookingRef)).length,
    }),
    [records, todayKey, gdxByBookingRef]
  );

  // One tap does both — sound and fullscreen both require a real user
  // gesture before a browser will allow them, so this is the single moment
  // available to ask for either. requestFullscreen can reject (some
  // browsers/embedded WebViews don't support it, or it's already
  // fullscreen) — that's fine, sound still gets enabled either way.
  const startDisplay = () => {
    beep("reschedule");
    localStorage.setItem(SOUND_ENABLED_KEY, "true");
    setSoundEnabled(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-100 p-8 flex flex-col gap-6">
      {/* Non-blocking on purpose — a TV remote's OK button usually works fine
          here, but if it ever doesn't (odd smart-TV browser, no remote focus
          landing on the button, etc.) the dashboard itself must still be
          fully visible and usable underneath. Sound/fullscreen are a nice-to-
          have layered on top, never a gate in front of the actual feature. */}
      {/* Centered like a real prompt (not a tucked-away corner button) so it's
          unmissable from across a room and easy to land a remote's OK button
          on — the semi-transparent backdrop doesn't intercept clicks/taps
          (pointer-events-none) so the dashboard underneath stays fully
          visible and usable even if a remote somehow never reaches the
          button (same non-blocking guarantee as before). */}
      {!isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none">
          <button
            onClick={startDisplay}
            autoFocus
            className="pointer-events-auto flex flex-col items-center gap-3 px-10 py-8 rounded-2xl bg-orange-600 hover:bg-orange-500 transition-colors text-white shadow-2xl shadow-black/60 focus:outline-none focus:ring-4 focus:ring-orange-300"
          >
            <Volume2 className="w-10 h-10" />
            <span className="font-bold text-2xl">Press OK to start display</span>
            <span className="text-sm font-medium text-orange-100">{soundEnabled ? "Full-screen" : "Sound + full-screen"}</span>
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
            <Plane className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">GladexHub Flight Tracker</h1>
            <p className="text-sm text-slate-400">Live — updates every {REFRESH_MS / 1000}s</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold tabular-nums">{format(now, "h:mm:ss a")}</div>
          <div className="text-sm text-slate-400">{format(now, "EEEE, MMMM d, yyyy")}</div>
        </div>
      </div>

      {isError && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300">
          Failed to load flight emails — will retry automatically.
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <TvStat label="Flight Updates" value={stats.updates} className="text-orange-400" />
        <TvStat label="Arrivals Today" value={stats.arrivals} className="text-purple-400" />
        <TvStat label="Departures Today" value={stats.departures} className="text-blue-400" />
        <TvStat label="Unregistered Flights" value={stats.unregistered} className="text-amber-400" />
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="grid grid-cols-[1fr_1fr_1.4fr_1fr_auto] gap-4 px-6 py-3 text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
          <span>Airline</span>
          <span>Booking Ref</span>
          <span>Route</span>
          <span>Type</span>
          <span className="text-right">Received</span>
        </div>
        <div className="divide-y divide-slate-800/60 overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {feed.length === 0 && (
            <div className="px-6 py-16 text-center text-slate-500">No flight emails yet.</div>
          )}
          {feed.map((r) => {
            const meta = TYPE_META[r.email_type] || { label: r.email_type || "Unknown", icon: Plane, className: "text-slate-400 border-slate-600 bg-slate-700/20", glowClassName: "bg-slate-500/15" };
            const Icon = meta.icon;
            const isNew = newlySeenIds.has(r.gmail_message_id);
            const legs = r.flights || [];
            return (
              <div
                key={r.gmail_message_id}
                className={cn(
                  "grid grid-cols-[1fr_1fr_1.4fr_1fr_auto] gap-4 px-6 py-3.5 items-center transition-colors duration-700",
                  isNew && [meta.glowClassName, "animate-pulse"]
                )}
              >
                <span className="font-medium truncate">{r.airline || "—"}</span>
                <span className="font-mono text-sm text-slate-300 truncate">{r.booking_ref || "—"}</span>
                <span className="text-sm text-slate-300 truncate">
                  {legs.map((f) => f.route).join(", ") || "—"}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full border text-xs font-semibold", meta.className)}>
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </span>
                <span className="text-right text-sm text-slate-500 whitespace-nowrap">
                  {r.received_date ? formatDistanceToNowStrict(new Date(r.received_date), { addSuffix: true }) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TvStat({ label, value, className }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={cn("text-4xl font-bold tabular-nums", className)}>{value}</div>
    </div>
  );
}
