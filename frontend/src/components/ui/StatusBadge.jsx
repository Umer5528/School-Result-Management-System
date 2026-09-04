import React from 'react';

const styles = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-slate-200 text-slate-600',
  PASS: 'bg-emerald-100 text-emerald-700',
  FAIL: 'bg-red-100 text-red-700',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
