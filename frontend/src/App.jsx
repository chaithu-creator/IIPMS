/**
 * IIPMS – Invisible Pollution Monitoring System
 * Main App component. Orchestrates sensor hooks, backend API, and UI.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './components/Dashboard.jsx';
import SensorStatus from './components/SensorStatus.jsx';
import TrendGraph from './components/TrendGraph.jsx';
import HeatMap from './components/HeatMap.jsx';
import Alerts from './components/Alerts.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useMicrophone } from './hooks/useMicrophone.js';
import { useAccelerometer } from './hooks/useAccelerometer.js';
import { useLightSensor } from './hooks/useLightSensor.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { calcPollutionIndex, calcCognitiveStress, levelFromValue, THRESHOLDS } from './utils/pollution.js';
import appLogo from '/app-logo.svg';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const POLL_INTERVAL_MS = 3000;
const REFRESH_INTERVAL_TICKS = 5;
const TEST_DURATIONS = [
  { label: '30s', value: 30 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

function smoothNumber(previous, next, alpha, precision = 1) {
  const smoothed = previous + (next - previous) * alpha;
  const p = 10 ** precision;
  return Math.round(smoothed * p) / p;
}

function ensureClientId() {
  if (typeof window === 'undefined') return 'iipms-web-client';
  const existing = window.localStorage.getItem('iipms-client-id');
  if (existing) return existing;
  const generated = `iipms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem('iipms-client-id', generated);
  return generated;
}

function median(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function round(value, precision = 1) {
  const p = 10 ** precision;
  return Math.round(value * p) / p;
}

function buildTestReport(samples, durationSec, endedAtTs) {
  if (!samples.length) return null;

  const probableLight = round(median(samples.map(s => Number(s.lightLux) || 0)), 1);
  const probableSound = round(median(samples.map(s => Number(s.soundDb) || 0)), 1);
  const probableVibration = round(median(samples.map(s => Number(s.vibration) || 0)), 3);

  const pollutionIndex = calcPollutionIndex({
    lightLux: probableLight,
    soundDb: probableSound,
    vibration: probableVibration,
  });
  const cognitiveStress = calcCognitiveStress({
    lightLux: probableLight,
    soundDb: probableSound,
    vibration: probableVibration,
  });

  return {
    durationSec,
    sampleCount: samples.length,
    endedAtTs,
    probable: {
      lightLux: probableLight,
      soundDb: probableSound,
      vibration: probableVibration,
      pollutionIndex,
      cognitiveStress,
    },
    level: {
      light: levelFromValue(probableLight, THRESHOLDS.light),
      sound: levelFromValue(probableSound, THRESHOLDS.sound),
      vibration: levelFromValue(probableVibration, THRESHOLDS.vibration),
      pollutionIndex: levelFromValue(pollutionIndex, THRESHOLDS.pollutionIndex),
      cognitiveStress: levelFromValue(cognitiveStress, THRESHOLDS.cognitiveStress),
    },
  };
}

function addReadingToTrend(previousRows, reading) {
  if (!reading || !reading.ts) return previousRows;
  const bucketTs = Math.floor(reading.ts / 60_000) * 60_000;
  const pi = Number(reading.pollution_index ?? reading.pollutionIndex ?? 0);
  const csi = Number(reading.cognitive_stress ?? reading.cognitiveStress ?? 0);
  const sound = Number(reading.sound_db ?? reading.soundDb ?? 0);
  const light = Number(reading.light_lux ?? reading.lightLux ?? 0);
  const vibration = Number(reading.vibration ?? 0);

  const next = [...previousRows];
  const idx = next.findIndex(row => row.bucket_ts === bucketTs || row.hour_ts === bucketTs);

  if (idx >= 0) {
    const row = next[idx];
    const count = Math.max(Number(row.count) || 1, 1);
    next[idx] = {
      ...row,
      bucket_ts: bucketTs,
      hour_ts: bucketTs,
      count: count + 1,
      avgPI: smoothNumber(Number(row.avgPI ?? pi), pi, 1 / (count + 1), 1),
      avgCSI: smoothNumber(Number(row.avgCSI ?? csi), csi, 1 / (count + 1), 1),
      avgSound: smoothNumber(Number(row.avgSound ?? sound), sound, 1 / (count + 1), 1),
      avgLight: smoothNumber(Number(row.avgLight ?? light), light, 1 / (count + 1), 1),
      avgVib: smoothNumber(Number(row.avgVib ?? vibration), vibration, 1 / (count + 1), 3),
    };
  } else {
    next.push({
      bucket_ts: bucketTs,
      hour_ts: bucketTs,
      count: 1,
      avgPI: pi,
      avgCSI: csi,
      avgSound: sound,
      avgLight: light,
      avgVib: vibration,
    });
  }

  return next.sort((a, b) => (a.bucket_ts ?? a.hour_ts) - (b.bucket_ts ?? b.hour_ts)).slice(-120);
}

function addReadingToHeatmap(previousPoints, reading) {
  const lat = Number(reading?.lat);
  const lng = Number(reading?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return previousPoints;
  const intensity = Number(reading.pollution_index ?? reading.pollutionIndex ?? 0);
  const next = [...previousPoints, { lat, lng, intensity }];
  return next.slice(-400);
}

async function fetchJsonSafe(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url} (${res.status})`);
    }
  }
  if (!res.ok) {
    const apiError = data && typeof data === 'object' ? data.error : null;
    throw new Error(apiError || `Request failed for ${url} (${res.status})`);
  }
  return data;
}

const TABS = ['Dashboard', 'Heatmap', 'Trends', 'Alerts', 'Profile'];

function Header({
  isMonitoring,
  onToggle,
  lastTs,
  user,
  onProfile,
  testDurationSec,
  onTestDurationChange,
  remainingSec,
}) {
  return (
    <header style={{
      background: '#0f172a',
      borderBottom: '1px solid #1e3a5f',
      padding: '12px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={appLogo} alt="IIPMS logo" style={{ width: 28, height: 28, display: 'block' }} />
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', lineHeight: 1.2 }}>IIPMS</h1>
          <p style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>Invisible Pollution Monitor</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!isMonitoring && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 11 }}>
            Test
            <select
              value={testDurationSec}
              onChange={(e) => onTestDurationChange(Number(e.target.value))}
              style={{
                background: '#0b1220',
                border: '1px solid #1e3a5f',
                color: '#cbd5e1',
                borderRadius: 6,
                fontSize: 11,
                padding: '4px 6px',
              }}
            >
              {TEST_DURATIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}
        {isMonitoring && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {lastTs ? new Date(lastTs).toLocaleTimeString() : 'Waiting…'}
          </span>
        )}
        {isMonitoring && (
          <span style={{ fontSize: 11, color: '#facc15', minWidth: 38, textAlign: 'right' }}>
            {Math.max(remainingSec, 0)}s
          </span>
        )}
        {isMonitoring && (
          <span className="pulse" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
        )}
        <button
          onClick={onToggle}
          style={{
            background: isMonitoring ? '#7f1d1d' : '#1e3a5f',
            color: isMonitoring ? '#fca5a5' : '#93c5fd',
            border: `1px solid ${isMonitoring ? '#ef4444' : '#38bdf8'}`,
            borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
          }}
        >
          {isMonitoring ? 'Stop' : 'Start Monitoring'}
        </button>
        {user && (
          <button
            onClick={onProfile}
            title={user.name}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
              border: 'none', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
            }}
          >
            {(user.name || 'U').split(' ').filter(w => w).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </button>
        )}
      </div>
    </header>
  );
}

function TabBar({ active, onChange }) {
  return (
    <nav style={{
      display: 'flex', borderBottom: '1px solid #1e3a5f',
      background: '#0f172a', position: 'sticky', top: 57, zIndex: 999,
    }}>
      {TABS.map(tab => (
        <button key={tab} onClick={() => onChange(tab)} style={{
          flex: 1, padding: '10px 4px', fontSize: 11,
          fontWeight: active === tab ? 700 : 400,
          color: active === tab ? '#38bdf8' : '#64748b',
          background: 'transparent',
          borderBottom: active === tab ? '2px solid #38bdf8' : '2px solid transparent',
          transition: 'all 0.2s',
        }}>
          {tab}
        </button>
      ))}
    </nav>
  );
}

function PermissionNote({ errors }) {
  const msgs = Object.entries(errors).filter(([, v]) => v);
  if (msgs.length === 0) return null;
  return (
    <div style={{ background: '#431407', borderRadius: 8, padding: '10px 12px', margin: '0 0 12px', fontSize: 12, color: '#fed7aa' }}>
      <strong>⚠️ Sensor Permissions:</strong>
      <ul style={{ marginTop: 4, paddingLeft: 16 }}>
        {msgs.map(([k, v]) => <li key={k}>{k}: {v}</li>)}
      </ul>
      <p style={{ marginTop: 4, color: '#94a3b8', fontSize: 11 }}>
        Grant permissions and press <strong>Start Monitoring</strong> again.
      </p>
    </div>
  );
}

/** Inner component rendered only when logged in – all hooks are safe here */
function MonitoringApp() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastTs, setLastTs] = useState(null);
  const [heatPoints, setHeatPoints] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [liveHistory, setLiveHistory] = useState([]);
  const [testDurationSec, setTestDurationSec] = useState(30);
  const [remainingSec, setRemainingSec] = useState(0);
  const [testReport, setTestReport] = useState(null);
  const [stableReading, setStableReading] = useState({
    lightLux: 0,
    soundDb: 30,
    vibration: 0,
    lat: null,
    lng: null,
  });

  const socketRef  = useRef(null);
  const intervalRef = useRef(null);
  const stableReadingRef = useRef(stableReading);
  const tickRef = useRef(0);
  const clientIdRef = useRef(ensureClientId());
  const sessionSamplesRef = useRef([]);
  const sessionEndAtRef = useRef(null);
  const isMonitoringRef = useRef(false);

  const mic   = useMicrophone();
  const accel = useAccelerometer();
  const light = useLightSensor();
  const geo   = useGeolocation();

  const sensorErrors = {
    Microphone:     mic.error,
    Accelerometer:  accel.error,
    'Light Sensor': light.error,
    GPS:            geo.error,
  };

  useEffect(() => {
    stableReadingRef.current = stableReading;
  }, [stableReading]);

  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    const nextLight = Number.isFinite(light.lux) ? Math.max(light.lux, 0) : 0;
    const nextSound = Number.isFinite(mic.db) ? Math.max(mic.db, 20) : 30;
    const nextVib = Number.isFinite(accel.magnitude) ? Math.max(accel.magnitude, 0) : 0;
    const nextLat = Number.isFinite(geo.lat) ? geo.lat : null;
    const nextLng = Number.isFinite(geo.lng) ? geo.lng : null;

    setStableReading(prev => ({
      lightLux: smoothNumber(prev.lightLux, nextLight, 0.2, 1),
      soundDb: smoothNumber(prev.soundDb, nextSound, 0.3, 1),
      vibration: smoothNumber(prev.vibration, nextVib, 0.35, 3),
      lat: nextLat,
      lng: nextLng,
    }));
  }, [light.lux, mic.db, accel.magnitude, geo.lat, geo.lng]);

  const pollutionIndex  = calcPollutionIndex({
    lightLux: stableReading.lightLux,
    soundDb: stableReading.soundDb,
    vibration: stableReading.vibration,
  });
  const cognitiveStress = calcCognitiveStress({
    lightLux: stableReading.lightLux,
    soundDb: stableReading.soundDb,
    vibration: stableReading.vibration,
  });

  const fetchStats = useCallback(async () => {
    try {
      const [s, a, t, h] = await Promise.all([
        fetchJsonSafe(`${API_BASE}/stats`),
        fetchJsonSafe(`${API_BASE}/recommendations`),
        fetchJsonSafe(`${API_BASE}/readings/trend?hours=2&bucket=minute`),
        fetchJsonSafe(`${API_BASE}/readings/heatmap`),
      ]);
      setStats(s);
      setAlerts(Array.isArray(a) ? a : []);
      setTrendData(Array.isArray(t) ? t : []);
      setHeatPoints(Array.isArray(h) ? h : []);
    } catch (e) {
      console.error('Fetch error', e);
    }
  }, []);

  const sendReading = useCallback(async () => {
    try {
      const payload = stableReadingRef.current;
      const res = await fetch(`${API_BASE}/readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientIdRef.current,
        },
        body: JSON.stringify({
          lat: payload.lat,
          lng: payload.lng,
          lightLux: payload.lightLux,
          soundDb: payload.soundDb,
          vibration: payload.vibration,
        }),
      });
      const reading = await res.json().catch(() => null);
      if (reading?.ts) {
        setLastTs(reading.ts);
        sessionSamplesRef.current.push({
          lightLux: Number(reading.lightLux ?? payload.lightLux) || 0,
          soundDb: Number(reading.soundDb ?? payload.soundDb) || 0,
          vibration: Number(reading.vibration ?? payload.vibration) || 0,
          ts: reading.ts,
        });
      } else {
        sessionSamplesRef.current.push({
          lightLux: Number(payload.lightLux) || 0,
          soundDb: Number(payload.soundDb) || 0,
          vibration: Number(payload.vibration) || 0,
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.error('Send error', e);
    }
  }, []);

  const stopAndFinalizeTest = useCallback(async () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    mic.stop();
    accel.stop();
    light.stop();
    geo.stop();
    tickRef.current = 0;
    sessionEndAtRef.current = null;
    setRemainingSec(0);
    setIsMonitoring(false);

    const finishedAt = Date.now();
    const report = buildTestReport(sessionSamplesRef.current, testDurationSec, finishedAt);
    if (report) {
      setTestReport(report);
    }
    sessionSamplesRef.current = [];
    await fetchStats();
  }, [accel, fetchStats, geo, light, mic, testDurationSec]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;
    socket.on('history', data => {
      const list = Array.isArray(data) ? data.slice(-50) : [];
      setLiveHistory(list);
    });
    socket.on('reading', reading => {
      setLastTs(reading.ts);
      setLiveHistory(prev => [...prev.slice(-49), reading]);
      setTrendData(prev => addReadingToTrend(prev, reading));
      setHeatPoints(prev => addReadingToHeatmap(prev, reading));
    });
    fetchStats();
    return () => {
      clearInterval(intervalRef.current);
      socket.disconnect();
    };
  }, [fetchStats]);

  const handleToggle = useCallback(async () => {
    if (isMonitoring) {
      await stopAndFinalizeTest();
    } else {
      await Promise.all([mic.start(), accel.start(), light.start(), geo.start()]);
      setIsMonitoring(true);
      setTestReport(null);
      tickRef.current = 0;
      setRemainingSec(testDurationSec);
      sessionSamplesRef.current = [];
      sessionEndAtRef.current = Date.now() + testDurationSec * 1000;
      sendReading();
      fetchStats();
      intervalRef.current = setInterval(() => {
        if (!isMonitoringRef.current) return;
        tickRef.current += 1;

        const endAt = sessionEndAtRef.current;
        if (endAt) {
          const left = Math.ceil((endAt - Date.now()) / 1000);
          setRemainingSec(Math.max(left, 0));
          if (left <= 0) {
            stopAndFinalizeTest();
            return;
          }
        }

        sendReading();
        if (tickRef.current % REFRESH_INTERVAL_TICKS === 0) {
          fetchStats();
        }
      }, POLL_INTERVAL_MS);
    }
  }, [isMonitoring, mic, accel, light, geo, sendReading, fetchStats, stopAndFinalizeTest, testDurationSec]);

  useEffect(() => {
    if (!isMonitoring) return;
  }, [isMonitoring, sendReading]);

  const displayReading = (!isMonitoring && testReport)
    ? {
        lightLux: testReport.probable.lightLux,
        soundDb: testReport.probable.soundDb,
        vibration: testReport.probable.vibration,
        lat: stableReading.lat,
        lng: stableReading.lng,
      }
    : stableReading;

  const displayPollutionIndex = (!isMonitoring && testReport)
    ? testReport.probable.pollutionIndex
    : pollutionIndex;
  const displayCognitiveStress = (!isMonitoring && testReport)
    ? testReport.probable.cognitiveStress
    : cognitiveStress;

  const hasGps = Number.isFinite(displayReading.lat) && Number.isFinite(displayReading.lng);
  const mapCenter = hasGps ? [displayReading.lat, displayReading.lng] : [20.5937, 78.9629];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        isMonitoring={isMonitoring}
        onToggle={handleToggle}
        lastTs={lastTs}
        user={user}
        onProfile={() => setActiveTab('Profile')}
        testDurationSec={testDurationSec}
        onTestDurationChange={setTestDurationSec}
        remainingSec={remainingSec}
      />
      <TabBar active={activeTab} onChange={setActiveTab} />

      <main style={{ flex: 1, padding: '14px 14px 80px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <PermissionNote errors={sensorErrors} />

        {activeTab === 'Dashboard' && (
          <>
            <Dashboard
              lux={displayReading.lightLux}
              db={displayReading.soundDb}
              vibration={displayReading.vibration}
              pollutionIndex={displayPollutionIndex}
              cognitiveStress={displayCognitiveStress}
              stats={stats}
              testReport={testReport}
            />
            <SensorStatus
              lux={displayReading.lightLux}
              db={displayReading.soundDb}
              vibration={displayReading.vibration}
              lat={displayReading.lat}
              lng={displayReading.lng}
            />
            {!isMonitoring && (
              <div style={{ textAlign: 'center', padding: '24px 16px', background: '#1e293b', borderRadius: 12, border: '1px dashed #334155', color: '#94a3b8', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📱</div>
                <p style={{ fontWeight: 600, color: '#f1f5f9' }}>Ready to Monitor</p>
                <p style={{ marginTop: 4, fontSize: 12 }}>
                  Tap <strong style={{ color: '#38bdf8' }}>Start Monitoring</strong> to begin collecting real-time sensor data.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'Heatmap' && (
          <HeatMap
            center={mapCenter}
            zoom={hasGps ? 15 : 5}
            points={heatPoints}
            userLat={stableReading.lat}
            userLng={stableReading.lng}
          />
        )}

        {activeTab === 'Trends' && (
          <>
            <TrendGraph data={trendData} />
            {liveHistory.length > 1 && (
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⚡ Live Readings</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: '#94a3b8' }}>
                        {['Time', 'Light', 'Sound', 'Vib', 'PI', 'CSI'].map(h => (
                          <th key={h} style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #334155' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liveHistory.slice(-15).reverse().map((r, i) => (
                        <tr key={r.id ?? i} style={{ borderBottom: '1px solid #1e3a5f' }}>
                          <td style={{ padding: '4px 6px', color: '#94a3b8' }}>{new Date(r.ts).toLocaleTimeString()}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#facc15' }}>{Math.round(r.light_lux ?? r.lightLux ?? 0)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#38bdf8' }}>{Math.round(r.sound_db ?? r.soundDb ?? 0)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#a78bfa' }}>{(r.vibration ?? 0).toFixed(2)}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#fb923c', fontWeight: 600 }}>{r.pollution_index ?? r.pollutionIndex ?? 0}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{r.cognitive_stress ?? r.cognitiveStress ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'Alerts' && (
          <>
            <Alerts
              items={alerts}
              isMonitoring={isMonitoring}
              pollutionIndex={displayPollutionIndex}
              cognitiveStress={displayCognitiveStress}
            />
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>💡 About Invisible Pollution</div>
              {[
                { icon: '💡', title: 'Light Pollution', text: 'Exposure to artificial light at night disrupts circadian rhythms, suppresses melatonin, and impairs sleep quality. Even 200 lux at night is considered moderate stress.' },
                { icon: '🔊', title: 'Noise Pollution', text: 'WHO guidelines recommend <45 dB at night for restful sleep. Prolonged exposure to >70 dB causes cardiovascular stress and cognitive fatigue.' },
                { icon: '📳', title: 'Vibration Pollution', text: 'Micro-vibrations from traffic, machinery, or construction cause physiological stress. ISO 2631 sets 0.5 m/s² as the discomfort threshold.' },
              ].map(({ icon, title, text }) => (
                <div key={title} style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>{title}</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, lineHeight: 1.5 }}>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'Profile' && <ProfilePage />}
      </main>

      <footer style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0f172a', borderTop: '1px solid #1e3a5f',
        padding: '8px 14px', display: 'flex', justifyContent: 'space-between',
        fontSize: 11, color: '#475569', zIndex: 1000,
      }}>
        <span>
          🎙 {mic.active ? `${mic.db} dB` : 'Off'} &nbsp;|&nbsp;
          📳 {accel.active ? `${accel.magnitude.toFixed(2)} m/s²` : 'Off'} &nbsp;|&nbsp;
          💡 {light.active ? `${light.lux} lux` : 'Off'}
        </span>
        <span>
          {geo.lat ? `📍 GPS ±${geo.accuracy}m` : '📍 No GPS'} &nbsp;|&nbsp;
          {isMonitoring ? <span style={{ color: '#22c55e' }}>● LIVE</span> : <span>■ Idle</span>}
        </span>
      </footer>
    </div>
  );
}

/** Root App – renders auth gate or main app based on session */
export default function App() {
  const { user, token } = useAuth();
  if (!user || !token) return <AuthPage />;
  return <MonitoringApp />;
}
