/**
 * useAutoSave — debounce a value change and persist it via `onSave`.
 *
 * Returns { state, savedAt, error, flush } so callers can render a status
 * indicator ("Saved · 14:32"). `flush` triggers a save immediately, which
 * is useful for blur/keyboard-shortcut commits.
 *
 * Usage:
 *   const { state, savedAt } = useAutoSave({
 *     value: { title, description },
 *     onSave: (v) => updateBuildStep(id, v),
 *     delay: 600,
 *   });
 *
 * The hook treats the *first* render's value as the baseline — no save fires
 * until `value` changes. Saves are serialized: if a new value arrives mid-
 * save, the in-flight save completes, then the latest value is saved next.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export function useAutoSave({ value, onSave, delay = 600, equals }) {
  const [state, setState] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  const baselineRef = useRef(value);
  const latestRef = useRef(value);
  const timeoutRef = useRef(null);
  const inflightRef = useRef(false);
  const pendingRef = useRef(false);

  const compare = equals || ((a, b) => JSON.stringify(a) === JSON.stringify(b));

  const performSave = useCallback(async () => {
    if (inflightRef.current) {
      pendingRef.current = true;
      return;
    }
    inflightRef.current = true;
    setState('saving');
    setError(null);
    try {
      await onSave(latestRef.current);
      baselineRef.current = latestRef.current;
      setSavedAt(new Date());
      setState('saved');
    } catch (e) {
      setError(e);
      setState('error');
    } finally {
      inflightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // run another save with whatever the latest value is now
        performSave();
      }
    }
  }, [onSave]);

  // Schedule a debounced save whenever value changes from baseline.
  useEffect(() => {
    latestRef.current = value;
    if (compare(baselineRef.current, value)) return; // no-op: identical
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      performSave();
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // performSave is stable on onSave identity; consumers should memoize onSave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (!compare(baselineRef.current, latestRef.current)) {
      performSave();
    }
  }, [performSave]);

  return { state, savedAt, error, flush };
}

/** Format a Date as HH:MM:SS for the "Saved · 14:32:01" indicator. */
export function formatSavedAt(d) {
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
