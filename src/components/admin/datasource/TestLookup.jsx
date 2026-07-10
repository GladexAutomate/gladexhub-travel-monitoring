import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { FlaskConical, Search, CheckCircle, XCircle } from "lucide-react";

export default function TestLookup() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleTest = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setSearched(false);
    const q = query.trim();

    const [byPnr, byGdx, byTicket, byEmail] = await Promise.all([
      base44.entities.Booking.filter({ pnr: q }),
      base44.entities.Booking.filter({ gdx_booking_number: q }),
      base44.entities.Booking.filter({ ticket_number: q }),
      base44.entities.Booking.filter({ customer_email: q }),
    ]);

    const found = byPnr?.[0] || byGdx?.[0] || byTicket?.[0] || byEmail?.[0] || null;
    setResult(found);
    setSearched(true);
    setLoading(false);
  };

  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-orange-500" />
          Test Lookup
        </CardTitle>
        <p className="text-xs text-muted-foreground">Enter a GDX number, PNR, E-ticket, or email to preview the matched booking.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>GDX / PNR / E-ticket / Email</Label>
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTest()}
              placeholder="e.g. ABC123, GDX-2025-0001, or email@example.com"
              className="mt-1 bg-white"
            />
          </div>
          <Button onClick={handleTest} disabled={loading || !query.trim()}>
            <Search className="w-4 h-4 mr-1" />
            {loading ? "Searching…" : "Test"}
          </Button>
        </div>

        {searched && (
          <div className="rounded-xl border bg-white p-4">
            {result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Booking Found
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{result.customer_name || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">PNR</p><p className="font-mono font-medium">{result.pnr || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">GDX #</p><p className="font-mono font-medium">{result.gdx_booking_number || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Ticket #</p><p className="font-mono font-medium">{result.ticket_number || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Destination</p><p className="font-medium">{result.destination || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Departure</p><p className="font-medium">{result.departure_date || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Airline</p><p className="font-medium">{result.airline || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Flight</p><p className="font-mono font-medium">{result.flight_number || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className="text-xs mt-0.5">{result.booking_status || "—"}</Badge></div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                <XCircle className="w-4 h-4" />
                No matching booking found for "{query}"
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}