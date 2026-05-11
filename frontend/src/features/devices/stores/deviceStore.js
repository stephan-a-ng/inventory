import { create } from 'zustand';

const useDeviceStore = create((set, get) => ({
  devices: [],
  total: 0,
  page: 1,
  pageSize: 50,
  loading: false,
  error: null,
  filters: {
    product_type: '',
    stage_id: '',
    search: '',
  },
  selectedIds: new Set(),
  stages: [],

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      page: 1,
    })),

  setPage: (page) => set({ page }),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  selectAll: () =>
    set((state) => ({
      selectedIds: new Set(state.devices.map((d) => d.id)),
    })),

  clearSelection: () => set({ selectedIds: new Set() }),

  fetchDevices: async () => {
    set({ loading: true, error: null });
    try {
      const { filters, page, pageSize } = get();
      const params = new URLSearchParams();
      if (filters.product_type) params.set('product_type', filters.product_type);
      if (filters.stage_id) params.set('stage_id', filters.stage_id);
      if (filters.search) params.set('search', filters.search);
      params.set('page', page.toString());
      params.set('page_size', pageSize.toString());

      const res = await fetch(`/api/devices?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch devices');
      const data = await res.json();
      set({ devices: data.devices, total: data.total, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  fetchStages: async () => {
    try {
      const res = await fetch('/api/stages', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        set({ stages: data });
      }
    } catch {
      // ignore
    }
  },
}));

export default useDeviceStore;
