import React, { useEffect, useState } from 'react';
import { supabaseSales } from '@/lib/supabaseSales';
import { supabaseFusioo } from '@/lib/supabaseFusioo';
import { supabaseAutomate } from '@/lib/supabaseAutomate';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const TESTS = [
  { label: 'Sales (bookings & tickets)', client: supabaseSales, table: 'bookings_6fbdd6b2', envVars: ['VITE_SALES_SUPABASE_URL', 'VITE_SALES_SUPABASE_ANON_KEY'] },
  { label: 'Fusioo (agent/team mirror)', client: supabaseFusioo, table: 'fusioo_booking_transactions', envVars: ['VITE_FUSIOO_SUPABASE_URL', 'VITE_FUSIOO_SUPABASE_ANON_KEY'] },
  { label: 'Automate (flight emails)', client: supabaseAutomate, table: 'flight_emails', envVars: ['VITE_AUTOMATE_SUPABASE_URL', 'VITE_AUTOMATE_SUPABASE_ANON_KEY'] },
];

function envValue(name) {
  return import.meta.env[name];
}

export default function SystemDiagnostics() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    async function run() {
      const out = [];
      for (const t of TESTS) {
        const url = envValue(t.envVars[0]);
        const key = envValue(t.envVars[1]);
        if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
          out.push({ ...t, status: 'fail', reason: 'Environment variable not injected — check dashboard Settings → Environment Variables', url: '—' });
          setResults([...out]);
          continue;
        }
        try {
          const { error, count } = await t.client.from(t.table).select('*', { count: 'exact', head: true });
          if (error) {
            out.push({ ...t, status: 'fail', reason: error.message, url });
          } else {
            out.push({ ...t, status: 'pass', rowCount: count, url });
          }
        } catch (e) {
          out.push({ ...t, status: 'fail', reason: e.message, url });
        }
        setResults([...out]);
      }
    }
    run();
  }, []);

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to portal
        </Link>
        <h1 className="text-2xl font-heading font-bold mb-1">System Diagnostics</h1>
        <p className="text-muted-foreground text-sm mb-2">
          Verifying all three Supabase project connections from the browser environment.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-8">
          These checks query Supabase directly from this page. On Base44's hosting, VITE_-prefixed
          environment variables aren't reliably injected into the frontend at runtime — so a FAIL
          here doesn't necessarily mean the credentials are wrong, it may just mean this specific
          in-browser check doesn't work in that environment. The app's actual data fetching goes
          through backend functions (querySupabase), which read credentials server-side and aren't
          affected by this limitation.
        </p>

        <div className="space-y-3">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-xl border p-5 ${
                r.status === 'pass' ? 'border-green-200 bg-green-50' : r.status === 'fail' ? 'border-red-200 bg-red-50' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {r.status === 'pass' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : r.status === 'fail' ? (
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-heading font-semibold text-sm">{r.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{r.url}</p>
                  </div>
                </div>
                {r.status === 'pass' && (
                  <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {r.rowCount} rows
                  </span>
                )}
              </div>
              {r.status === 'fail' && (
                <p className="text-xs text-red-600 mt-2 pl-7">{r.reason}</p>
              )}
            </div>
          ))}
          {results.length < TESTS.length && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Running tests… ({results.length}/{TESTS.length} complete)
            </p>
          )}
        </div>

        {results.length === TESTS.length && (
          <div className="mt-6 text-center">
            <p className="text-sm font-medium">
              {results.filter((r) => r.status === 'pass').length}/{TESTS.length} connections successful
            </p>
          </div>
        )}
      </div>
    </div>
  );
}