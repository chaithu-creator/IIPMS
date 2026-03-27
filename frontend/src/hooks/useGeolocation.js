/**
 * useGeolocation – watches GPS position in real time.
 * Returns { lat, lng, accuracy, error, active }.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useGeolocation() {
  const [position, setPosition] = useState({ lat: null, lng: null, accuracy: null });
  const [error, setError] = useState(null);
  const [active, setActive] = useState(false);
  const watchIdRef = useRef(null);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser.');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setActive(true);
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setActive(false);
    setPosition({ lat: null, lng: null, accuracy: null });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { ...position, error, active, start, stop };
}
