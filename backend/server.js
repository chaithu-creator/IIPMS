import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'iipms-dev-secret-change-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET env var is not set – using insecure default. Set JWT_SECRET in production!');
}

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

// ── Rate limiting ─────────────────────────────────────────────────────────────
const readLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 120,               // 120 reads per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 60,                // 60 writes per minute per IP (one every second)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// ── Storage setup (JSON file to avoid native DB build requirements) ─────────
const DB_FILE = path.join(__dirname, 'db', 'iipms.json');

function initialState() {
  return {
    users: [],
    readings: [],
    nextUserId: 1,
    nextReadingId: 1,
  };
}

function loadState() {
  try {
    if (!fs.existsSync(DB_FILE)) return initialState();
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw.trim()) return initialState();
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      readings: Array.isArray(parsed.readings) ? parsed.readings : [],
      nextUserId: Number(parsed.nextUserId) || 1,
      nextReadingId: Number(parsed.nextReadingId) || 1,
    };
  } catch {
    return initialState();
  }
}

function persistState() {
  fs.mkdirSync(path.join(__dirname, 'db'), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

function round(value, precision = 1) {
  if (value === null || value === undefined) return null;
  const p = 10 ** precision;
  return Math.round(value * p) / p;
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeReadingPayload(payload) {
  const rawLight = Number(payload.lightLux);
  const rawSound = Number(payload.soundDb);
  const rawVib = Number(payload.vibration);
  const rawLat = payload.lat === undefined || payload.lat === null ? null : Number(payload.lat);
  const rawLng = payload.lng === undefined || payload.lng === null ? null : Number(payload.lng);

  if (!isFiniteNumber(rawLight) || !isFiniteNumber(rawSound) || !isFiniteNumber(rawVib)) {
    return null;
  }

  return {
    lightLux: round(clamp(rawLight, 0, 120_000), 1),
    soundDb: round(clamp(rawSound, 20, 140), 1),
    vibration: round(clamp(rawVib, 0, 50), 3),
    lat: isFiniteNumber(rawLat) ? round(clamp(rawLat, -90, 90), 6) : null,
    lng: isFiniteNumber(rawLng) ? round(clamp(rawLng, -180, 180), 6) : null,
  };
}

const clientSmoothing = new Map();

function smoothByClient(clientKey, values) {
  const previous = clientSmoothing.get(clientKey);
  if (!previous) {
    clientSmoothing.set(clientKey, values);
    return values;
  }

  const smoothed = {
    ...values,
    // EMA smoothing: keeps real signal while reducing jitter.
    lightLux: round(previous.lightLux + (values.lightLux - previous.lightLux) * 0.25, 1),
    soundDb: round(previous.soundDb + (values.soundDb - previous.soundDb) * 0.35, 1),
    vibration: round(previous.vibration + (values.vibration - previous.vibration) * 0.35, 3),
  };
  clientSmoothing.set(clientKey, smoothed);
  return smoothed;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

let state = loadState();
persistState();

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

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Auth REST API ─────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', writeLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const normalizedEmail = email.toLowerCase();
  const existing = state.users.find(u => u.email === normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const hashed = await bcrypt.hash(password, 12);
  const newUser = {
    id: state.nextUserId++,
    email: normalizedEmail,
    name: name.trim(),
    password: hashed,
    location: null,
    alerts_email: 0,
    created_at: Date.now(),
  };
  state.users.push(newUser);
  persistState();
  const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: sanitizeUser(newUser) });
});

// POST /api/auth/login
app.post('/api/auth/login', writeLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = state.users.find(u => u.email === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: sanitizeUser(user) });
});

// GET /api/auth/me
app.get('/api/auth/me', readLimiter, requireAuth, (req, res) => {
  const user = state.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(sanitizeUser(user));
});

// PUT /api/auth/profile  – update name / location / alerts preference
app.put('/api/auth/profile', writeLimiter, requireAuth, (req, res) => {
  const { name, location, alerts_email } = req.body;
  const user = state.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  let changed = false;
  if (name !== undefined) {
    user.name = name.trim();
    changed = true;
  }
  if (location !== undefined) {
    user.location = location.trim();
    changed = true;
  }
  if (alerts_email !== undefined) {
    user.alerts_email = alerts_email ? 1 : 0;
    changed = true;
  }
  if (!changed) return res.status(400).json({ error: 'Nothing to update' });
  persistState();
  res.json(sanitizeUser(user));
});

// ── REST API ──────────────────────────────────────────────────────────────────

