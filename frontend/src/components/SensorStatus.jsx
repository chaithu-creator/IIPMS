/**
 * SensorStatus – shows the live sensor readings as a compact bar.
 */
import React from 'react';

function Bar({ value, max, color }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ height: 6, background: '#1e3a5f', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

export default function SensorStatus({ lux, db, vibration, lat, lng }) {
  const items = [
    { label: 'Light', value: lux, unit: 'lux', max: 10000, color: '#facc15' },
    { label: 'Sound', value: db, unit: 'dB', max: 120, color: '#38bdf8' },
    { label: 'Vibration', value: +(vibration).toFixed(2), unit: 'm/s²', max: 2, color: '#a78bfa' },
  ];

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>📡 Live Sensor Readings</span>
        {lat && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            📍 {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ label, value, unit, max, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 60, fontSize: 12, color: '#94a3b8' }}>{label}</span>
            <Bar value={value} max={max} color={color} />
            <span style={{ width: 72, textAlign: 'right', fontSize: 12, color, fontWeight: 600 }}>
              {value} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
