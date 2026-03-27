/**
 * Pollution Index and Cognitive Stress Index utilities.
 * Mirrors the backend logic so values are consistent.
 */

export const THRESHOLDS = {
  light: { good: 200, moderate: 500, poor: 1000, hazardous: 5000 },
  sound: { good: 45, moderate: 55, poor: 70, hazardous: 90 },
  vibration: { good: 0.2, moderate: 0.5, poor: 1.0, hazardous: 2.0 },
  pollutionIndex: { good: 25, moderate: 50, poor: 75 },
  cognitiveStress: { good: 20, moderate: 40, poor: 60 },
};

export function calcPollutionIndex({ lightLux = 0, soundDb = 0, vibration = 0 }) {
  const lightNorm = Math.min((lightLux / 10000) * 100, 100);
  const soundNorm = Math.min(Math.max(((soundDb - 30) / 90) * 100, 0), 100);
  const vibNorm   = Math.min((vibration / 2) * 100, 100);
  const pi = soundNorm * 0.4 + lightNorm * 0.35 + vibNorm * 0.25;
  return Math.round(pi * 10) / 10;
}

export function calcCognitiveStress({ lightLux = 0, soundDb = 0, vibration = 0 }) {
  const lightStress = lightLux > 1000 ? Math.min((lightLux - 1000) / 9000, 1) * 40 : 0;
  const soundStress = soundDb > 55    ? Math.min((soundDb - 55) / 65, 1) * 40 : 0;
  const vibStress   = vibration > 0.5 ? Math.min((vibration - 0.5) / 1.5, 1) * 20 : 0;
  return Math.round((lightStress + soundStress + vibStress) * 10) / 10;
}

export function levelFromValue(value, thresholds) {
  if (value <= thresholds.good)     return 'good';
  if (value <= thresholds.moderate) return 'moderate';
  if (value <= thresholds.poor)     return 'poor';
  return 'hazardous';
}

export function levelColor(level) {
  return { good: '#22c55e', moderate: '#facc15', poor: '#fb923c', hazardous: '#ef4444' }[level] || '#94a3b8';
}

export function levelLabel(level) {
  return { good: 'Good', moderate: 'Moderate', poor: 'Poor', hazardous: 'Hazardous' }[level] || 'Unknown';
}
