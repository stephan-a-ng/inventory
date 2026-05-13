import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authFetchMock = vi.fn();
let mockUser = { id: 'u1', role: 'admin' };

vi.mock('@/features/auth/useAuth', () => ({
  default: () => ({ user: mockUser, authFetch: authFetchMock }),
}));

import FirmwareVersionCheckCard from './FirmwareVersionCheckCard';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, statusText: 'OK', json: async () => body };
}

const STATUS_MATCH = {
  tracked: true,
  repo: 'moon-five-technologies/argo',
  release_url: 'https://github.com/moon-five-technologies/argo/releases/tag/v1.0.0',
  current: 'v1.0.0',
  latest: 'v1.0.0',
  is_latest: true,
  deviation_reason: null,
};
const STATUS_OUT_OF_DATE = {
  ...STATUS_MATCH,
  current: 'v0.4.0',
  latest: 'v0.4.2',
  release_url: 'https://github.com/moon-five-technologies/argo/releases/tag/v0.4.2',
  is_latest: false,
};

describe('<FirmwareVersionCheckCard />', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    mockUser = { id: 'u1', role: 'admin' };
  });

  it('shows loading state while fetching, then on-latest badge on match', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS_MATCH));
    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    expect(screen.getByTestId('firmware-check-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/On latest \(v1\.0\.0\)/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('firmware-check-current').textContent).toContain('v1.0.0');
  });

  it('renders nothing when tracked=false', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, { tracked: false, current: 'v0.1.0' }));
    const { container } = render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled();
    });
    // After load resolves, the component returns null.
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows "Not recorded" when device has no firmware_version', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, {
      ...STATUS_MATCH, current: null, is_latest: null,
    }));
    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => {
      expect(screen.getByText(/Not recorded/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('firmware-check-current').textContent).toContain('— not set —');
  });

  it('shows "Latest unknown" when GitHub fetch failed', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, {
      ...STATUS_OUT_OF_DATE, latest: null, release_url: null, is_latest: null,
    }));
    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => {
      expect(screen.getByText(/Latest unknown/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('firmware-check-latest').textContent).toContain('unavailable');
  });

  it('shows out-of-date badge + deviation editor button for admin', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS_OUT_OF_DATE));
    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => {
      expect(screen.getByText('Out of date')).toBeInTheDocument();
    });
    expect(screen.getByTestId('firmware-check-current').textContent).toContain('v0.4.0');
    expect(screen.getByTestId('firmware-check-latest').textContent).toContain('v0.4.2');
    expect(screen.getByRole('button', { name: /add deviation reason/i })).toBeInTheDocument();
  });

  it('hides the edit affordance from viewers', async () => {
    mockUser = { id: 'u9', role: 'viewer' };
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, {
      ...STATUS_OUT_OF_DATE, deviation_reason: 'Customer policy',
    }));
    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => {
      expect(screen.getByTestId('firmware-deviation-text').textContent).toContain('Customer policy');
    });
    expect(
      screen.queryByRole('button', { name: /edit deviation reason/i }),
    ).not.toBeInTheDocument();
  });

  it('saves a deviation reason via PATCH and reflects it locally', async () => {
    const user = userEvent.setup();
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS_OUT_OF_DATE));
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, { firmware_deviation_reason: 'Awaiting OTA window' }));

    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => screen.getByText('Out of date'));

    await user.click(screen.getByRole('button', { name: /add deviation reason/i }));
    await user.type(screen.getByTestId('firmware-deviation-textarea'), 'Awaiting OTA window');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('firmware-deviation-text').textContent).toContain('Awaiting OTA window');
    });

    // Two calls: initial load + PATCH.
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    const patchCall = authFetchMock.mock.calls[1];
    expect(patchCall[0]).toBe('/api/devices/d1');
    expect(patchCall[1].method).toBe('PATCH');
    expect(JSON.parse(patchCall[1].body)).toEqual({ firmware_deviation_reason: 'Awaiting OTA window' });
  });

  it('shows an error + retry when the fetch fails', async () => {
    const user = userEvent.setup();
    authFetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS_MATCH));
    render(<FirmwareVersionCheckCard deviceId="d1" currentUser={mockUser} />);
    await waitFor(() => screen.getByTestId('firmware-check-error'));

    await user.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => screen.getByText(/On latest \(v1\.0\.0\)/));
  });
});
