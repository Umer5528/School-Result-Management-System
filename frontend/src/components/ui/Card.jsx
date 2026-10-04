import React from 'react';

export default function Card({ className = '', hoverable = false, children, ...props }) {
  return (
    <div
      className={`rounded-xl border border-slate-200/70 bg-white p-5 shadow-card transition-all duration-200 ${
        hoverable ? 'hover:-translate-y-0.5 hover:shadow-card-hover' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
