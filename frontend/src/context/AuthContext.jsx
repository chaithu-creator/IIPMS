/**
 * AuthContext – manages JWT authentication state across the app.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'iipms_token';

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('iipms_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const saveSession = useCallback((tok, userData) => {
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem('iipms_user', JSON.stringify(userData));
    setToken(tok);
    setUser(userData);
    setAuthError('');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('iipms_user');
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `Login failed (${res.status})`);
      if (!data?.token || !data?.user) throw new Error('Login failed: invalid server response');
      saveSession(data.token, data.user);
      return true;
    } catch (e) {
      setAuthError(e.message);
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, [saveSession]);

  const register = useCallback(async (name, email, password) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `Registration failed (${res.status})`);
      if (!data?.token || !data?.user) throw new Error('Registration failed: invalid server response');
      saveSession(data.token, data.user);
      return true;
    } catch (e) {
      setAuthError(e.message);
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, [saveSession]);

  const updateProfile = useCallback(async (fields) => {
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `Update failed (${res.status})`);
      if (!data) throw new Error('Update failed: empty server response');
      const updated = { ...user, ...data };
      localStorage.setItem('iipms_user', JSON.stringify(updated));
      setUser(updated);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [token, user]);

  return (
    <AuthContext.Provider value={{ token, user, authError, authLoading, login, register, logout, updateProfile, setAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
