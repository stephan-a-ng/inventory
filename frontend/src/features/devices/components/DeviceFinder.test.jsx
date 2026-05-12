import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import DeviceFinder from './DeviceFinder';
import useDeviceStore from '../stores/deviceStore';

// Capture navigations from react-router so we can assert on them without a Routes tree.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderFinder() {
  return render(
    <MemoryRouter>
      <DeviceFinder />
    </MemoryRouter>,
  );
}

const sampleDevice = {
  id: 'dev-1',
  mac_address: 'A4:CF:12:8B:3D:E2',
  device_name: 'CHG-2406-0817',
  product_type: 'EVSE',
  current_stage_name: 'Calibration',
};

describe('<DeviceFinder />', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useDeviceStore.setState({
      lookupByMac: vi.fn(),
      registerDevice: vi.fn(),
      fetchStats: vi.fn(),
      fetchRecentAudit: vi.fn(),
    });
  });

  it('opens the manual entry row when + is clicked', async () => {
    const user = userEvent.setup();
    renderFinder();

    await user.click(screen.getByTitle(/enter manually/i));
    expect(screen.getByPlaceholderText('A4:CF:12:8B:3D:E2')).toBeInTheDocument();
  });

  it('routes to the scanner when Scan is clicked', async () => {
    const user = userEvent.setup();
    renderFinder();

    await user.click(screen.getByRole('button', { name: /scan/i }));
    expect(navigateMock).toHaveBeenCalledWith('/scanner');
  });

  it('rejects malformed MACs without hitting the store', async () => {
    const user = userEvent.setup();
    const lookupByMac = vi.fn();
    useDeviceStore.setState({ lookupByMac });

    renderFinder();
    await user.click(screen.getByTitle(/enter manually/i));
    const input = screen.getByPlaceholderText('A4:CF:12:8B:3D:E2');
    await user.type(input, 'not-a-mac{Enter}');

    expect(lookupByMac).not.toHaveBeenCalled();
    expect(screen.getByText(/MAC must look like/i)).toBeInTheDocument();
  });

  it('shows the found card and navigates on Open device', async () => {
    const user = userEvent.setup();
    const lookupByMac = vi.fn().mockResolvedValue({ device: sampleDevice, mac: sampleDevice.mac_address });
    useDeviceStore.setState({ lookupByMac });

    renderFinder();
    await user.click(screen.getByTitle(/enter manually/i));
    await user.type(screen.getByPlaceholderText('A4:CF:12:8B:3D:E2'), 'A4:CF:12:8B:3D:E2{Enter}');

    await waitFor(() => expect(screen.getByText(/match found/i)).toBeInTheDocument());
    expect(screen.getByText('CHG-2406-0817')).toBeInTheDocument();
    expect(screen.getByText('EVSE')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open device/i }));
    expect(navigateMock).toHaveBeenCalledWith('/devices/dev-1');
  });

  it('falls through to register flow on a not-found MAC and posts the registration', async () => {
    const user = userEvent.setup();
    const lookupByMac = vi.fn().mockResolvedValue({ notFound: true, mac: 'AA:BB:CC:DD:EE:FF' });
    const registerDevice = vi.fn().mockResolvedValue({ id: 'new-id' });
    const fetchStats = vi.fn();
    const fetchRecentAudit = vi.fn();
    useDeviceStore.setState({ lookupByMac, registerDevice, fetchStats, fetchRecentAudit });

    renderFinder();
    await user.click(screen.getByTitle(/enter manually/i));
    await user.type(screen.getByPlaceholderText('A4:CF:12:8B:3D:E2'), 'AA:BB:CC:DD:EE:FF{Enter}');

    await waitFor(() => expect(screen.getByText(/not in inventory/i)).toBeInTheDocument());
    // EVSE is the default highlighted option in the picker
    await user.click(screen.getByRole('button', { name: /register as evse/i }));

    await waitFor(() =>
      expect(registerDevice).toHaveBeenCalledWith({
        mac_address: 'AA:BB:CC:DD:EE:FF',
        product_type: 'EVSE',
      }),
    );
    expect(fetchStats).toHaveBeenCalled();
    expect(fetchRecentAudit).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/devices/new-id');
  });
});
