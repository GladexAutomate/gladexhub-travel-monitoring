import React from 'react';

const statusConfig = {
  Confirmed: { className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  Delayed: { className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
  Cancelled: { className: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400' },
  Completed: { className: 'bg-slate-500/10 text-slate-400 border-slate-500/20', dot: 'bg-slate-400' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig['Confirmed'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {status}
    </span>
  );
}