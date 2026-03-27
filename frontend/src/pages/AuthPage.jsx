/**
 * AuthPage – Combined Login / Sign-up screen.
 */
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const INPUT_STYLE = {
  width: '100%',
  background: '#162032',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#f1f5f9',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const BTN_PRIMARY = {
  width: '100%',
  background: '#0ea5e9',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '12px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 8,
};

export default function AuthPage() {
  const { login, register, authError, authLoading, setAuthError } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [localErr, setLocalErr] = useState('');

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setLocalErr('');
    setAuthError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr('');
    if (mode === 'signup') {
      if (!form.name.trim()) return setLocalErr('Please enter your name.');
      if (form.password !== form.confirm) return setLocalErr('Passwords do not match.');
      await register(form.name, form.email, form.password);
    } else {
      await login(form.email, form.password);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setForm({ name: '', email: '', password: '', confirm: '' });
    setLocalErr('');
    setAuthError('');
  };

  const errorMsg = localErr || authError;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        padding: 16,
      }}
    >
      {/* Logo / title */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🌿</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8' }}>IIPMS</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Invisible Pollution Monitor</p>
      </div>

      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 380,
        }}
      >
        {/* Mode tabs */}
        <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid #334155' }}>
          {['login', 'signup'].map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1,
                padding: '8px 0',
                fontSize: 14,
                fontWeight: mode === m ? 700 : 400,
                color: mode === m ? '#38bdf8' : '#64748b',
                background: 'transparent',
                border: 'none',
                borderBottom: mode === m ? '2px solid #38bdf8' : '2px solid transparent',
                textTransform: 'capitalize',
              }}
            >
              {m === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Full Name</label>
              <input
                style={INPUT_STYLE}
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Jane Doe"
                required
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Email</label>
            <input
              style={INPUT_STYLE}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Password</label>
            <input
              style={INPUT_STYLE}
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Confirm Password</label>
              <input
                style={INPUT_STYLE}
                type="password"
                name="confirm"
                value={form.confirm}
                onChange={handleChange}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                background: '#450a0a',
                color: '#fca5a5',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          <button type="submit" style={BTN_PRIMARY} disabled={authLoading}>
            {authLoading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginTop: 16 }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
          >
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  );
}
