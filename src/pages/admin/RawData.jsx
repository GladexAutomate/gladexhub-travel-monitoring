import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Search, Server, Loader2 } from 'lucide-react';

const TABLES = [
  { name: 'fusioo_booking_transactions', label: 'Bookings' },
  { name: 'fusioo_hotel_details', label: 'Hotel Details' },
  { name: 'fusioo_ticket_details', label: 'Ticket Details' },
  { name: 'fusioo_tour_details', label: 'Tour Details' },
  { name: 'fusioo_transfer_details', label: 'Transfer Details' },
];

// Fields worth showing by table — keeps columns readable instead of dumping
// all 50+ JSONB keys. Null means "show all keys from first row".
const PRIORITY_FIELDS = {
  fusioo_booking_transactions: ['gdx', 'name_of_agent_1', 'agent_name', 'status', 'lead_name', 'arrival', 'email_1', 'mobile_1', 'duration', 'total_cost', 'voucher', 'created'],
  fusioo_hotel_details: ['room_type', 'final_rate', 'unit_price', 'discount', 'voucher', 'created_by', 'created'],
  fusioo_ticket_details: ['booking_reference_number_pnr', 'customer_last_name', 'type_of_ticket', 'airline', 'eticket_', 'cost', 'departure_date', 'arrival_date', 'created_by', 'created'],
  fusioo_tour_details: ['tour_name', 'tour_date', 'quantity', 'select_1', 'voucher', 'created', 'created_by'],
  fusioo_transfer_details: ['transfer_type', 'supplier_name', 'transfer_date_arrival', 'transfer_date_departure', 'created'],
};

function formatValue(val) {
  if (val === null || val === undefined) return <span className="text-muted-foreground/40">—</span>;
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'string' && val.length > 60) return val.slice(0, 60) + '…';
  return String(val);
}

export default function RawData() {
  const [table, setTable] = useState(TABLES[0].name);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('fetchSupabaseData', {
        table,
        page,
        pageSize: 25,
        search,
      });
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [table, page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTableChange = (newTable) => {
    setTable(newTable);
    setPage(1);
    setSearch('');
    setSearchInput('');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const columns = data?.rows?.length > 0
    ? (PRIORITY_FIELDS[table] || Object.keys(data.rows[0]).filter((k) => k !== '_record_id'))
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Server className="w-6 h-6 text-primary" />
          Raw Data Browser
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse live records from the Sales Supabase project (fusioo tables).
        </p>
      </div>

      {/* Table selector */}
      <div className="flex flex-wrap gap-2">
        {TABLES.map((t) => (
          <button
            key={t.name}
            onClick={() => handleTableChange(t.name)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              table === t.name
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search across all fields…"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={loading}>Search</Button>
        {search && (
          <Button type="button" variant="outline" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </form>

      {/* Status bar */}
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {loading ? 'Loading…' : data ? `${data.total.toLocaleString()} records` : ''}
        </p>
        {data && data.totalPages > 1 && (
          <p className="text-muted-foreground">Page {data.page} of {data.totalPages}</p>
        )}
      </div>

      {/* Data table */}
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : data?.rows?.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col} className="whitespace-nowrap text-xs font-semibold">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, i) => (
                  <TableRow key={row._record_id || i}>
                    {columns.map((col) => (
                      <TableCell key={col} className="text-xs whitespace-nowrap max-w-xs">
                        {formatValue(row[col])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-12 text-center text-muted-foreground text-sm">No records found.</div>
        )}
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}