/**
 * Alerts – shows server-side recommendations with colour-coded badges.
 */
import React from 'react';

const ICON = { success: '✅', warning: '⚠️', danger: '🔴', info: 'ℹ️' };
const BG   = { success: '#14532d', warning: '#431407', danger: '#450a0a', info: '#1e3a5f' };
const CLR  = { success: '#86efac', warning: '#fed7aa', danger: '#fca5a5', info: '#93c5fd' };

export default function Alerts({ items = [] }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        🔔 Alerts & Recommendations
      </div>
      {items.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>No alerts — start monitoring to get recommendations.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <div
              key={i}
              className="fade-in"
              style={{
                background: BG[item.type] || BG.info,
                color: CLR[item.type] || CLR.info,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1.4 }}>{ICON[item.type] || 'ℹ️'}</span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
