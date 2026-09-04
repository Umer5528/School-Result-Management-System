import React from 'react';

export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <input
        className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 ${
          error ? 'border-red-400' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
