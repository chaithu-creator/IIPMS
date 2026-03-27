/**
 * useMicrophone – captures real-time sound levels via the Web Audio API.
 * Returns { db, error, active }.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function useMicrophone() {
  const [db, setDb] = useState(0);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(false);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      setActive(true);
      setError(null);

      const dataArray = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(dataArray);
        // RMS amplitude → dB SPL (rough approximation)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] ** 2;
        const rms = Math.sqrt(sum / dataArray.length);
        // RMS amplitude → dB SPL approximation.
        // Reference: 0.00002 Pa (20 µPa) is the threshold of human hearing (0 dB SPL).
        // The +20 offset accounts for Web Audio normalisation range (-1 to 1 ≈ 94 dB SPL).
        // Floor at 30 dB (quiet room) and cap at 120 dB (pain threshold).
        const dbValue = rms > 0 ? Math.min(20 * Math.log10(rms / 0.00002) + 20, 120) : 30;
        setDb(Math.max(Math.round(dbValue), 30));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    setActive(false);
    setDb(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { db, error, active, start, stop };
}
