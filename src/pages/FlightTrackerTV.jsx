import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/hooks/useAuth";
import { Plane, CheckCircle2, RotateCcw, XCircle, AlertTriangle, Volume2 } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

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
  confirmation: { label: "Confirmation", icon: CheckCircle2, className: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  reschedule: { label: "Reschedule", icon: RotateCcw, className: "text-orange-400 border-orange-500/40 bg-orange-500/10" },
  cancellation: { label: "Cancellation", icon: XCircle, className: "text-red-400 border-red-500/40 bg-red-500/10" },
  needs_attention: { label: "Needs Attention", icon: AlertTriangle, className: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
};

// Rows worth an audible alert when they're brand new — a fresh confirmation
// isn't urgent (it's just a normal new booking), a fresh reschedule/
// cancellation/needs_attention is exactly what this screen exists to surface.
const ALERT_TYPES = new Set(["reschedule", "cancellation", "needs_attention"]);

function beep(times = 1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.32);
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
        const response = await base44.functions.invoke("querySupabase", {
          project: "automate",
          table: "flight_emails",
          operation: "selectAllOrdered",
          orderBy: "received_date",
          ascending: false,
          requesterEmail: user?.email,
        });
        return response.data.rows || [];
      } catch (err) {
        throw invokeError(err);
      }
    },
    refetchInterval: REFRESH_MS,
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
      const hasAlertWorthy = records.some(
        (r) => freshIds.includes(r.gmail_message_id) && ALERT_TYPES.has(r.email_type)
      );
      if (hasAlertWorthy && soundEnabled) beep(2);

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

  const stats = useMemo(
    () => ({
      total: records.length,
      confirmation: records.filter((r) => r.email_type === "confirmation").length,
      reschedule: records.filter((r) => r.email_type === "reschedule").length,
      cancellation: records.filter((r) => r.email_type === "cancellation").length,
      needs_attention: records.filter((r) => r.email_type === "needs_attention").length,
    }),
    [records]
  );

  // One tap does both — sound and fullscreen both require a real user
  // gesture before a browser will allow them, so this is the single moment
  // available to ask for either. requestFullscreen can reject (some
  // browsers/embedded WebViews don't support it, or it's already
  // fullscreen) — that's fine, sound still gets enabled either way.
  const startDisplay = () => {
    beep(1);
    localStorage.setItem(SOUND_ENABLED_KEY, "true");
    setSoundEnabled(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-100 p-8 flex flex-col gap-6">
      {!soundEnabled && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <button
            onClick={startDisplay}
            className="flex flex-col items-center gap-3 px-10 py-8 rounded-2xl bg-orange-600 hover:bg-orange-500 transition-colors text-white"
          >
            <Volume2 className="w-10 h-10" />
            <span className="text-xl font-bold">Tap once to start the display</span>
            <span className="text-sm text-orange-100">Enables sound alerts and full-screen — browsers require a tap before allowing either.</span>
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

      <div className="grid grid-cols-5 gap-4">
        <TvStat label="Total" value={stats.total} className="text-slate-100" />
        <TvStat label="Confirmations" value={stats.confirmation} className="text-emerald-400" />
        <TvStat label="Reschedules" value={stats.reschedule} className="text-orange-400" />
        <TvStat label="Cancellations" value={stats.cancellation} className="text-red-400" />
        <TvStat label="Needs Attention" value={stats.needs_attention} className="text-amber-400" />
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
            const meta = TYPE_META[r.email_type] || { label: r.email_type || "Unknown", icon: Plane, className: "text-slate-400 border-slate-600 bg-slate-700/20" };
            const Icon = meta.icon;
            const isNew = newlySeenIds.has(r.gmail_message_id);
            const legs = r.flights || [];
            return (
              <div
                key={r.gmail_message_id}
                className={cn(
                  "grid grid-cols-[1fr_1fr_1.4fr_1fr_auto] gap-4 px-6 py-3.5 items-center transition-colors duration-700",
                  isNew && "bg-orange-500/15 animate-pulse"
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
