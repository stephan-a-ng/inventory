import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockUser = { id: 'u1', email: 'me@m5.tech', role: 'admin' };
const authFetchMock = vi.fn();

vi.mock('@/features/auth/useAuth', () => ({
  default: () => ({ user: mockUser, authFetch: authFetchMock }),
}));

import FirmwarePopCard from './FirmwarePopCard';

const CHARGER = {
  id: 'd1',
  mac_address: 'AA:BB:CC:DD:EE:01',
  product_type: 'CHARGER',
  device_name: 'CHARGER-0001',
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('<FirmwarePopCard />', () => {
  beforeEach(() => {
    mockUser = { id: 'u1', email: 'me@m5.tech', role: 'admin' };
    authFetchMock.mockReset();
  });

  it('renders nothing for a non-CHARGER device', () => {
    const { container } = render(
      <FirmwarePopCard device={{ ...CHARGER, product_type: 'AEMS' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a viewer', () => {
    mockUser = { id: 'u2', role: 'viewer' };
    const { container } = render(<FirmwarePopCard device={CHARGER} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows masked value + eye button before reveal; never fetches eagerly', () => {
    render(<FirmwarePopCard device={CHARGER} />);
    expect(screen.getByRole('button', { name: /^reveal pop$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open in installer app/i }),
    ).toBeInTheDocument();
    // Masked placeholder is in the DOM; the real value isn't.
    expect(screen.getByTestId('firmware-pop-value').textContent).toMatch(/^mfp_•+$/);
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('clicking the eye toggles reveal → hide', async () => {
    authFetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        mac_address: CHARGER.mac_address,
        pop: 'mfp_TOGGLE0000000000000000000000',
        pop_generated_at: '2026-05-11T19:22:14Z',
      }),
    );

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(screen.getByRole('button', { name: /^reveal pop$/i }));
    await waitFor(() =>
      expect(screen.getByTestId('firmware-pop-value')).toHaveTextContent(
        'mfp_TOGGLE0000000000000000000000',
      ),
    );

    // Eye is now an EyeOff — clicking it re-masks without re-fetching.
    await userEvent.click(screen.getByRole('button', { name: /hide pop/i }));
    expect(screen.getByTestId('firmware-pop-value').textContent).toMatch(/^mfp_•+$/);
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });

  it('reveal calls GET /api/devices/{mac}/pop and displays the returned value', async () => {
    authFetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        mac_address: CHARGER.mac_address,
        pop: 'mfp_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        pop_generated_at: '2026-05-11T19:22:14Z',
      }),
    );

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(screen.getByRole('button', { name: /^reveal pop$/i }));

    await waitFor(() =>
      expect(screen.getByTestId('firmware-pop-value')).toHaveTextContent(
        'mfp_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      ),
    );
    expect(authFetchMock).toHaveBeenCalledWith(
      `/api/devices/${CHARGER.mac_address}/pop`,
    );
  });

  it('surfaces a server error if reveal fails', async () => {
    authFetchMock.mockResolvedValueOnce(
      jsonResponse(409, { detail: 'Device has no PoP. Use POST /api/devices/{mac}/pop to generate one.' }),
    );

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(screen.getByRole('button', { name: /^reveal pop$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no PoP/i),
    );
  });

  it('admin sees Rotate button which prompts confirm then calls POST', async () => {
    authFetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          mac_address: CHARGER.mac_address,
          pop: 'mfp_OLDPOPVALUE0000000000000000',
          pop_generated_at: '2026-05-11T19:22:14Z',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          mac_address: CHARGER.mac_address,
          pop: 'mfp_NEWROTATEDVALUE000000000000',
          pop_generated_at: '2026-05-12T08:00:00Z',
          rotated_from_existing: true,
        }),
      );

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(screen.getByRole('button', { name: /^reveal pop$/i }));
    await waitFor(() => expect(screen.getByTestId('firmware-pop-value')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /rotate/i }));
    // Confirm step appears.
    expect(screen.getByText(/invalidates the previous PoP/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /confirm rotate/i }));

    await waitFor(() =>
      expect(screen.getByTestId('firmware-pop-value')).toHaveTextContent(
        'mfp_NEWROTATEDVALUE000000000000',
      ),
    );
    expect(authFetchMock).toHaveBeenNthCalledWith(2, `/api/devices/${CHARGER.mac_address}/pop`, {
      method: 'POST',
    });
  });

  it('installer does not see the Rotate button', async () => {
    mockUser = { id: 'u3', role: 'installer' };
    authFetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        mac_address: CHARGER.mac_address,
        pop: 'mfp_ANYVAL0000000000000000000000',
        pop_generated_at: '2026-05-11T19:22:14Z',
      }),
    );

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(screen.getByRole('button', { name: /^reveal pop$/i }));
    await waitFor(() => expect(screen.getByTestId('firmware-pop-value')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /rotate/i })).toBeNull();
  });

  it('technician does not see the Rotate button', async () => {
    mockUser = { id: 'u4', role: 'technician' };
    authFetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        mac_address: CHARGER.mac_address,
        pop: 'mfp_TECH00000000000000000000000',
        pop_generated_at: '2026-05-11T19:22:14Z',
      }),
    );

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(screen.getByRole('button', { name: /^reveal pop$/i }));
    await waitFor(() => expect(screen.getByTestId('firmware-pop-value')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /rotate/i })).toBeNull();
  });

  it('Open in Installer App navigates to the configured URL scheme', async () => {
    const original = window.location;
    delete window.location;
    window.location = { href: '' };

    render(<FirmwarePopCard device={CHARGER} />);
    await userEvent.click(
      screen.getByRole('button', { name: /open in installer app/i }),
    );

    expect(window.location.href).toBe(
      `moonfive-installer://device/${CHARGER.mac_address}`,
    );
    window.location = original;
  });
});
