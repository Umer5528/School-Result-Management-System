import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Frontend route protection. Purely UX — the backend independently
 * enforces every one of these checks again on every API call, since
 * frontend guards can always be bypassed by a direct request.
 */
export default function ProtectedRoute({ roles, permission }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
