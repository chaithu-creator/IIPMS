/**
 * RadialGauge – SVG radial gauge for a single metric.
 */
import React from 'react';
import { levelColor } from '../utils/pollution.js';

export default function RadialGauge({ value = 0, max = 100, label = '', unit = '', level = 'good', size = 140 }) {
  const r = 50;
  const cx = 60;
  const cy = 60;
  const circumference = Math.PI * r; // half circle = π * r
  const fraction = Math.min(value / max, 1);
  const dashOffset = circumference * (1 - fraction);
  const color = levelColor(level);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size * 0.7} viewBox="0 0 120 80">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
        {/* Value text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#f1f5f9" fontSize="18" fontWeight="700">
          {value}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize="10">
          {unit}
        </text>
      </svg>
      <span style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>{label}</span>
      <span
        style={{
          background: color + '22',
          color,
          padding: '2px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {level}
      </span>
    </div>
  );
}
