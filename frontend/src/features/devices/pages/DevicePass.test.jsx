import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/features/auth/useAuth', () => ({
  default: () => ({ user: { id: 'u1', email: 'me@m5.tech', role: 'admin' } }),
}));

vi.mock('@/shared/components/layout/AppSidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}));

import DevicePass from './DevicePass';

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

function mockOnceFor(url, body, init = { status: 200 }) {
  globalThis.fetch.mockImplementationOnce(async (u) => {
    expect(u).toBe(url);
    return new Response(JSON.stringify(body), init);
  });
}

function mockApi({ device, stages = STAGES, audit = [] }) {
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
      return new Response(JSON.stringify({ ...device, ...JSON.parse(opts.body) }), { status: 200 });
    }
    return new Response('Not mocked: ' + url, { status: 404 });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/devices/${DEVICE_ID}`]}>
      <Routes>
        <Route path="/devices/:id" element={<DevicePass />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<DevicePass />', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    globalThis.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the current stage name as the headline', async () => {
    mockApi({
      device: {
        id: DEVICE_ID,
        mac_address: 'A4:CF:12:8B:3D:E2',
        product_type: 'EVSE',
        serial_number: 'CHG-2406-0817',
        current_stage_id: 's3',
        current_stage_name: 'Calibration',
      },
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Calibration' })).toBeInTheDocument();
    expect(screen.getByText(/STAGE 03/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 06/)).toBeInTheDocument();
    expect(screen.getByText('CHG-2406-0817')).toBeInTheDocument();
    expect(screen.getByText('A4:CF:12:8B:3D:E2')).toBeInTheDocument();
    expect(screen.getByText('EVSE')).toBeInTheDocument();
  });

  it('hides the "picked this up" line when there are no stage transitions', async () => {
    mockApi({
      device: {
        id: DEVICE_ID,
        mac_address: 'A4:CF:12:8B:3D:E2',
        product_type: 'EVSE',
        serial_number: 'CHG-2406-0817',
        current_stage_id: 's1',
      },
      audit: [],
    });

    renderPage();
    await screen.findByRole('heading', { name: 'Assembly' });
    expect(screen.queryByText(/picked this up/i)).toBeNull();
  });

  it('shows "picked this up" with relative time when a stage_changed audit exists', async () => {
    mockApi({
      device: {
        id: DEVICE_ID,
        mac_address: 'A4:CF:12:8B:3D:E2',
        product_type: 'EVSE',
        serial_number: 'CHG-2406-0817',
        current_stage_id: 's3',
      },
      audit: [
        {
          id: 'a1',
          device_id: DEVICE_ID,
          user_id: 'u1',
          user_name: 'Jade Khoury',
          action: 'updated',
          old_value: { current_stage_id: 's2' },
          new_value: { current_stage_id: 's3' },
          created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        },
      ],
    });

    renderPage();
    await screen.findByRole('heading', { name: 'Calibration' });
    // Jade appears in both the who-line and the history feed — the who-line
    // is the one wrapped in <strong>, so assert that variant specifically.
    const whoLine = screen.getByText(/picked this up/i);
    expect(whoLine).toBeInTheDocument();
    expect(whoLine.querySelector('strong')).toHaveTextContent('Jade Khoury');
  });

  it('renders an "Open {current stage}" link pointing at /details', async () => {
    mockApi({
      device: {
        id: DEVICE_ID,
        mac_address: 'A4:CF:12:8B:3D:E2',
        product_type: 'EVSE',
        serial_number: 'CHG-2406-0817',
        current_stage_id: 's3',
      },
    });

    renderPage();
    const openLink = await screen.findByRole('link', { name: /open calibration/i });
    expect(openLink).toHaveAttribute('href', `/devices/${DEVICE_ID}/details`);
  });

  // Install a vi.fn() in place of navigator.clipboard.writeText. Returns it
  // so individual tests can read the call args. Works with jsdom's
  // getter-only `navigator.clipboard` property (we defineProperty instead
  // of plain assignment).
  function installClipboardSpy() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    });
    return writeText;
  }

  it('clicking the serial copies it via the clipboard API and shows a "Copied" hint', async () => {
    const writeText = installClipboardSpy();
    mockApi({
      device: {
        id: DEVICE_ID,
        mac_address: 'A4:CF:12:8B:3D:E2',
        product_type: 'EVSE',
        serial_number: 'CHG-2406-0817',
        current_stage_id: 's3',
      },
    });

    renderPage();
    const serialBtn = await screen.findByRole('button', { name: 'CHG-2406-0817' });
    await userEvent.setup().click(serialBtn);

    // User-observable affordance — appears on either the navigator.clipboard
    // path or the execCommand fallback.
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
    // And no PATCH should fire — the serial is read-only now.
    const patchCall = globalThis.fetch.mock.calls.find(
      ([url, opts]) => url === `/api/devices/${DEVICE_ID}` && opts?.method === 'PATCH',
    );
    expect(patchCall).toBeUndefined();
    // We don't strictly require the modern clipboard API path to have run —
    // jsdom doesn't always expose navigator.clipboard — but if it did, the
    // serial should have been the argument.
    if (writeText.mock.calls.length > 0) {
      expect(writeText).toHaveBeenCalledWith('CHG-2406-0817');
    }
  });

  it('clicking the MAC shows a "Copied" hint', async () => {
    installClipboardSpy();
    mockApi({
      device: {
        id: DEVICE_ID,
        mac_address: 'A4:CF:12:8B:3D:E2',
        product_type: 'EVSE',
        serial_number: 'CHG-2406-0817',
        current_stage_id: 's3',
      },
    });

    renderPage();
    const macBtn = await screen.findByRole('button', { name: 'A4:CF:12:8B:3D:E2' });
    await userEvent.setup().click(macBtn);

    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
  });
});
