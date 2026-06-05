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
  const smoothedDbRef = useRef(32);
  const floorDbRef = useRef(32);
  const calibrationCountRef = useRef(0);
  const calibrationSumRef = useRef(0);

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

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
        // RMS amplitude -> dBFS -> approximate dB SPL.
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] ** 2;
        const rms = Math.sqrt(sum / dataArray.length);

        const rawDb = rms > 0
          ? clamp(20 * Math.log10(rms) + 90, 20, 120)
          : 20;

        // Calibrate baseline for the first ~2 seconds.
        if (calibrationCountRef.current < 60) {
          calibrationCountRef.current += 1;
          calibrationSumRef.current += rawDb;
          floorDbRef.current = calibrationSumRef.current / calibrationCountRef.current;
        } else if (rawDb <= floorDbRef.current + 3) {
          // Slowly adapt floor when environment gets quieter.
          floorDbRef.current = floorDbRef.current + (rawDb - floorDbRef.current) * 0.02;
        }

        // Shift floor near 32 dB so quiet rooms stay in a realistic band.
        const floorOffset = floorDbRef.current - 32;
        const normalizedDb = clamp(rawDb - floorOffset, 20, 120);
        const smoothedDb = smoothedDbRef.current + (normalizedDb - smoothedDbRef.current) * 0.25;
        smoothedDbRef.current = smoothedDb;

        setDb(Math.round(clamp(smoothedDb, 25, 120)));
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
    smoothedDbRef.current = 32;
    floorDbRef.current = 32;
    calibrationCountRef.current = 0;
    calibrationSumRef.current = 0;
    setActive(false);
    setDb(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { db, error, active, start, stop };
}
