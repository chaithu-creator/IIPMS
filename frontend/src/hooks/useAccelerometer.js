/**
 * useAccelerometer – reads device motion (accelerometer) via DeviceMotionEvent.
 * Returns { magnitude, x, y, z, error, active }.
 * magnitude is in m/s².
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useAccelerometer() {
  const [data, setData] = useState({ x: 0, y: 0, z: 0, magnitude: 0 });
  const [error, setError] = useState(null);
  const [active, setActive] = useState(false);
  const handlerRef = useRef(null);

  const start = useCallback(async () => {
    if (!window.DeviceMotionEvent) {
      setError('DeviceMotionEvent not supported on this device/browser.');
      return;
    }

    // iOS 13+ requires permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') {
          setError('Motion sensor permission denied.');
          return;
        }
      } catch (e) {
        setError(e.message);
        return;
      }
    }

    handlerRef.current = (e) => {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      setData({ x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), magnitude: +magnitude.toFixed(3) });
    };

    window.addEventListener('devicemotion', handlerRef.current);
    setActive(true);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current);
    setActive(false);
    setData({ x: 0, y: 0, z: 0, magnitude: 0 });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { ...data, error, active, start, stop };
}
