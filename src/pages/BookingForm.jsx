import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const statusOptions = ['Confirmed', 'Delayed', 'Cancelled', 'Completed'];

export default function BookingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    passenger_name: '',
    passenger_email: '',
    flight_number: '',
    airline: '',
    origin: '',
    destination: '',
    departure_date: '',
    return_date: '',
    booking_status: 'Confirmed',
    seat_info: '',
    gate: '',
    status_notes: '',
  });

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      try {
        const b = await base44.entities.Booking.get(id);
        setForm({
          passenger_name: b.passenger_name || '',
          passenger_email: b.passenger_email || '',
          flight_number: b.flight_number || '',
          airline: b.airline || '',
          origin: b.origin || '',
          destination: b.destination || '',
          departure_date: b.departure_date ? b.departure_date.split('T')[0] : '',
          return_date: b.return_date ? b.return_date.split('T')[0] : '',
          booking_status: b.booking_status || 'Confirmed',
          seat_info: b.seat_info || '',
          gate: b.gate || '',
          status_notes: b.status_notes || '',
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await base44.entities.Booking.update(id, form);
        navigate(`/bookings/${id}`);
      } else {
        const created = await base44.entities.Booking.create(form);
        navigate(`/bookings/${created.id}`);
      }
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const inputClass =
    'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50';
  const labelClass = 'text-xs text-muted-foreground mb-1.5 block';

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <Link
        to="/bookings"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bookings
      </Link>

      <h1 className="text-2xl font-bold text-foreground mb-8">{isEdit ? 'Edit Booking' : 'New Booking'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Passenger Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Passenger Name *</label>
              <input
                required
                value={form.passenger_name}
                onChange={e => handleChange('passenger_name', e.target.value)}
                className={inputClass}
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className={labelClass}>Passenger Email</label>
              <input
                type="email"
                value={form.passenger_email}
                onChange={e => handleChange('passenger_email', e.target.value)}
                className={inputClass}
                placeholder="john@example.com"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Flight Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Flight Number *</label>
              <input
                required
                value={form.flight_number}
                onChange={e => handleChange('flight_number', e.target.value)}
                className={inputClass}
                placeholder="PR 123"
              />
            </div>
            <div>
              <label className={labelClass}>Airline</label>
              <input
                value={form.airline}
                onChange={e => handleChange('airline', e.target.value)}
                className={inputClass}
                placeholder="Philippine Airlines"
              />
            </div>
            <div>
              <label className={labelClass}>Origin *</label>
              <input
                required
                value={form.origin}
                onChange={e => handleChange('origin', e.target.value)}
                className={inputClass}
                placeholder="MNL"
              />
            </div>
            <div>
              <label className={labelClass}>Destination *</label>
              <input
                required
                value={form.destination}
                onChange={e => handleChange('destination', e.target.value)}
                className={inputClass}
                placeholder="CEB"
              />
            </div>
            <div>
              <label className={labelClass}>Departure Date *</label>
              <input
                required
                type="date"
                value={form.departure_date}
                onChange={e => handleChange('departure_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Return Date</label>
              <input
                type="date"
                value={form.return_date}
                onChange={e => handleChange('return_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Seat Info</label>
              <input
                value={form.seat_info}
                onChange={e => handleChange('seat_info', e.target.value)}
                className={inputClass}
                placeholder="12A"
              />
            </div>
            <div>
              <label className={labelClass}>Gate</label>
              <input
                value={form.gate}
                onChange={e => handleChange('gate', e.target.value)}
                className={inputClass}
                placeholder="A5"
              />
            </div>
            <div>
              <label className={labelClass}>Booking Status</label>
              <select
                value={form.booking_status}
                onChange={e => handleChange('booking_status', e.target.value)}
                className={inputClass}
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Status Notes</label>
            <textarea
              value={form.status_notes}
              onChange={e => handleChange('status_notes', e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Any notes about this booking..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link
            to="/bookings"
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : isEdit ? 'Update Booking' : 'Create Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}