import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAutoSave, formatSavedAt } from './useAutoSave';

// Real timers + short delays — vitest's fake timers don't compose cleanly
// with renderHook + state updates inside async effects (5s hangs).

describe('useAutoSave', () => {
  it('debounces rapid value changes into a single save with the latest value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delay: 30 }),
      { initialProps: { value: { title: 'a' } } },
    );

    expect(result.current.state).toBe('idle');

    rerender({ value: { title: 'b' } });
    rerender({ value: { title: 'c' } });
    expect(onSave).not.toHaveBeenCalled();

    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 500 });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith({ title: 'c' });

    await waitFor(() => expect(result.current.state).toBe('saved'));
    expect(result.current.savedAt).toBeInstanceOf(Date);
  });

  it('flush() forces an immediate save and skips when nothing has changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delay: 1000 }),
      { initialProps: { value: { title: 'a' } } },
    );

    await act(async () => { result.current.flush(); });
    expect(onSave).not.toHaveBeenCalled();

    rerender({ value: { title: 'b' } });
    await act(async () => { result.current.flush(); });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenLastCalledWith({ title: 'b' });
  });

  it('captures errors and exposes state=error', async () => {
    const err = new Error('boom');
    const onSave = vi.fn().mockRejectedValue(err);
    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delay: 30 }),
      { initialProps: { value: 1 } },
    );

    rerender({ value: 2 });
    await waitFor(() => expect(result.current.state).toBe('error'), { timeout: 500 });
    expect(result.current.error).toBe(err);
  });

  it('formatSavedAt renders HH:MM(:SS) or empty', () => {
    expect(formatSavedAt(null)).toBe('');
    const d = new Date(2026, 0, 1, 14, 32, 5);
    const s = formatSavedAt(d);
    expect(s).toMatch(/\d{2}:\d{2}/);
  });
});
