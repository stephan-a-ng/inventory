import { useRef, useState, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

export default function useScanner({ onResult, enabled = true }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState(null);
  const lastResultRef = useRef('');
  const lastResultTimeRef = useRef(0);

  const startScanning = useCallback(async () => {
    if (!videoRef.current || !enabled) return;

    try {
      setError(null);
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      // Prefer rear camera
      const rearCamera = devices.find((d) =>
        d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear')
      );
      const deviceId = rearCamera?.deviceId || devices[0]?.deviceId;

      if (!deviceId) {
        setError('No camera found');
        return;
      }

      await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
        if (result) {
          const text = result.getText();
          const now = Date.now();
          // Debounce: ignore same result within 2 seconds
          if (text !== lastResultRef.current || now - lastResultTimeRef.current > 2000) {
            lastResultRef.current = text;
            lastResultTimeRef.current = now;
            onResult?.(text);
          }
        }
      });
    } catch (err) {
      setError(err.message || 'Failed to start camera');
    }
  }, [enabled, onResult]);

  useEffect(() => {
    if (enabled) {
      startScanning();
    }
    return () => {
      if (readerRef.current) {
        // Stop all video tracks
        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        }
      }
    };
  }, [enabled, startScanning]);

  return { videoRef, error };
}
