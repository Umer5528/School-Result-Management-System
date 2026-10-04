import React from 'react';

export default function ProgressBar({ value, total, label }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const complete = total > 0 && value >= total;
  return (
    <div>
      {label && <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>}
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              complete ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-brand-gradient'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-500">{value}/{total}</span>
      </div>
    </div>
  );
}