// POST /api/readings  – store a new sensor reading
app.post('/api/readings', writeLimiter, (req, res) => {
  const parsed = sanitizeReadingPayload(req.body ?? {});
  if (!parsed) {
    return res.status(400).json({ error: 'Invalid sensor fields' });
  }

  const clientKey = req.header('x-client-id') || req.ip || 'unknown';
  const { lat, lng, lightLux, soundDb, vibration } = smoothByClient(clientKey, parsed);

  const pi  = calcPollutionIndex({ lightLux, soundDb, vibration });
  const csi = calcCognitiveStress({ lightLux, soundDb, vibration });
  const ts  = Date.now();

  const row = {
    id: state.nextReadingId++,
    ts,
    lat: lat ?? null,
    lng: lng ?? null,
    light_lux: lightLux,
    sound_db: soundDb,
    vibration,
    pollution_index: pi,
    cognitive_stress: csi,
  };
  state.readings.push(row);
  persistState();

  const reading = { ts, lat, lng, lightLux, soundDb, vibration, pollutionIndex: pi, cognitiveStress: csi };

  // Broadcast to all connected sockets
  io.emit('reading', reading);

  res.json(reading);
});

// GET /api/readings?limit=200  – latest readings
app.get('/api/readings', readLimiter, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const rows = [...state.readings]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
  res.json(rows.reverse());
});

// GET /api/readings/heatmap  – lat/lng + pollution_index for heatmap
app.get('/api/readings/heatmap', readLimiter, (req, res) => {
  const rows = [...state.readings]
    .filter(r => r.lat !== null && r.lng !== null)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 1000)
    .map(r => ({ lat: r.lat, lng: r.lng, intensity: r.pollution_index }));
  res.json(rows);
});

// GET /api/stats  – aggregate statistics
app.get('/api/stats', readLimiter, (req, res) => {
  const all = state.readings;
  const row = {
    total: all.length,
    avgPI: round(avg(all.map(r => r.pollution_index)), 1),
    maxPI: all.length ? round(Math.max(...all.map(r => r.pollution_index)), 1) : null,
    avgCSI: round(avg(all.map(r => r.cognitive_stress)), 1),
    avgLight: round(avg(all.map(r => r.light_lux)), 1),
    avgSound: round(avg(all.map(r => r.sound_db)), 1),
    avgVib: round(avg(all.map(r => r.vibration)), 3),
  };
  res.json(row);
});

// GET /api/readings/trend?hours=24  – hourly aggregates for trend graph
app.get('/api/readings/trend', readLimiter, (req, res) => {
  const hours  = Math.min(Number(req.query.hours) || 24, 168);
  const bucketMs = req.query.bucket === 'hour' ? 3_600_000 : 60_000;
  const since  = Date.now() - hours * 3_600_000;

  const grouped = new Map();
  for (const r of state.readings) {
    if (r.ts < since) continue;
    const bucketTs = Math.floor(r.ts / bucketMs) * bucketMs;
    const bucket = grouped.get(bucketTs) || {
      bucket_ts: bucketTs,
      pi: [],
      csi: [],
      light: [],
      sound: [],
      vib: [],
      count: 0,
    };
    bucket.pi.push(r.pollution_index);
    bucket.csi.push(r.cognitive_stress);
    bucket.light.push(r.light_lux);
    bucket.sound.push(r.sound_db);
    bucket.vib.push(r.vibration);
    bucket.count += 1;
    grouped.set(bucketTs, bucket);
  }

  const rows = [...grouped.values()]
    .sort((a, b) => a.bucket_ts - b.bucket_ts)
    .map(b => ({
      bucket_ts: b.bucket_ts,
      // Keep compatibility with existing frontend field name.
      hour_ts: b.bucket_ts,
      avgPI: round(avg(b.pi), 1),
      avgCSI: round(avg(b.csi), 1),
      avgLight: round(avg(b.light), 1),
      avgSound: round(avg(b.sound), 1),
      avgVib: round(avg(b.vib), 3),
      count: b.count,
    }));

  res.json(rows);
});

// GET /api/recommendations  – based on recent averages
app.get('/api/recommendations', readLimiter, (req, res) => {
  const recentRows = [...state.readings]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 20);
  const recent = {
    l: avg(recentRows.map(r => r.light_lux)),
    s: avg(recentRows.map(r => r.sound_db)),
    v: avg(recentRows.map(r => r.vibration)),
    pi: avg(recentRows.map(r => r.pollution_index)),
  };

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
  const history = [...state.readings]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 50);
  socket.emit('history', history.reverse());

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Serve React frontend static files ────────────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const FRONTEND_INDEX = path.join(FRONTEND_DIST, 'index.html');
const hasFrontendBuild = fs.existsSync(FRONTEND_INDEX);

if (hasFrontendBuild) {
  app.use(express.static(FRONTEND_DIST));
} else {
  console.warn(`⚠️  Frontend build not found at ${FRONTEND_INDEX}. Run "npm run build --prefix frontend" for production static serving.`);
}

// SPA fallback – serve index.html for non-API routes
app.get(/^(?!\/api).*/, readLimiter, (req, res) => {
  if (!hasFrontendBuild) {
    return res.status(503).json({
      error: 'Frontend build not found. Start frontend dev server (npm run dev --prefix frontend) or build frontend for backend static serving.',
    });
  }
  res.sendFile(FRONTEND_INDEX);
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`IIPMS backend running on http://localhost:${PORT}`);
});
