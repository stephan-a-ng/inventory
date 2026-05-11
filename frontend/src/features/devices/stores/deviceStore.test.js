import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import useDeviceStore from './deviceStore';

describe('deviceStore', () => {
  beforeEach(() => {
    // Reset store between tests.
    useDeviceStore.setState({
      devices: [],
      total: 0,
      page: 1,
      pageSize: 50,
      loading: false,
      error: null,
      filters: { product_type: '', stage_id: '', search: '' },
      selectedIds: new Set(),
      stages: [],
    });
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('setFilter updates the filter and resets page to 1', () => {
    useDeviceStore.setState({ page: 5 });
    useDeviceStore.getState().setFilter('product_type', 'AEMS');
    const s = useDeviceStore.getState();
    expect(s.filters.product_type).toBe('AEMS');
    expect(s.page).toBe(1);
  });

  it('toggleSelect adds and removes ids', () => {
    const { toggleSelect } = useDeviceStore.getState();
    toggleSelect('a');
    toggleSelect('b');
    expect(useDeviceStore.getState().selectedIds.has('a')).toBe(true);
    expect(useDeviceStore.getState().selectedIds.has('b')).toBe(true);
    toggleSelect('a');
    expect(useDeviceStore.getState().selectedIds.has('a')).toBe(false);
  });

  it('selectAll selects every loaded device id', () => {
    useDeviceStore.setState({
      devices: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    useDeviceStore.getState().selectAll();
    expect([...useDeviceStore.getState().selectedIds]).toEqual(['a', 'b', 'c']);
  });

  it('clearSelection empties the selection', () => {
    useDeviceStore.setState({ selectedIds: new Set(['a', 'b']) });
    useDeviceStore.getState().clearSelection();
    expect(useDeviceStore.getState().selectedIds.size).toBe(0);
  });

  it('fetchDevices includes active filters in the query', async () => {
    globalThis.fetch.mockResolvedValue(
      new Response(JSON.stringify({ devices: [], total: 0 }), { status: 200 }),
    );
    useDeviceStore.setState({ filters: { product_type: 'AEMS', stage_id: '', search: 'X1' } });

    await useDeviceStore.getState().fetchDevices();

    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('product_type=AEMS');
    expect(url).toContain('search=X1');
    expect(url).not.toContain('stage_id=');
  });

  it('fetchDevices sets error on non-200 response', async () => {
    globalThis.fetch.mockResolvedValue(new Response('boom', { status: 500 }));
    await useDeviceStore.getState().fetchDevices();
    expect(useDeviceStore.getState().error).toBeTruthy();
    expect(useDeviceStore.getState().loading).toBe(false);
  });
});
