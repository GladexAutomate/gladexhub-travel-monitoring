import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Calendar, Users, Plane, Hash, Ticket } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { format } from "date-fns";

export default function BookingSummaryCard({ booking }) {
  const formatDate = (d) => {
    if (!d) return "—";
    return format(new Date(d), "MMM d, yyyy");
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-400" />
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-display">{booking.tour_package_name || "Tour Package"}</CardTitle>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground text-sm">
              <MapPin className="w-4 h-4" />
              {booking.destination || "—"}
            </div>
          </div>
          <StatusBadge status={booking.booking_status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InfoItem icon={Hash} label="PNR" value={booking.pnr} />
          <InfoItem icon={Ticket} label="GDX Number" value={booking.gdx_booking_number} />
          <InfoItem icon={Ticket} label="Ticket #" value={booking.ticket_number} />
          <InfoItem icon={Calendar} label="Departure" value={formatDate(booking.departure_date)} />
          <InfoItem icon={Calendar} label="Arrival" value={formatDate(booking.arrival_date)} />
          <InfoItem icon={Users} label="Passengers" value={booking.passenger_names?.length || 0} />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
      <div className="p-2 rounded-lg bg-orange-50">
        <Icon className="w-4 h-4 text-orange-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-sm mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );
}