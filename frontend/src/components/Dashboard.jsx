/**
 * Dashboard – combines all sensor gauges, indices & stats in one view.
 */
import React from 'react';
import RadialGauge from './RadialGauge.jsx';
import { THRESHOLDS, levelFromValue } from '../utils/pollution.js';

function StatCard({ label, value, unit, color }) {
  return (
    <div
      style={{
        background: '#162032',
        border: '1px solid #1e3a5f',
        borderRadius: 10,
        padding: '10px 12px',
        flex: '1 1 0',
        minWidth: 100,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
      {unit && <div style={{ fontSize: 10, color: '#475569' }}>{unit}</div>}
    </div>
  );
}

function ReportBadge({ label, value, unit, level }) {
  const colorMap = {
    good: '#22c55e',
    moderate: '#facc15',
    poor: '#fb923c',
    hazardous: '#ef4444',
  };
  const color = colorMap[level] || '#94a3b8';
  return (
    <div style={{
      background: '#162032',
      border: '1px solid #1e3a5f',
      borderRadius: 10,
      padding: '10px 12px',
      minWidth: 120,
      flex: '1 1 0',
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 18, fontWeight: 800, color }}>{value} {unit}</div>
      <div style={{ marginTop: 2, fontSize: 11, color }}>{(level || 'unknown').toUpperCase()}</div>
    </div>
  );
}

export default function Dashboard({ lux, db, vibration, pollutionIndex, cognitiveStress, stats, testReport }) {
  const lightLevel = levelFromValue(lux, THRESHOLDS.light);
  const soundLevel = levelFromValue(db, THRESHOLDS.sound);
  const vibLevel   = levelFromValue(vibration, THRESHOLDS.vibration);
  const piLevel    = levelFromValue(pollutionIndex, THRESHOLDS.pollutionIndex);
  const csiLevel   = levelFromValue(cognitiveStress, THRESHOLDS.cognitiveStress);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* Indices row */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🎯 Pollution Indices</div>
      <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8, marginBottom: 16 }}>
        <RadialGauge value={pollutionIndex} max={100} label="Pollution Index" unit="/100" level={piLevel} size={130} />
        <RadialGauge value={cognitiveStress} max={100} label="Cognitive Stress" unit="/100" level={csiLevel} size={130} />
      </div>

      {/* Individual sensor gauges */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>📊 Sensor Levels</div>
      <div style={{ display: 'flex', justifyContent: 'space-around', gap: 4, flexWrap: 'wrap' }}>
        <RadialGauge value={lux} max={5000} label="Light" unit="lux" level={lightLevel} size={100} />
        <RadialGauge value={db} max={120} label="Sound" unit="dB" level={soundLevel} size={100} />
        <RadialGauge value={+(vibration).toFixed(2)} max={2} label="Vibration" unit="m/s²" level={vibLevel} size={100} />
      </div>

      {/* Aggregate stats */}
      {stats && stats.total > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 8px' }}>📋 Session Stats</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatCard label="Readings" value={stats.total} unit="" color="#38bdf8" />
            <StatCard label="Avg PI" value={stats.avgPI} unit="/100" color="#a78bfa" />
            <StatCard label="Max PI" value={stats.maxPI} unit="/100" color="#ef4444" />
            <StatCard label="Avg CSI" value={stats.avgCSI} unit="/100" color="#fb923c" />
            <StatCard label="Avg Light" value={stats.avgLight} unit="lux" color="#facc15" />
            <StatCard label="Avg Sound" value={stats.avgSound} unit="dB" color="#38bdf8" />
            <StatCard label="Avg Vibration" value={stats.avgVib} unit="m/s²" color="#a78bfa" />
          </div>
        </>
      )}

      {testReport && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '14px 0 8px' }}>🧾 Final Test Report</div>
          <div style={{
            background: '#0f1b2d',
            border: '1px solid #1e3a5f',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 8,
            color: '#94a3b8',
            fontSize: 12,
          }}>
            Duration: <strong style={{ color: '#e2e8f0' }}>{testReport.durationSec}s</strong> &nbsp;|&nbsp;
            Samples: <strong style={{ color: '#e2e8f0' }}>{testReport.sampleCount}</strong> &nbsp;|&nbsp;
            Completed: <strong style={{ color: '#e2e8f0' }}>{new Date(testReport.endedAtTs).toLocaleTimeString()}</strong>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ReportBadge label="Light Pollution" value={testReport.probable.lightLux} unit="lux" level={testReport.level.light} />
            <ReportBadge label="Noise Pollution" value={testReport.probable.soundDb} unit="dB" level={testReport.level.sound} />
            <ReportBadge label="Vibration Pollution" value={testReport.probable.vibration} unit="m/s²" level={testReport.level.vibration} />
            <ReportBadge label="Pollution Index" value={testReport.probable.pollutionIndex} unit="/100" level={testReport.level.pollutionIndex} />
            <ReportBadge label="Cognitive Stress" value={testReport.probable.cognitiveStress} unit="/100" level={testReport.level.cognitiveStress} />
          </div>
        </>
      )}
    </div>
  );
}
