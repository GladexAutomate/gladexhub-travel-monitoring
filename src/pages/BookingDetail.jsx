import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plane, Pencil, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import StatusBadge from '@/components/StatusBadge';

const statusOptions = ['Confirmed', 'Delayed', 'Cancelled', 'Completed'];

export default function BookingDetail() {
  const { id } = useParams();
  const { data: user } = useCurrentUser();
  const [booking, setBooking] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const b = await base44.entities.Booking.get(id);
        setBooking(b);
        setNewStatus(b.booking_status);
        const u = await base44.entities.StatusUpdate.filter({ booking_id: id }, '-created_date', 50);
        setUpdates(u || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Booking not found.{' '}
        <Link to="/bookings" className="text-primary hover:underline">Back to bookings</Link>
      </div>
    );
  }

  const role = user?.role || 'traveler';
  const canEdit = role === 'admin' || (role === 'agent' && booking.created_by_id === user?.id);

  const handleStatusUpdate = async () => {
    if (newStatus === booking.booking_status && !statusNote) return;
    setUpdating(true);
    try {
      await base44.entities.StatusUpdate.create({
        booking_id: id,
        previous_status: booking.booking_status,
        new_status: newStatus,
        note: statusNote,
        updated_by_name: user?.full_name || user?.email || 'Staff',
      });
      const updated = await base44.entities.Booking.update(id, {
        booking_status: newStatus,
        status_notes: statusNote || booking.status_notes,
      });
      setBooking(updated);
      setStatusNote('');
      const u = await base44.entities.StatusUpdate.filter({ booking_id: id }, '-created_date', 50);
      setUpdates(u || []);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <Link
        to="/bookings"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bookings
      </Link>

      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{booking.passenger_name}</h1>
            <StatusBadge status={booking.booking_status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {booking.airline ? `${booking.airline} · ` : ''}{booking.flight_number}
          </p>
        </div>
        {canEdit && (
          <Link
            to={`/bookings/${id}/edit`}
            className="inline-flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border border-border"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Flight Details</h2>
            <div className="flex items-center justify-between mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{booking.origin}</div>
                <div className="text-xs text-muted-foreground mt-1">Origin</div>
              </div>
              <div className="flex-1 flex items-center px-8">
                <div className="flex-1 h-px bg-border" />
                <Plane className="w-5 h-5 text-muted-foreground mx-3" />
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{booking.destination}</div>
                <div className="text-xs text-muted-foreground mt-1">Destination</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Departure</div>
                <div className="text-sm font-medium text-foreground">{booking.departure_date || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Return</div>
                <div className="text-sm font-medium text-foreground">{booking.return_date || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Seat</div>
                <div className="text-sm font-medium text-foreground">{booking.seat_info || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Gate</div>
                <div className="text-sm font-medium text-foreground">{booking.gate || '—'}</div>
              </div>
            </div>
          </div>

          {booking.status_notes && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Latest Notes</h2>
              <p className="text-sm text-foreground">{booking.status_notes}</p>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Status History</h2>
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No status updates yet</p>
            ) : (
              <div className="space-y-0">
                {updates.map((update, idx) => (
                  <div key={update.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                      {idx < updates.length - 1 && <div className="w-px flex-1 bg-border min-h-[40px]" />}
                    </div>
                    <div className="pb-6">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusBadge status={update.new_status} />
                        {update.previous_status && update.previous_status !== update.new_status && (
                          <span className="text-xs text-muted-foreground">from {update.previous_status}</span>
                        )}
                      </div>
                      {update.note && <p className="text-sm text-foreground mb-1">{update.note}</p>}
                      <p className="text-xs text-muted-foreground">
                        {update.updated_by_name} · {new Date(update.created_date).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl p-6 lg:sticky lg:top-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Update Status</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Status</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {statusOptions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Note</label>
                  <textarea
                    value={statusNote}
                    onChange={e => setStatusNote(e.target.value)}
                    placeholder="e.g. Flight delayed by 2 hours due to weather"
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
                <button
                  onClick={handleStatusUpdate}
                  disabled={updating || (newStatus === booking.booking_status && !statusNote)}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {updating ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}