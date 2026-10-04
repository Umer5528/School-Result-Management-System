import React from 'react';

const variants = {
  primary:
    'bg-brand-gradient text-white shadow-glow hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100',
  secondary:
    'bg-white text-slate-700 border border-slate-200 shadow-sm hover:border-brand-300 hover:text-brand-700 hover:shadow-card active:scale-[0.97]',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:scale-[0.97] disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 active:scale-[0.97]',
};

export default function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
