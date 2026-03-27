import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ── Database setup ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'db', 'iipms.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    lat         REAL,
    lng         REAL,
    light_lux   REAL,
    sound_db    REAL,
    vibration   REAL,
    pollution_index   REAL,
    cognitive_stress  REAL
  );

  CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);
`);

// ── Pollution index calculation ───────────────────────────────────────────────
function calcPollutionIndex({ lightLux = 0, soundDb = 0, vibration = 0 }) {
  // Normalize each sensor to 0–100 scale
  // Light: 0 lux=0, 10000 lux=100 (WHO guideline: <200 lux at night)
  const lightNorm = Math.min((lightLux / 10000) * 100, 100);

  // Sound: 30 dB=0, 120 dB=100 (WHO guideline: <55 dB day, <45 night)
  const soundNorm = Math.min(Math.max(((soundDb - 30) / 90) * 100, 0), 100);

  // Vibration: 0=0, 2 m/s²=100 (ISO 2631 threshold ~0.5 m/s²)
  const vibNorm = Math.min((vibration / 2) * 100, 100);

  // Weighted average: sound 40%, light 35%, vibration 25%
  const pi = soundNorm * 0.4 + lightNorm * 0.35 + vibNorm * 0.25;
  return Math.round(pi * 10) / 10;
}

function calcCognitiveStress({ lightLux = 0, soundDb = 0, vibration = 0 }) {
  // Penalise variability proxy by using thresholds that cause cognitive load
  const lightStress = lightLux > 1000 ? Math.min((lightLux - 1000) / 9000, 1) * 40 : 0;
  const soundStress = soundDb > 55 ? Math.min((soundDb - 55) / 65, 1) * 40 : 0;
  const vibStress   = vibration > 0.5 ? Math.min((vibration - 0.5) / 1.5, 1) * 20 : 0;
  const csi = lightStress + soundStress + vibStress;
  return Math.round(csi * 10) / 10;
}

// ── REST API ──────────────────────────────────────────────────────────────────

// POST /api/readings  – store a new sensor reading
app.post('/api/readings', (req, res) => {
  const { lat, lng, lightLux, soundDb, vibration } = req.body;

  if (lightLux === undefined || soundDb === undefined || vibration === undefined) {
    return res.status(400).json({ error: 'Missing sensor fields' });
  }

  const pi  = calcPollutionIndex({ lightLux, soundDb, vibration });
  const csi = calcCognitiveStress({ lightLux, soundDb, vibration });
  const ts  = Date.now();

  db.prepare(
    `INSERT INTO readings (ts, lat, lng, light_lux, sound_db, vibration, pollution_index, cognitive_stress)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ts, lat ?? null, lng ?? null, lightLux, soundDb, vibration, pi, csi);

  const reading = { ts, lat, lng, lightLux, soundDb, vibration, pollutionIndex: pi, cognitiveStress: csi };

  // Broadcast to all connected sockets
  io.emit('reading', reading);

  res.json(reading);
});

// GET /api/readings?limit=200  – latest readings
app.get('/api/readings', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const rows  = db.prepare('SELECT * FROM readings ORDER BY ts DESC LIMIT ?').all(limit);
  res.json(rows.reverse());
});

// GET /api/readings/heatmap  – lat/lng + pollution_index for heatmap
app.get('/api/readings/heatmap', (req, res) => {
  const rows = db.prepare(
    `SELECT lat, lng, pollution_index AS intensity
     FROM readings
     WHERE lat IS NOT NULL AND lng IS NOT NULL
     ORDER BY ts DESC LIMIT 1000`
  ).all();
  res.json(rows);
});

// GET /api/stats  – aggregate statistics
app.get('/api/stats', (req, res) => {
  const row = db.prepare(`
    SELECT
      COUNT(*)                         AS total,
      ROUND(AVG(pollution_index),1)    AS avgPI,
      ROUND(MAX(pollution_index),1)    AS maxPI,
      ROUND(AVG(cognitive_stress),1)   AS avgCSI,
      ROUND(AVG(light_lux),1)          AS avgLight,
      ROUND(AVG(sound_db),1)           AS avgSound,
      ROUND(AVG(vibration),3)          AS avgVib
    FROM readings
  `).get();
  res.json(row);
});

// GET /api/readings/trend?hours=24  – hourly aggregates for trend graph
app.get('/api/readings/trend', (req, res) => {
  const hours  = Math.min(Number(req.query.hours) || 24, 168);
  const since  = Date.now() - hours * 3_600_000;

  const rows = db.prepare(`
    SELECT
      (ts / 3600000) * 3600000 AS hour_ts,
      ROUND(AVG(pollution_index),1)  AS avgPI,
      ROUND(AVG(cognitive_stress),1) AS avgCSI,
      ROUND(AVG(light_lux),1)        AS avgLight,
      ROUND(AVG(sound_db),1)         AS avgSound,
      ROUND(AVG(vibration),3)        AS avgVib,
      COUNT(*)                       AS count
    FROM readings
    WHERE ts >= ?
    GROUP BY hour_ts
    ORDER BY hour_ts ASC
  `).all(since);

  res.json(rows);
});

// GET /api/recommendations  – based on recent averages
app.get('/api/recommendations', (req, res) => {
  const recent = db.prepare(
    `SELECT AVG(light_lux) AS l, AVG(sound_db) AS s, AVG(vibration) AS v, AVG(pollution_index) AS pi
     FROM (SELECT * FROM readings ORDER BY ts DESC LIMIT 20)`
  ).get();

  const recs = [];
  if (!recent || recent.l === null) {
    recs.push({ type: 'info', message: 'Start monitoring to receive personalised recommendations.' });
  } else {
    if (recent.l > 200)  recs.push({ type: 'warning', message: `Light level ${Math.round(recent.l)} lux – dim your screen or use blue-light filter at night.` });
    if (recent.s > 55)   recs.push({ type: 'danger',  message: `Sound level ${Math.round(recent.s)} dB – move to a quieter area or use noise-cancelling headphones.` });
    if (recent.v > 0.5)  recs.push({ type: 'warning', message: `Vibration ${recent.v.toFixed(2)} m/s² detected – reduce machinery exposure or take a break.` });
    if (recent.pi > 60)  recs.push({ type: 'danger',  message: `High Pollution Index (${recent.pi}) – this environment may cause stress. Consider relocating.` });
    if (recent.pi <= 30) recs.push({ type: 'success', message: `Low Pollution Index (${recent.pi}) – great environment! Ideal for focused work or sleep.` });
    if (recs.length === 0) recs.push({ type: 'success', message: 'Environment within comfortable levels. Stay hydrated and take regular breaks.' });
  }

  res.json(recs);
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send last 50 readings immediately on connect
  const history = db.prepare('SELECT * FROM readings ORDER BY ts DESC LIMIT 50').all();
  socket.emit('history', history.reverse());

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Serve React frontend static files ────────────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));

// SPA fallback – serve index.html for non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`IIPMS backend running on http://localhost:${PORT}`);
});
