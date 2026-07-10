import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function HotelDetailsCard({ booking }) {
  if (!booking.hotel_name) return null;

  const formatDate = (d) => d ? format(new Date(d), "MMM d, yyyy") : "—";

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Building2 className="w-5 h-5 text-orange-500" />
          Hotel Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-4 rounded-xl bg-muted/50">
          <p className="font-bold text-lg">{booking.hotel_name}</p>
          <div className="flex gap-6 mt-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Check-in</p>
                <p className="text-sm font-semibold">{formatDate(booking.hotel_check_in)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Check-out</p>
                <p className="text-sm font-semibold">{formatDate(booking.hotel_check_out)}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}