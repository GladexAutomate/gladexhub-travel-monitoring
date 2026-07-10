import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Plane, Mail, Link2, Unlink, HelpCircle, AlertTriangle } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import GradientHeader from "@/components/shared/GradientHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import MatchStatusBadge from "@/components/shared/MatchStatusBadge";
import { format } from "date-fns";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list("-created_date", 100),
  });

  const { data: emails = [] } = useQuery({
    queryKey: ["emails"],
    queryFn: () => base44.entities.EmailUpdate.list("-created_date", 100),
  });

  const now = new Date();
  const upcoming = bookings.filter(b => b.departure_date && new Date(b.departure_date) > now);
  const matchedEmails = emails.filter(e => e.match_status === "matched");
  const unmatchedEmails = emails.filter(e => e.match_status === "unmatched");
  const possibleMatches = emails.filter(e => e.match_status === "possible_match");
  const recentChanges = bookings.filter(b => ["flight_changed", "schedule_updated"].includes(b.booking_status));

  return (
    <div className="space-y-6 max-w-7xl">
      <GradientHeader title="Admin Dashboard" subtitle="Monitor bookings, email updates, and travel changes at a glance." />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard title="Total Bookings" value={bookings.length} icon={Briefcase} color="orange" />
        <StatCard title="Upcoming" value={upcoming.length} icon={Plane} color="blue" />
        <StatCard title="Flight Changes" value={recentChanges.length} icon={AlertTriangle} color="amber" />
        <StatCard title="Matched" value={matchedEmails.length} icon={Link2} color="green" />
        <StatCard title="Unmatched" value={unmatchedEmails.length} icon={Unlink} color="red" />
        <StatCard title="Possible" value={possibleMatches.length} icon={HelpCircle} color="purple" />
        <StatCard title="Total Emails" value={emails.length} icon={Mail} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-display">Recent Bookings</CardTitle>
              <Link to="/admin/bookings" className="text-xs text-orange-500 font-medium hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bookings.slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                  <div>
                    <p className="font-semibold text-sm">{b.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{b.pnr} · {b.destination || "—"}</p>
                  </div>
                  <StatusBadge status={b.booking_status} />
                </div>
              ))}
              {bookings.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No bookings yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-display">Recent Email Updates</CardTitle>
              <Link to="/admin/emails" className="text-xs text-orange-500 font-medium hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {emails.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-semibold text-sm truncate">{e.email_subject}</p>
                    <p className="text-xs text-muted-foreground">{e.sender} · {e.received_date ? format(new Date(e.received_date), "MMM d") : "—"}</p>
                  </div>
                  <MatchStatusBadge status={e.match_status} />
                </div>
              ))}
              {emails.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No emails yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}