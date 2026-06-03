import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import GradientHeader from "@/components/shared/GradientHeader";
import { format } from "date-fns";

const EVENT_TYPES = [
  { value: "booking_confirmed", label: "Booking Confirmed" },
  { value: "flight_updated", label: "Flight Updated" },
  { value: "hotel_voucher_released", label: "Hotel Voucher Released" },
  { value: "pickup_changed", label: "Pickup Changed" },
  { value: "itinerary_sent", label: "Itinerary Sent" },
  { value: "airline_advisory", label: "Airline Advisory" },
  { value: "schedule_changed", label: "Schedule Changed" },
  { value: "cancellation", label: "Cancellation" },
  { value: "general_update", label: "General Update" },
];

const defaultForm = {
  booking_id: "",
  event_type: "general_update",
  title: "",
  description: "",
  event_date: new Date().toISOString().slice(0, 16),
  is_customer_visible: true,
  is_published: false,
};

export default function TimelineManager() {
  const [search, setSearch] = useState("");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ["timeline-events"],
    queryFn: () => base44.entities.TimelineEvent.list("-event_date", 200),
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TimelineEvent.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline-events"] });
      setShowForm(false);
      setForm(defaultForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TimelineEvent.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline-events"] });
      setShowForm(false);
      setEditingEvent(null);
      setForm(defaultForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TimelineEvent.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timeline-events"] }),
  });

  const filtered = events.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || e.title?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q);
    const matchesBooking = bookingFilter === "all" || e.booking_id === bookingFilter;
    return matchesSearch && matchesBooking;
  });

  const getBookingLabel = (id) => {
    const b = bookings.find((b) => b.id === id);
    return b ? `${b.pnr} - ${b.customer_name}` : id;
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setForm({
      booking_id: event.booking_id || "",
      event_type: event.event_type || "general_update",
      title: event.title || "",
      description: event.description || "",
      event_date: event.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : "",
      is_customer_visible: event.is_customer_visible ?? true,
      is_published: event.is_published ?? false,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    const data = { ...form, event_date: new Date(form.event_date).toISOString() };
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const togglePublish = (event) => {
    updateMutation.mutate({ id: event.id, data: { is_published: !event.is_published } });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <GradientHeader title="Timeline Manager" subtitle="Create and manage travel timeline updates for customer bookings." />

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-display">Timeline Events ({filtered.length})</CardTitle>
            <div className="flex gap-3 flex-wrap">
              <Select value={bookingFilter} onValueChange={setBookingFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filter by booking" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bookings</SelectItem>
                  {bookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.pnr} - {b.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full md:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Button onClick={() => { setEditingEvent(null); setForm(defaultForm); setShowForm(true); }} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white gap-2">
                <Plus className="w-4 h-4" /> Add Event
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filtered.map((e) => (
              <div key={e.id} className="flex items-start justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{e.title}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      {EVENT_TYPES.find((t) => t.value === e.event_type)?.label || e.event_type}
                    </span>
                    {e.is_published ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Published</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Draft</span>
                    )}
                    {!e.is_customer_visible && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Internal Only</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{getBookingLabel(e.booking_id)} · {e.event_date ? format(new Date(e.event_date), "MMM d, yyyy h:mm a") : "—"}</p>
                  {e.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => togglePublish(e)} title={e.is_published ? "Unpublish" : "Publish"}>
                    {e.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(e)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(e.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No timeline events found.</p>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editingEvent ? "Edit Event" : "Add Timeline Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Booking</Label>
              <Select value={form.booking_id} onValueChange={(v) => setForm({ ...form, booking_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select booking..." /></SelectTrigger>
                <SelectContent>
                  {bookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.pnr} - {b.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Event details..." />
            </div>
            <div className="space-y-2">
              <Label>Date & Time</Label>
              <Input type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Customer Visible</Label>
              <Switch checked={form.is_customer_visible} onCheckedChange={(v) => setForm({ ...form, is_customer_visible: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Published</Label>
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} className="bg-orange-500 hover:bg-orange-600 text-white" disabled={!form.booking_id || !form.title}>
              {editingEvent ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}