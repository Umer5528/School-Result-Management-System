import React from 'react';

export default function Skeleton({ className = '' }) {
  return <div className={`skeleton-shimmer animate-shimmer rounded-md ${className}`} />;
}
