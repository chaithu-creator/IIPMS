/**
 * Alerts – shows server-side recommendations with colour-coded badges.
 * Also shows live threshold alerts when monitoring is active.
 */
import React from 'react';

const ICON = { success: '✅', warning: '⚠️', danger: '🔴', info: 'ℹ️' };
const BG   = { success: '#14532d', warning: '#431407', danger: '#450a0a', info: '#1e3a5f' };
const CLR  = { success: '#86efac', warning: '#fed7aa', danger: '#fca5a5', info: '#93c5fd' };

function AlertItem({ item }) {
  return (
    <div
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
  );
}

export default function Alerts({ items = [], isMonitoring = false, pollutionIndex = 0, cognitiveStress = 0 }) {
  // Build live alerts from current sensor readings while monitoring
  const liveAlerts = [];
  if (isMonitoring) {
    if (pollutionIndex > 75) {
      liveAlerts.push({ type: 'danger', message: `🚨 Live: Pollution Index ${pollutionIndex}/100 – hazardous! Move to a cleaner environment immediately.` });
    } else if (pollutionIndex > 50) {
      liveAlerts.push({ type: 'warning', message: `⚠️ Live: Pollution Index ${pollutionIndex}/100 – elevated pollution detected. Limit exposure.` });
    }
    if (cognitiveStress > 60) {
      liveAlerts.push({ type: 'danger', message: `🧠 Live: Cognitive Stress Index ${cognitiveStress}/100 – high cognitive load. Take a break.` });
    } else if (cognitiveStress > 40) {
      liveAlerts.push({ type: 'warning', message: `🧠 Live: Cognitive Stress Index ${cognitiveStress}/100 – moderate stress detected.` });
    }
    if (liveAlerts.length === 0 && pollutionIndex > 0) {
      liveAlerts.push({ type: 'success', message: `✅ Live: Environment looks good! Pollution Index ${pollutionIndex}/100.` });
    }
  }

  const allItems = [...liveAlerts, ...items];

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        🔔 Alerts &amp; Recommendations
        {isMonitoring && (
          <span style={{
            marginLeft: 8,
            fontSize: 10,
            background: '#166534',
            color: '#86efac',
            padding: '2px 6px',
            borderRadius: 10,
          }}>
            LIVE
          </span>
        )}
      </div>
      {allItems.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>
          {isMonitoring
            ? 'Analysing sensor data…'
            : 'No alerts yet — start monitoring to get live recommendations.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allItems.map((item, i) => (
            <AlertItem key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
