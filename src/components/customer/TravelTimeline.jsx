import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, Plane, Building2, MapPin, FileText, AlertTriangle, RefreshCw, Bell } from "lucide-react";
import { format } from "date-fns";

const eventIcons = {
  booking_confirmed: CheckCircle,
  flight_updated: Plane,
  hotel_voucher_released: Building2,
  pickup_changed: MapPin,
  itinerary_sent: FileText,
  airline_advisory: AlertTriangle,
  schedule_changed: RefreshCw,
  cancellation: AlertTriangle,
  general_update: Bell,
};

const eventColors = {
  booking_confirmed: "bg-emerald-500",
  flight_updated: "bg-blue-500",
  hotel_voucher_released: "bg-purple-500",
  pickup_changed: "bg-amber-500",
  itinerary_sent: "bg-teal-500",
  airline_advisory: "bg-red-500",
  schedule_changed: "bg-orange-500",
  cancellation: "bg-red-600",
  general_update: "bg-slate-500",
};

export default function TravelTimeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Travel Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-8">No timeline updates yet.</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...events].sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-500" />
          Travel Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-orange-300 via-orange-200 to-transparent" />
          <div className="space-y-6">
            {sorted.map((event, i) => {
              const Icon = eventIcons[event.event_type] || Bell;
              const color = eventColors[event.event_type] || "bg-slate-500";
              return (
                <div key={event.id || i} className="relative pl-10">
                  <div className={`absolute left-2 top-1 w-5 h-5 rounded-full ${color} flex items-center justify-center ring-4 ring-background`}>
                    <Icon className="w-3 h-3 text-white" />
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm">{event.title}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {event.event_date ? format(new Date(event.event_date), "MMM d, h:mm a") : "—"}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}