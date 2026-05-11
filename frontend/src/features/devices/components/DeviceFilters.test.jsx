import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DeviceFilters from './DeviceFilters';
import useDeviceStore from '../stores/deviceStore';

describe('<DeviceFilters />', () => {
  beforeEach(() => {
    useDeviceStore.setState({
      filters: { product_type: '', stage_id: '', search: '' },
      stages: [
        { id: 's1', name: 'Assembly', product_type: 'AEMS' },
        { id: 's2', name: 'Firmware', product_type: 'AEMS' },
      ],
      page: 1,
    });
  });

  it('renders search, type filter, and stage filter', () => {
    render(<DeviceFilters />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    // Two selects: product_type + stage_id
    expect(screen.getAllByRole('combobox').length).toBe(2);
    expect(screen.getByText(/export csv/i)).toBeInTheDocument();
  });

  it('typing in search updates the store filter and resets page', async () => {
    const user = userEvent.setup();
    useDeviceStore.setState({ page: 7 });
    render(<DeviceFilters />);

    await user.type(screen.getByPlaceholderText(/search/i), 'AB');
    const state = useDeviceStore.getState();
    expect(state.filters.search).toBe('AB');
    expect(state.page).toBe(1);
  });

  it('selecting a product type updates the store', async () => {
    const user = userEvent.setup();
    render(<DeviceFilters />);

    const productSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(productSelect, 'AEMS');
    expect(useDeviceStore.getState().filters.product_type).toBe('AEMS');
  });

  it('renders an option for each stage in the store', () => {
    render(<DeviceFilters />);
    expect(screen.getByText(/Assembly \(AEMS\)/)).toBeInTheDocument();
    expect(screen.getByText(/Firmware \(AEMS\)/)).toBeInTheDocument();
  });
});
