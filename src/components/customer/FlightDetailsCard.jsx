import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plane, ArrowRight, Users } from "lucide-react";
import { format } from "date-fns";

export default function FlightDetailsCard({ booking }) {
  const formatDate = (d) => d ? format(new Date(d), "MMM d, yyyy") : "—";
  const leadPassenger = booking.passenger_names?.[0] || booking.customer_name || "—";

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Plane className="w-5 h-5 text-orange-500" />
          Flight Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <div>
            <p className="text-xs text-amber-600 font-medium">Lead Passenger</p>
            <p className="text-sm font-semibold text-amber-900">{leadPassenger}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Outbound Flight</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Airline & Flight</p>
              <p className="font-bold text-sm">{booking.airline || "—"}</p>
              <p className="text-xs text-muted-foreground">{booking.flight_number || "—"}</p>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-orange-400" />
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Destination & Time</p>
              <p className="font-semibold text-sm">{booking.destination || "—"}</p>
              <p className="text-xs text-muted-foreground">{booking.departure_time ? `${booking.departure_time} - ${booking.arrival_time || "—"}` : formatDate(booking.departure_date)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-orange-200">
            <div>
              <p className="text-xs text-muted-foreground">Departure</p>
              <p className="font-semibold text-sm">{formatDate(booking.departure_date)} {booking.departure_time && `@ ${booking.departure_time}`}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Arrival</p>
              <p className="font-semibold text-sm">{formatDate(booking.arrival_date)} {booking.arrival_time && `@ ${booking.arrival_time}`}</p>
            </div>
          </div>
        </div>

        {booking.return_flight_number && (
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Return Flight</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Airline & Flight</p>
                <p className="font-bold text-sm">{booking.airline || "—"}</p>
                <p className="text-xs text-muted-foreground">{booking.return_flight_number}</p>
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-180" />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Return Destination</p>
                <p className="font-semibold text-sm">Home</p>
                <p className="text-xs text-muted-foreground">{booking.return_departure_time ? `${booking.return_departure_time} - ${booking.return_arrival_time || "—"}` : formatDate(booking.return_date)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Departure</p>
                <p className="font-semibold text-sm">{formatDate(booking.return_date)} {booking.return_departure_time && `@ ${booking.return_departure_time}`}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Arrival</p>
                <p className="font-semibold text-sm">{booking.return_arrival_time && `@ ${booking.return_arrival_time}`}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}