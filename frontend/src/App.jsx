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
import { calcPollutionIndex, calcCognitiveStress } from './utils/pollution.js';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

const TABS = ['Dashboard', 'Heatmap', 'Trends', 'Alerts', 'Profile'];

function Header({ isMonitoring, onToggle, lastTs, user, onProfile }) {
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
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', lineHeight: 1.2 }}>🌿 IIPMS</h1>
        <p style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>Invisible Pollution Monitor</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isMonitoring && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {lastTs ? new Date(lastTs).toLocaleTimeString() : 'Waiting…'}
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

  const socketRef  = useRef(null);
  const intervalRef = useRef(null);

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

  const pollutionIndex  = calcPollutionIndex({ lightLux: light.lux, soundDb: mic.db, vibration: accel.magnitude });
  const cognitiveStress = calcCognitiveStress({ lightLux: light.lux, soundDb: mic.db, vibration: accel.magnitude });

  const fetchStats = useCallback(async () => {
    try {
      const [s, a, t, h] = await Promise.all([
        fetch(`${API_BASE}/stats`).then(r => r.json()),
        fetch(`${API_BASE}/recommendations`).then(r => r.json()),
        fetch(`${API_BASE}/readings/trend`).then(r => r.json()),
        fetch(`${API_BASE}/readings/heatmap`).then(r => r.json()),
      ]);
      setStats(s);
      setAlerts(Array.isArray(a) ? a : []);
      setTrendData(t);
      setHeatPoints(h);
    } catch (e) {
      console.error('Fetch error', e);
    }
  }, []);

  const sendReading = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: geo.lat, lng: geo.lng,
          lightLux: light.lux, soundDb: mic.db, vibration: accel.magnitude,
        }),
      });
    } catch (e) {
      console.error('Send error', e);
    }
  }, [geo.lat, geo.lng, light.lux, mic.db, accel.magnitude]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('history', data => setLiveHistory(data.slice(-50)));
    socket.on('reading', reading => {
      setLastTs(reading.ts);
      setLiveHistory(prev => [...prev.slice(-49), reading]);
    });
    fetchStats();
    return () => socket.disconnect();
  }, [fetchStats]);

  const handleToggle = useCallback(async () => {
    if (isMonitoring) {
      clearInterval(intervalRef.current);
      mic.stop(); accel.stop(); light.stop(); geo.stop();
      setIsMonitoring(false);
      fetchStats();
    } else {
      await Promise.all([mic.start(), accel.start(), light.start(), geo.start()]);
      setIsMonitoring(true);
      intervalRef.current = setInterval(() => { sendReading(); fetchStats(); }, 3000);
    }
  }, [isMonitoring, mic, accel, light, geo, sendReading, fetchStats]);

  useEffect(() => {
    if (!isMonitoring) return;
  }, [isMonitoring, sendReading]);

  const mapCenter = geo.lat ? [geo.lat, geo.lng] : [20.5937, 78.9629];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        isMonitoring={isMonitoring}
        onToggle={handleToggle}
        lastTs={lastTs}
        user={user}
        onProfile={() => setActiveTab('Profile')}
      />
      <TabBar active={activeTab} onChange={setActiveTab} />

      <main style={{ flex: 1, padding: '14px 14px 80px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <PermissionNote errors={sensorErrors} />

        {activeTab === 'Dashboard' && (
          <>
            <Dashboard
              lux={light.lux} db={mic.db} vibration={accel.magnitude}
              pollutionIndex={pollutionIndex} cognitiveStress={cognitiveStress} stats={stats}
            />
            <SensorStatus lux={light.lux} db={mic.db} vibration={accel.magnitude} lat={geo.lat} lng={geo.lng} />
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
          <HeatMap center={mapCenter} zoom={geo.lat ? 15 : 5} points={heatPoints} userLat={geo.lat} userLng={geo.lng} />
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
            <Alerts items={alerts} isMonitoring={isMonitoring} pollutionIndex={pollutionIndex} cognitiveStress={cognitiveStress} />
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
