import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Info } from "lucide-react";

const reminders = [
  "Please arrive at the airport at least 3 hours before your international flight departure.",
  "Make sure your passport is valid for at least 6 months from your travel date.",
  "Print or save a digital copy of your travel voucher and itinerary.",
  "Contact our office immediately if you notice any discrepancies in your booking details.",
];

export default function ImportantReminders() {
  return (
    <Card className="border-0 shadow-lg border-l-4 border-l-orange-400">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Important Reminders
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {reminders.map((r, i) => (
            <div key={i} className="flex items-start gap-3">
              <Info className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">{r}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}