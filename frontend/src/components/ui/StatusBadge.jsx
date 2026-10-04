import React from 'react';

const styles = {
  pending: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  rejected: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  suspended: 'bg-slate-200 text-slate-600 ring-1 ring-slate-300',
  PASS: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  FAIL: 'bg-red-100 text-red-700 ring-1 ring-red-200',
};

// A subtle "live" dot for states that represent something currently
// active/ongoing, rather than a settled outcome.
const PULSE_STATUSES = new Set(['pending', 'approved']);

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
      }`}
    >
      {PULSE_STATUSES.has(status) && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulseSoft" />}
      {status}
    </span>
  );
}
