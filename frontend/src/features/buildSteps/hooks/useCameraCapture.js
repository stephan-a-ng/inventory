/**
 * useCameraCapture — getUserMedia + canvas → JPEG blob.
 *
 * Returns:
 *   videoRef     — bind to a <video> element
 *   start()      — request the rear camera and attach to videoRef
 *   stop()       — release the stream
 *   capture()    — resolves to a JPEG Blob (≤2048px long edge, q=0.85)
 *   isStreaming  — true once the stream is attached
 *   error        — last error, if any
 *   supported    — getUserMedia available
 *
 * Falls back to first available camera if "environment" facing is missing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_DIM = 2048;
const QUALITY = 0.85;

export function isCameraSupported() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

export default function useCameraCapture() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const supported = isCameraSupported();

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsStreaming(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError(new Error('Camera not supported in this browser'));
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Some browsers refuse autoplay without an explicit play() after srcObject set.
        try { await videoRef.current.play(); } catch { /* user-gesture required, that's OK */ }
      }
      setIsStreaming(true);
    } catch (e) {
      setError(e);
      setIsStreaming(false);
    }
  }, [supported]);

  const capture = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) throw new Error('Camera is not ready');
    const long = Math.max(v.videoWidth, v.videoHeight);
    const scale = Math.min(1, MAX_DIM / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Capture failed')),
        'image/jpeg',
        QUALITY,
      );
    });
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => stop(), [stop]);

  return { videoRef, start, stop, capture, isStreaming, error, supported };
}
