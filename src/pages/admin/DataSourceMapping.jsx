import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Save, Database } from "lucide-react";
import { toast } from "sonner";
import BookingLookupSettings from "@/components/admin/datasource/BookingLookupSettings";
import TableMappingCard from "@/components/admin/datasource/TableMappingCard";
import RelationshipSettings from "@/components/admin/datasource/RelationshipSettings";
import EmailPrioritySettings from "@/components/admin/datasource/EmailPrioritySettings";
import VisibilitySettings from "@/components/admin/datasource/VisibilitySettings";
import TestLookup from "@/components/admin/datasource/TestLookup";

const DEFAULTS = {
  booking_table: "bookings_6fbdd6b2",
  booking_primary_field: "gdx",
  booking_secondary_field: "booking_reference_number_pnr",
  booking_third_field: "eticket",
  booking_verification_field: "customer_last_name",
  ticket_table: "ticket_details_b1d64ca0",
  ticket_pnr_column: "booking_reference_number_pnr",
  ticket_eticket_column: "eticket",
  ticket_last_name_column: "customer_last_name",
  hotel_table: "hotel_details_a2f30717",
  hotel_stay_from_column: "stay_date_from",
  hotel_stay_to_column: "stay_date_to",
  hotel_name_column: "other_hotel",
  hotel_room_type_column: "room_type",
  hotel_requests_column: "hotel_requests",
  tour_table: "tour_details_2bf757ca",
  tour_name_column: "tour_name",
  tour_date_column: "tour_date",
  tour_supplier_column: "tour_supplier",
  tour_requests_column: "tour_requests",
  transfer_table: "transfer_details_b9a92c90",
  transfer_type_column: "transfer_type",
  transfer_supplier_column: "supplier_name",
  transfer_arrival_date_column: "transfer_date_arrival",
  transfer_departure_date_column: "transfer_date_departure",
  relationship_key: "gdx",
  email_priority_1: "PNR",
  email_priority_2: "E-ticket",
  email_priority_3: "GDX",
  email_priority_4: "Customer Last Name + Travel Date",
  visibility_booking_summary: true,
  visibility_flight_details: true,
  visibility_hotel_details: true,
  visibility_tour_details: true,
  visibility_transfer_details: true,
  visibility_documents: true,
  visibility_timeline: true,
};

const TICKET_FIELDS = [
  { key: "ticket_table", label: "Table Name", hint: "e.g. ticket_details_b1d64ca0" },
  { key: "ticket_pnr_column", label: "PNR Column", hint: "e.g. booking_reference_number_pnr" },
  { key: "ticket_eticket_column", label: "E-ticket Column", hint: "e.g. eticket" },
  { key: "ticket_last_name_column", label: "Last Name Column", hint: "e.g. customer_last_name" },
];
const HOTEL_FIELDS = [
  { key: "hotel_table", label: "Table Name", hint: "e.g. hotel_details_a2f30717" },
  { key: "hotel_stay_from_column", label: "Stay From Column", hint: "e.g. stay_date_from" },
  { key: "hotel_stay_to_column", label: "Stay To Column", hint: "e.g. stay_date_to" },
  { key: "hotel_name_column", label: "Hotel Name Column", hint: "e.g. other_hotel" },
  { key: "hotel_room_type_column", label: "Room Type Column", hint: "e.g. room_type" },
  { key: "hotel_requests_column", label: "Hotel Requests Column", hint: "e.g. hotel_requests" },
];
const TOUR_FIELDS = [
  { key: "tour_table", label: "Table Name", hint: "e.g. tour_details_2bf757ca" },
  { key: "tour_name_column", label: "Tour Name Column", hint: "e.g. tour_name" },
  { key: "tour_date_column", label: "Tour Date Column", hint: "e.g. tour_date" },
  { key: "tour_supplier_column", label: "Supplier Column", hint: "e.g. tour_supplier" },
  { key: "tour_requests_column", label: "Requests Column", hint: "e.g. tour_requests" },
];
const TRANSFER_FIELDS = [
  { key: "transfer_table", label: "Table Name", hint: "e.g. transfer_details_b9a92c90" },
  { key: "transfer_type_column", label: "Transfer Type Column", hint: "e.g. transfer_type" },
  { key: "transfer_supplier_column", label: "Supplier Column", hint: "e.g. supplier_name" },
  { key: "transfer_arrival_date_column", label: "Arrival Date Column", hint: "e.g. transfer_date_arrival" },
  { key: "transfer_departure_date_column", label: "Departure Date Column", hint: "e.g. transfer_date_departure" },
];

export default function DataSourceMapping() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(DEFAULTS);
  const [recordId, setRecordId] = useState(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["dataSourceMapping"],
    queryFn: () => base44.entities.DataSourceMapping.list(),
  });

  useEffect(() => {
    if (existing?.length > 0) {
      setSettings({ ...DEFAULTS, ...existing[0] });
      setRecordId(existing[0].id);
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (recordId) {
        return base44.entities.DataSourceMapping.update(recordId, data);
      } else {
        return base44.entities.DataSourceMapping.create(data);
      }
    },
    onSuccess: (res) => {
      if (!recordId && res?.id) setRecordId(res.id);
      queryClient.invalidateQueries({ queryKey: ["dataSourceMapping"] });
      toast.success("Data source mapping saved.");
    },
  });

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-400 rounded-lg">
              <Database className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold">Data Source Mapping</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-12">Configure which Supabase tables and columns are used for each customer portal section.</p>
        </div>
        <Button onClick={() => mutation.mutate(settings)} disabled={mutation.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {mutation.isPending ? "Saving…" : "Save All Settings"}
        </Button>
      </div>

      <BookingLookupSettings settings={settings} update={update} />

      <TableMappingCard title="Ticket / Flight Mapping" fields={TICKET_FIELDS} settings={settings} update={update} />
      <TableMappingCard title="Hotel Mapping" fields={HOTEL_FIELDS} settings={settings} update={update} />
      <TableMappingCard title="Tour Mapping" fields={TOUR_FIELDS} settings={settings} update={update} />
      <TableMappingCard title="Transfer Mapping" fields={TRANSFER_FIELDS} settings={settings} update={update} />

      <RelationshipSettings settings={settings} update={update} />
      <EmailPrioritySettings settings={settings} update={update} />
      <VisibilitySettings settings={settings} update={update} />

      <TestLookup />
    </div>
  );
}