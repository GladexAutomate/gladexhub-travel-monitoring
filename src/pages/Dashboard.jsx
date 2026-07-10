import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, CheckCircle, AlertTriangle, XCircle, Plus, Plane } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import StatCard from '@/components/StatCard';
import BookingCard from '@/components/BookingCard';

export default function Dashboard() {
  const { data: user } = useCurrentUser();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        let result;
        const role = user.role || 'traveler';
        if (role === 'admin') {
          result = await base44.entities.Booking.list('-created_date', 100);
        } else if (role === 'agent') {
          result = await base44.entities.Booking.filter({ created_by_id: user.id }, '-created_date', 100);
        } else {
          result = await base44.entities.Booking.filter({ passenger_email: user.email }, '-created_date', 100);
        }
        setBookings(result || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter(b => b.booking_status === 'Confirmed').length,
    delayed: bookings.filter(b => b.booking_status === 'Delayed').length,
    cancelled: bookings.filter(b => b.booking_status === 'Cancelled').length,
  };

  const role = user?.role || 'traveler';
  const canCreate = role === 'admin' || role === 'agent';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {user?.full_name || user?.email || 'Traveler'}
          </p>
        </div>
        {canCreate && (
          <Link
            to="/bookings/new"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Booking
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Bookings" value={stats.total} icon={Ticket} accent="bg-primary/10 text-primary" />
        <StatCard label="Confirmed" value={stats.confirmed} icon={CheckCircle} accent="bg-emerald-500/10 text-emerald-400" />
        <StatCard label="Delayed" value={stats.delayed} icon={AlertTriangle} accent="bg-amber-500/10 text-amber-400" />
        <StatCard label="Cancelled" value={stats.cancelled} icon={XCircle} accent="bg-red-500/10 text-red-400" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Recent Bookings</h2>
          <Link to="/bookings" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {bookings.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <Plane className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No bookings yet</p>
            {canCreate && (
              <Link to="/bookings/new" className="text-sm text-primary hover:underline mt-2 inline-block">
                Create your first booking
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {bookings.slice(0, 6).map(booking => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}