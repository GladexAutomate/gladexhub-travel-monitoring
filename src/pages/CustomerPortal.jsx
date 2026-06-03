import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Globe, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import BookingSearch from "@/components/customer/BookingSearch";
import BookingSummaryCard from "@/components/customer/BookingSummaryCard";
import PassengerList from "@/components/customer/PassengerList";
import FlightDetailsCard from "@/components/customer/FlightDetailsCard";
import HotelDetailsCard from "@/components/customer/HotelDetailsCard";
import TravelTimeline from "@/components/customer/TravelTimeline";
import VoucherLinks from "@/components/customer/VoucherLinks";
import ImportantReminders from "@/components/customer/ImportantReminders";
import FlightEmailUpdates from "@/components/customer/FlightEmailUpdates";

export default function CustomerPortal() {
  const [booking, setBooking] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [emailUpdates, setEmailUpdates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (params) => {
    setIsLoading(true);
    setError(null);
    setBooking(null);
    setTimelineEvents([]);
    setEmailUpdates([]);
    setSearched(true);

    let filter = {};
    if (params.type === "pnr") filter = { pnr: params.pnr };
    else if (params.type === "gdx") filter = { gdx_booking_number: params.gdx_booking_number };
    else if (params.type === "ticket") filter = { ticket_number: params.ticket_number };
    else if (params.type === "email") filter = { customer_email: params.customer_email };

    const results = await base44.entities.Booking.filter(filter);

    if (params.type === "email" && params.last_name) {
      const matched = results.find(b =>
        b.customer_name?.toLowerCase()?.includes(params.last_name.toLowerCase())
      );
      if (matched) {
        setBooking(matched);
        const [events, emails] = await Promise.all([
          base44.entities.TimelineEvent.filter({ booking_id: matched.id, is_customer_visible: true, is_published: true }),
          base44.entities.EmailUpdate.filter({ linked_booking_id: matched.id, is_customer_visible: true }),
        ]);
        setTimelineEvents(events);
        setEmailUpdates(emails);
      } else {
        setError("No booking found matching your details. Please check and try again.");
      }
    } else if (results.length > 0) {
      setBooking(results[0]);
      const [events, emails] = await Promise.all([
        base44.entities.TimelineEvent.filter({ booking_id: results[0].id, is_customer_visible: true, is_published: true }),
        base44.entities.EmailUpdate.filter({ linked_booking_id: results[0].id, is_customer_visible: true }),
      ]);
      setTimelineEvents(events);
      setEmailUpdates(emails);
    } else {
      setError("No booking found matching your details. Please check and try again.");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/50 to-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-orange-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gradient-to-br from-orange-500 to-amber-400 rounded-lg">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-base leading-none">GladexHub</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Gladex Travel and Tours Corp.</p>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {!booking ? (
          <>
            {/* Hero */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 p-8 md:p-14 text-white text-center">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
              <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
              <div className="relative z-10">
                <h1 className="text-3xl md:text-4xl font-display font-bold">Track Your Travel</h1>
                <p className="mt-3 text-white/80 max-w-lg mx-auto">View your booking details, flight information, travel updates, and important reminders all in one place.</p>
              </div>
            </div>

            <BookingSearch onSearch={handleSearch} isLoading={isLoading} />

            {searched && error && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{error}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => { setBooking(null); setSearched(false); setError(null); setEmailUpdates([]); }}>
              <ArrowLeft className="w-4 h-4" />
              Back to Search
            </Button>

            <BookingSummaryCard booking={booking} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PassengerList passengers={booking.passenger_names} />
              <FlightDetailsCard booking={booking} />
            </div>

            <FlightEmailUpdates emailUpdates={emailUpdates} />
            <HotelDetailsCard booking={booking} />
            <VoucherLinks booking={booking} />
            <TravelTimeline events={timelineEvents} />
            <ImportantReminders />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-orange-100 mt-16">
        <div className="max-w-5xl mx-auto px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Gladex Travel and Tours Corp. All rights reserved.</p>
          <p className="text-xs text-muted-foreground mt-1">For inquiries, contact us at support@gladextravel.com</p>
        </div>
      </footer>
    </div>
  );
}