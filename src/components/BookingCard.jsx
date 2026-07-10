import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Plane } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function BookingCard({ booking }) {
  return (
    <Link
      to={`/bookings/${booking.id}`}
      className="block bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1">{booking.flight_number}</div>
          <div className="text-base font-semibold text-foreground">{booking.passenger_name}</div>
        </div>
        <StatusBadge status={booking.booking_status} />
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-foreground">{booking.origin}</span>
        <div className="flex-1 flex items-center gap-1">
          <div className="flex-1 h-px bg-border" />
          <Plane className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="flex-1 h-px bg-border" />
        </div>
        <span className="font-medium text-foreground">{booking.destination}</span>
      </div>
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          {booking.departure_date}
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}