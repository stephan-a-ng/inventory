import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFetch } from './api';

describe('authFetch', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always sends credentials', async () => {
    globalThis.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await authFetch('/api/devices');
    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.credentials).toBe('include');
  });

  it('passes through method and headers', async () => {
    globalThis.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await authFetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/devices');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options.credentials).toBe('include');
  });

  it('returns the fetch response as-is', async () => {
    const r = new Response('{"ok":1}', { status: 200 });
    globalThis.fetch.mockResolvedValue(r);
    const result = await authFetch('/api/devices');
    expect(result).toBe(r);
  });
});
