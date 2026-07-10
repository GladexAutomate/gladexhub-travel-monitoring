import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

export default function BookingLookupSettings({ settings, update }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-orange-500" />
          Booking Lookup Settings
        </CardTitle>
        <p className="text-xs text-muted-foreground">Configure the main booking table and lookup fields used for customer searches.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>Main Booking Table</Label>
          <Input value={settings.booking_table || ""} onChange={e => update("booking_table", e.target.value)} className="mt-1 font-mono text-sm" />
        </div>
        <div>
          <Label>Primary Lookup Field</Label>
          <Input value={settings.booking_primary_field || ""} onChange={e => update("booking_primary_field", e.target.value)} className="mt-1 font-mono text-sm" />
          <p className="text-xs text-muted-foreground mt-1">e.g. gdx</p>
        </div>
        <div>
          <Label>Secondary Lookup Field</Label>
          <Input value={settings.booking_secondary_field || ""} onChange={e => update("booking_secondary_field", e.target.value)} className="mt-1 font-mono text-sm" />
          <p className="text-xs text-muted-foreground mt-1">e.g. booking_reference_number_pnr</p>
        </div>
        <div>
          <Label>Third Lookup Field</Label>
          <Input value={settings.booking_third_field || ""} onChange={e => update("booking_third_field", e.target.value)} className="mt-1 font-mono text-sm" />
          <p className="text-xs text-muted-foreground mt-1">e.g. eticket</p>
        </div>
        <div>
          <Label>Customer Verification Field</Label>
          <Input value={settings.booking_verification_field || ""} onChange={e => update("booking_verification_field", e.target.value)} className="mt-1 font-mono text-sm" />
          <p className="text-xs text-muted-foreground mt-1">e.g. customer_last_name</p>
        </div>
      </CardContent>
    </Card>
  );
}