import React from 'react';

export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white p-6 shadow-lg">
        {title && <h3 className="mb-4 pr-6 text-lg font-semibold text-slate-800">{title}</h3>}
        <div className="min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
