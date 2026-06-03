import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import GradientHeader from "@/components/shared/GradientHeader";
import { format } from "date-fns";

export default function Bookings() {
  const [search, setSearch] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list("-created_date", 200),
  });

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    return (
      !q ||
      b.pnr?.toLowerCase().includes(q) ||
      b.gdx_booking_number?.toLowerCase().includes(q) ||
      b.customer_name?.toLowerCase().includes(q) ||
      b.destination?.toLowerCase().includes(q) ||
      b.ticket_number?.toLowerCase().includes(q)
    );
  });

  const formatDate = (d) => (d ? format(new Date(d), "MMM d, yyyy") : "—");

  return (
    <div className="space-y-6 max-w-7xl">
      <GradientHeader title="Bookings" subtitle="Manage all customer bookings synced from Fusioo via Supabase." />

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-display">All Bookings ({filtered.length})</CardTitle>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by PNR, GDX#, name, destination..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PNR</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">GDX#</TableHead>
                  <TableHead className="hidden md:table-cell">Destination</TableHead>
                  <TableHead className="hidden lg:table-cell">Departure</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBooking(b)}>
                    <TableCell className="font-mono font-semibold text-sm">{b.pnr}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{b.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{b.customer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{b.gdx_booking_number || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{b.destination || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{formatDate(b.departure_date)}</TableCell>
                    <TableCell><StatusBadge status={b.booking_status} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No bookings found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Booking: {selectedBooking.pnr}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <DetailRow label="Customer Name" value={selectedBooking.customer_name} />
                <DetailRow label="Email" value={selectedBooking.customer_email} />
                <DetailRow label="Contact" value={selectedBooking.contact_number} />
                <DetailRow label="GDX Number" value={selectedBooking.gdx_booking_number} />
                <DetailRow label="Ticket #" value={selectedBooking.ticket_number} />
                <DetailRow label="Tour Package" value={selectedBooking.tour_package_name} />
                <DetailRow label="Destination" value={selectedBooking.destination} />
                <DetailRow label="Airline" value={selectedBooking.airline} />
                <DetailRow label="Flight #" value={selectedBooking.flight_number} />
                <DetailRow label="Departure" value={formatDate(selectedBooking.departure_date)} />
                <DetailRow label="Arrival" value={formatDate(selectedBooking.arrival_date)} />
                <DetailRow label="Hotel" value={selectedBooking.hotel_name} />
                <DetailRow label="Check-in" value={formatDate(selectedBooking.hotel_check_in)} />
                <DetailRow label="Check-out" value={formatDate(selectedBooking.hotel_check_out)} />
              </div>
              {selectedBooking.passenger_names?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Passengers</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedBooking.passenger_names.map((n, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-muted text-sm font-medium">{n}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedBooking.internal_notes && (
                <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs font-medium text-amber-700 mb-1">Internal Notes</p>
                  <p className="text-sm text-amber-800">{selectedBooking.internal_notes}</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm mt-0.5">{value || "—"}</p>
    </div>
  );
}