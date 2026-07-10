import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Plane, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";

export default function FlightEmailUpdates({ emailUpdates }) {
  if (!emailUpdates || emailUpdates.length === 0) return null;

  return (
    <Card className="border-0 shadow-lg border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <Mail className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-lg font-display">Flight Update Notifications</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your airline or travel team has sent the following flight-related updates.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {emailUpdates.map((email, i) => (
          <div key={email.id || i} className="rounded-xl border bg-blue-50/50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="font-semibold text-sm">{email.email_subject}</p>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {email.received_date ? format(new Date(email.received_date), "MMM d, yyyy · h:mm a") : "—"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {email.detected_flight_number && (
                <Badge variant="outline" className="text-xs gap-1 bg-white">
                  <Plane className="w-3 h-3" />
                  Flight {email.detected_flight_number}
                </Badge>
              )}
              {email.detected_pnr && (
                <Badge variant="outline" className="text-xs bg-white">PNR: {email.detected_pnr}</Badge>
              )}
              {email.sender && (
                <Badge variant="outline" className="text-xs bg-white text-muted-foreground">{email.sender}</Badge>
              )}
            </div>

            {email.email_body && (
              <div className="mt-2 p-3 rounded-lg bg-white border text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {email.email_body}
              </div>
            )}

            {(email.detected_passenger_name) && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Passenger:</span> {email.detected_passenger_name}
              </p>
            )}
          </div>
        ))}

        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
          <span>If your flight details have changed, please contact your travel coordinator to confirm your updated schedule.</span>
        </div>
      </CardContent>
    </Card>
  );
}