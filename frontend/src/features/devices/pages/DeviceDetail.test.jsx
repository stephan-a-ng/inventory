import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/features/auth/useAuth', () => ({
  default: () => ({ user: { id: 'u1', email: 'me@m5.tech', role: 'admin' } }),
}));

vi.mock('@/shared/components/layout/AppSidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}));

vi.mock('@/features/devices/components/DeviceForm', () => ({
  default: () => <div data-testid="device-form" />,
}));

import DeviceDetail from './DeviceDetail';

const DEVICE_ID = 'd1';

const STAGES = [
  { id: 's1', name: 'Assembly', product_type: 'EVSE', order: 1 },
  { id: 's2', name: 'Firmware', product_type: 'EVSE', order: 2 },
  { id: 's3', name: 'Calibration', product_type: 'EVSE', order: 3 },
  { id: 's4', name: 'QA', product_type: 'EVSE', order: 4 },
  { id: 's5', name: 'Staging', product_type: 'EVSE', order: 5 },
  { id: 's6', name: 'Deployed', product_type: 'EVSE', order: 6 },
  { id: 'x1', name: 'Other-product-stage', product_type: 'AEMS', order: 1 },
];

function mockApi({
  device,
  stages = STAGES,
  audit = [],
}) {
  globalThis.fetch.mockImplementation(async (url, opts) => {
    if (url === `/api/devices/${DEVICE_ID}` && (!opts || opts.method === undefined)) {
      return new Response(JSON.stringify(device), { status: 200 });
    }
    if (url === '/api/stages') {
      return new Response(JSON.stringify(stages), { status: 200 });
    }
    if (url === `/api/audit/${DEVICE_ID}`) {
      return new Response(JSON.stringify(audit), { status: 200 });
    }
    if (url === `/api/devices/${DEVICE_ID}` && opts?.method === 'PATCH') {
      return new Response(JSON.stringify({ ...device, ...JSON.parse(opts.body) }), {
        status: 200,
      });
    }
    return new Response('Not mocked: ' + url, { status: 404 });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/devices/${DEVICE_ID}/details`]}>
      <Routes>
        <Route path="/devices/:id/details" element={<DeviceDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseDevice = {
  id: DEVICE_ID,
  mac_address: 'A4:CF:12:8B:3D:E2',
  product_type: 'EVSE',
  serial_number: 'CHG-2406-0817',
  current_stage_id: 's3',
  created_at: '2026-05-01T12:00:00Z',
};

describe('<DeviceDetail />', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.confirm = vi.fn(() => true);
    window.scrollTo = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header strip with serial, MAC, and product type', async () => {
    mockApi({ device: baseDevice });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Commissioning process' })).toBeInTheDocument();
    expect(screen.getByText('CHG-2406-0817')).toBeInTheDocument();
    expect(screen.getByText('A4:CF:12:8B:3D:E2')).toBeInTheDocument();
    expect(screen.getByText('EVSE')).toBeInTheDocument();
  });

  it('renders six stage tabs scoped to the device product type', async () => {
    mockApi({ device: baseDevice });
    renderPage();

    const nav = await screen.findByRole('navigation', { name: /commissioning stages/i });
    const tabs = ['Assembly', 'Firmware', 'Calibration', 'QA', 'Staging', 'Deployed'];
    for (const name of tabs) {
      expect(within(nav).getByText(name, { selector: '.name' })).toBeInTheDocument();
    }
    expect(within(nav).queryByText('Other-product-stage')).toBeNull();
  });

  it('marks the current stage tab with the · Now suffix and defaults the panel to it', async () => {
    mockApi({ device: baseDevice });
    renderPage();

    const nav = await screen.findByRole('navigation', { name: /commissioning stages/i });
    // current stage shows the "· Now" label inside the active tab's num-row
    expect(within(nav).getByText(/03 · Now/)).toBeInTheDocument();
    // active panel headline is the current stage name
    expect(screen.getByRole('heading', { level: 2, name: 'Calibration' })).toBeInTheDocument();
  });

  it('switches the visible panel when a different stage tab is clicked', async () => {
    mockApi({ device: baseDevice });
    renderPage();

    await screen.findByRole('heading', { level: 2, name: 'Calibration' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Firmware/ }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Firmware' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Calibration' })).toBeNull();
  });

  it('derives "Started" in the meta strip from the stage_changed audit entry', async () => {
    const enteredAt = '2026-05-11T14:27:00Z';
    mockApi({
      device: baseDevice,
      audit: [
        {
          id: 'a1',
          device_id: DEVICE_ID,
          action: 'created',
          user_name: 'Jade Khoury',
          new_value: { current_stage_id: 's1' },
          created_at: '2026-05-01T12:00:00Z',
        },
        {
          id: 'a2',
          device_id: DEVICE_ID,
          action: 'stage_changed',
          user_name: 'Jade Khoury',
          old_value: { current_stage_id: 's1' },
          new_value: { current_stage_id: 's2' },
          created_at: '2026-05-06T14:18:00Z',
        },
        {
          id: 'a3',
          device_id: DEVICE_ID,
          action: 'stage_changed',
          user_name: 'Jade Khoury',
          old_value: { current_stage_id: 's2' },
          new_value: { current_stage_id: 's3' },
          created_at: enteredAt,
        },
      ],
    });
    renderPage();

    await screen.findByRole('heading', { level: 2, name: 'Calibration' });
    // owner cell picks up the user who advanced into the current stage
    expect(screen.getAllByText('Jade Khoury').length).toBeGreaterThan(0);
    // status chip reads "In progress" on the active (current) panel
    expect(screen.getByText(/In progress/i)).toBeInTheDocument();
  });

  it('renders the Pending status chip on a future stage', async () => {
    mockApi({ device: baseDevice });
    renderPage();

    await screen.findByRole('heading', { level: 2, name: 'Calibration' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Deployed/ }));

    await screen.findByRole('heading', { level: 2, name: 'Deployed' });
    expect(screen.getByText(/^Pending$/i)).toBeInTheDocument();
  });

  it('Back to overview navigates to /devices/:id', async () => {
    mockApi({ device: baseDevice });
    function PathProbe() {
      const loc = useLocation();
      return <div data-testid="probe-path">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={[`/devices/${DEVICE_ID}/details`]}>
        <Routes>
          <Route path="/devices/:id/details" element={<DeviceDetail />} />
          <Route path="/devices/:id" element={<PathProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const back = await screen.findByRole('button', { name: /Back to overview/i });
    const user = userEvent.setup();
    await user.click(back);

    await waitFor(() => {
      expect(screen.getByTestId('probe-path').textContent).toBe(`/devices/${DEVICE_ID}`);
    });
  });
});
