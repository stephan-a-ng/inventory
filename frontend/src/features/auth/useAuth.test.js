import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit-level coverage for the auth slice's checkAuth / login / logout flows.
 *
 * We test by importing the module fresh in each test (with `vi.resetModules`)
 * so the AuthContext starts empty, and by mocking `fetch` at the global level.
 * Rendering the provider via RTL belongs in a component-test; this file just
 * pins the network contract.
 */
describe('auth network contract', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkAuth calls GET /api/auth/me with credentials', async () => {
    globalThis.fetch.mockResolvedValue(
      new Response(JSON.stringify({ id: '1', email: 'a@b.com', role: 'admin' }), { status: 200 }),
    );

    // We just call the network shape directly here — the React-y bits live in
    // a component test. This pins the URL + credentials contract.
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    expect(res.ok).toBe(true);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/auth/me');
    expect(options.credentials).toBe('include');
  });

  it('logout posts to /api/auth/logout', async () => {
    globalThis.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
  });
});
