/**
 * useLightSensor – uses the AmbientLightSensor API where available,
 * or falls back to camera-based luminance estimation.
 * Returns { lux, error, active, supported }.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useLightSensor() {
  const [lux, setLux] = useState(0);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const sensorRef = useRef(null);

  const start = useCallback(async () => {
    // Primary: AmbientLightSensor API (Chrome on Android with feature flag / certain devices)
    if ('AmbientLightSensor' in window) {
      try {
        const sensor = new window.AmbientLightSensor({ frequency: 2 });
        sensor.addEventListener('reading', () => {
          setLux(Math.round(sensor.illuminance));
        });
        sensor.addEventListener('error', (e) => {
          setError(e.error ? e.error.message : 'Sensor error');
        });
        sensor.start();
        sensorRef.current = sensor;
        setActive(true);
        setSupported(true);
        setError(null);
        return;
      } catch (e) {
        // Fall through to fallback
      }
    }

    // Fallback: estimate via camera (video frame luminance)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Light sensor not available on this device.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 64, height: 64 },
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      const interval = setInterval(() => {
        ctx.drawImage(video, 0, 0, 64, 64);
        const img = ctx.getImageData(0, 0, 64, 64);
        let sum = 0;
        for (let i = 0; i < img.data.length; i += 4) {
          // Luminance formula
          sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
        }
        const avgLuminance = sum / (64 * 64); // 0–255
        // Map 0–255 luminance to approximate lux (very rough)
        const approxLux = Math.round((avgLuminance / 255) * 10000);
        setLux(approxLux);
      }, 500);

      sensorRef.current = { _stream: stream, _interval: interval };
      setActive(true);
      setSupported(true);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const stop = useCallback(() => {
    if (sensorRef.current) {
      if (sensorRef.current.stop) {
        sensorRef.current.stop();
      } else {
        clearInterval(sensorRef.current._interval);
        sensorRef.current._stream?.getTracks().forEach(t => t.stop());
      }
    }
    setActive(false);
    setLux(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { lux, error, active, supported, start, stop };
}
