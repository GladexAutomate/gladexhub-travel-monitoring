import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Eye, Link2 } from "lucide-react";
import MatchStatusBadge from "@/components/shared/MatchStatusBadge";
import GradientHeader from "@/components/shared/GradientHeader";
import { format } from "date-fns";

export default function EmailUpdates() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [linkBookingId, setLinkBookingId] = useState("");
  const queryClient = useQueryClient();

  const { data: emails = [] } = useQuery({
    queryKey: ["emails"],
    queryFn: () => base44.entities.EmailUpdate.list("-created_date", 200),
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list("-created_date", 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmailUpdate.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["emails"] }),
  });

  const filtered = emails.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || e.email_subject?.toLowerCase().includes(q) || e.sender?.toLowerCase().includes(q) || e.detected_pnr?.toLowerCase().includes(q);
    const matchesStatus = filterStatus === "all" || e.match_status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleManualLink = () => {
    if (!selectedEmail || !linkBookingId) return;
    updateMutation.mutate({
      id: selectedEmail.id,
      data: { linked_booking_id: linkBookingId, match_status: "matched" },
    });
    setSelectedEmail({ ...selectedEmail, linked_booking_id: linkBookingId, match_status: "matched" });
    setLinkBookingId("");
  };

  const handleVisibilityToggle = (email) => {
    updateMutation.mutate({
      id: email.id,
      data: { is_customer_visible: !email.is_customer_visible },
    });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <GradientHeader title="Email Updates" subtitle="Manage travel update emails and match them to bookings." />

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-display">All Emails ({filtered.length})</CardTitle>
            <div className="flex gap-3">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="possible_match">Possible Match</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search emails..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden md:table-cell">Sender</TableHead>
                  <TableHead className="hidden lg:table-cell">Detected PNR</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="hidden md:table-cell">Visible</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEmail(e)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[200px]">{e.email_subject}</p>
                        <p className="text-xs text-muted-foreground">{e.received_date ? format(new Date(e.received_date), "MMM d, yyyy") : "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{e.sender}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm font-mono">{e.detected_pnr || "—"}</TableCell>
                    <TableCell><MatchStatusBadge status={e.match_status} /></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Switch checked={e.is_customer_visible} onCheckedChange={() => handleVisibilityToggle(e)} onClick={(ev) => ev.stopPropagation()} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); setSelectedEmail(e); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No emails found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          {selectedEmail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{selectedEmail.email_subject}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <DetailRow label="Sender" value={selectedEmail.sender} />
                <DetailRow label="Received" value={selectedEmail.received_date ? format(new Date(selectedEmail.received_date), "MMM d, yyyy h:mm a") : "—"} />
                <DetailRow label="Detected PNR" value={selectedEmail.detected_pnr} />
                <DetailRow label="Detected Ticket #" value={selectedEmail.detected_ticket_number} />
                <DetailRow label="Detected Flight #" value={selectedEmail.detected_flight_number} />
                <DetailRow label="Detected Passenger" value={selectedEmail.detected_passenger_name} />
              </div>
              {selectedEmail.email_body && (
                <div className="mt-4 p-4 rounded-xl bg-muted/50 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
                  {selectedEmail.email_body}
                </div>
              )}

              <div className="mt-4 p-4 rounded-xl border border-orange-200 bg-orange-50">
                <p className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
                  <Link2 className="w-4 h-4" /> Manual Booking Link
                </p>
                <div className="flex gap-2">
                  <Select value={linkBookingId} onValueChange={setLinkBookingId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a booking..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bookings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.pnr} - {b.customer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleManualLink} className="bg-orange-500 hover:bg-orange-600 text-white">Link</Button>
                </div>
                {selectedEmail.linked_booking_id && (
                  <p className="text-xs text-emerald-700 mt-2">Currently linked to booking: {bookings.find(b => b.id === selectedEmail.linked_booking_id)?.pnr || selectedEmail.linked_booking_id}</p>
                )}
              </div>
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