import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye } from "lucide-react";

const SECTIONS = [
  { key: "visibility_booking_summary", label: "Booking Summary" },
  { key: "visibility_flight_details", label: "Ticket / Flight Details" },
  { key: "visibility_hotel_details", label: "Hotel Details" },
  { key: "visibility_tour_details", label: "Tour Details" },
  { key: "visibility_transfer_details", label: "Transfer Details" },
  { key: "visibility_documents", label: "Documents" },
  { key: "visibility_timeline", label: "Travel Timeline" },
];

export default function VisibilitySettings({ settings, update }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="w-4 h-4 text-orange-500" />
          Customer Visibility Settings
        </CardTitle>
        <p className="text-xs text-muted-foreground">Choose which sections are visible to customers on the portal.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {SECTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <Label htmlFor={key} className="cursor-pointer font-normal">{label}</Label>
            <Switch
              id={key}
              checked={settings[key] !== false}
              onCheckedChange={v => update(key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}