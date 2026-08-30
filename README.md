# IIPMS – Intelligent Invisible Pollution Mapping System

A full-stack, real-time environmental monitoring Progressive Web App (PWA) that detects, analyzes, and visualizes **invisible pollution** — light pollution, vibration pollution, and mental noise pollution — using your smartphone's built-in sensors.

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 📡 **Real Sensor Data** | Microphone (sound dB), Accelerometer (vibration m/s²), Ambient Light / Camera (lux), GPS |
| 🎯 **Pollution Index** | Weighted composite score (0–100) from all three pollution types |
| 🧠 **Cognitive Stress Index** | AI-calculated stress score based on WHO/ISO threshold exceedances |
| 🗺️ **GIS Heatmap** | Leaflet.js interactive map with pollution intensity overlay |
| 📈 **Trend Graphs** | Recharts hourly trend lines for PI, CSI, Sound |
| 🔔 **Smart Alerts** | Context-aware recommendations (sleep timing, quiet routes, etc.) |
| ⚡ **Real-time Updates** | Socket.io pushes live readings to all connected clients |
| 📱 **PWA** | Installable on Android/iOS, works offline |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser / Mobile PWA (React + Vite)            │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐  │
│  │Microphone │ │Accel.    │ │Ambient Light   │  │
│  │Web Audio  │ │DevMotion │ │Sensor / Camera │  │
│  └─────┬─────┘ └────┬─────┘ └───────┬────────┘  │
│        └────────────┴───────────────┘           │
│                      │ GPS                       │
│               Pollution Engine                   │
│          (PI + CSI calculation)                  │
└──────────────────────┬──────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────┐
│  Node.js / Express Backend                      │
│  ┌───────────┐  ┌──────────┐  ┌─────────────┐   │
│  │REST API   │  │Socket.io │  │SQLite DB    │   │
│  │/readings  │  │real-time │  │(readings)   │   │
│  │/stats     │  │broadcast │  │             │   │
│  │/trend     │  └──────────┘  └─────────────┘   │
│  │/heatmap   │                                   │
│  └───────────┘                                   │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- Modern mobile browser (Chrome on Android recommended for full sensor access)

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Start the backend
```bash
npm run dev:backend
# Backend runs on http://localhost:4000
```

### 3. Start the frontend (new terminal)
```bash
npm run dev:frontend
# Frontend runs on http://localhost:5173
```

### 4. Open on your phone
1. Make sure your phone is on the **same WiFi network** as your computer
2. Open `http://<your-computer-ip>:5173` on your phone
3. Grant microphone, motion, and camera/light sensor permissions
4. Tap **Start Monitoring**

---

## 📱 Sensor Details

| Sensor | Web API | Permission Required | Fallback |
|--------|---------|---------------------|---------|
| 🔊 Sound | `getUserMedia` + Web Audio API | Microphone | None |
| 📳 Vibration | `DeviceMotionEvent` | Auto / iOS 13+ requires permission tap | None |
| 💡 Light | `AmbientLightSensor` | Camera (fallback) | Camera luminance estimation |
| 📍 Location | `navigator.geolocation` | Location | No heatmap data |

> **Note:** For full sensor access, open the app on a mobile device (Android/iOS) in Chrome. Desktop browsers have limited sensor support.

---

## 🔬 Pollution Indices

### Pollution Index (PI)
```
PI = (Sound_norm × 0.40) + (Light_norm × 0.35) + (Vibration_norm × 0.25)
```
Where each sensor is normalized to 0–100 against WHO/ISO reference maximums.

| Level | PI Range | Interpretation |
|-------|---------|----------------|
| 🟢 Good | 0–25 | Minimal stress, ideal for sleep/focus |
| 🟡 Moderate | 26–50 | Some environmental stress |
| 🟠 Poor | 51–75 | Significant stress, avoid prolonged exposure |
| 🔴 Hazardous | 76–100 | High stress, relocate immediately |

### Cognitive Stress Index (CSI)
Measures the **excess above comfort thresholds** that directly impacts cognitive function:
- Light > 1000 lux → up to +40 points
- Sound > 55 dB → up to +40 points
- Vibration > 0.5 m/s² → up to +20 points

---

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/readings` | POST | Store a sensor reading |
| `/api/readings` | GET | Latest readings (default: 200) |
| `/api/readings/heatmap` | GET | GPS + intensity for heatmap |
| `/api/readings/trend` | GET | Hourly aggregates for trend chart |
| `/api/stats` | GET | Aggregate session statistics |
| `/api/recommendations` | GET | Smart recommendations based on recent data |

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Recharts, Leaflet.js, Socket.io-client
- **Backend**: Node.js, Express, Socket.io, better-sqlite3
- **PWA**: vite-plugin-pwa, Workbox
- **Maps**: Leaflet + custom canvas heatmap + OpenStreetMap tiles

---

## 📜 References

- WHO Environmental Noise Guidelines for the European Region (2018)
- ISO 2631-1: Mechanical vibration and shock — human response to whole-body vibration
- WHO Artificial Light at Night Recommendations
