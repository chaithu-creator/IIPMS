/**
 * ProfilePage – user profile settings panel.
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

export default function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    location: user?.location || '',
    alerts_email: user?.alerts_email ? true : false,
  });
  const [status, setStatus] = useState(null); // { ok, msg }
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [e.target.name]: val }));
    setStatus(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await updateProfile({
      name: form.name,
      location: form.location,
      alerts_email: form.alerts_email,
    });
    setStatus({ ok: result.ok, msg: result.ok ? 'Profile updated!' : result.error });
    setSaving(false);
  };

  const initials = (user?.name || 'U').split(' ').filter(w => w).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '';

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Avatar card */}
      <div
        className="card"
        style={{
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 800,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{user?.name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{user?.email}</div>
          {memberSince && (
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Member since {memberSince}</div>
          )}
        </div>
      </div>

      {/* Edit form */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>⚙️ Profile Settings</div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Display Name</label>
            <input
              style={INPUT_STYLE}
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Your name"
              required
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Email (read-only)</label>
            <input
              style={{ ...INPUT_STYLE, opacity: 0.5, cursor: 'not-allowed' }}
              type="email"
              value={user?.email || ''}
              readOnly
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Location / City</label>
            <input
              style={INPUT_STYLE}
              type="text"
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="e.g. Hyderabad, India"
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '10px 12px',
              background: '#162032',
              borderRadius: 8,
              border: '1px solid #334155',
            }}
          >
            <input
              type="checkbox"
              name="alerts_email"
              checked={form.alerts_email}
              onChange={handleChange}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Email Alerts</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Receive notifications when pollution levels are high</div>
            </div>
          </label>

          {status && (
            <div
              style={{
                background: status.ok ? '#14532d' : '#450a0a',
                color: status.ok ? '#86efac' : '#fca5a5',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
              }}
            >
              {status.ok ? '✅' : '⚠️'} {status.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '11px',
              fontSize: 14,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#f87171' }}>⚠️ Account</div>
        <button
          onClick={logout}
          style={{
            width: '100%',
            background: '#7f1d1d',
            color: '#fca5a5',
            border: '1px solid #ef4444',
            borderRadius: 8,
            padding: '11px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🚪 Log Out
        </button>
      </div>
    </div>
  );
}
