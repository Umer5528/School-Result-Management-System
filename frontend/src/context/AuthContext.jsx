import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('srms_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('srms_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('srms_user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('srms_token');
        localStorage.removeItem('srms_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { data } = await authApi.login({ email, password });
    localStorage.setItem('srms_token', data.token);
    localStorage.setItem('srms_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('srms_token');
    localStorage.removeItem('srms_user');
    setUser(null);
  }

  // Super Admin has every permission implicitly; Assistant Admin only the
  // flags they were granted; Teacher never has admin permissions.
  function hasPermission(permission) {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return user.role === 'assistant_admin' && (user.permissions || []).includes(permission);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
