import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authFetchMock = vi.fn();
let mockUser = { id: 'me', email: 'me@m5.tech', role: 'admin' };

vi.mock('@/features/auth/useAuth', () => ({
  default: () => ({ user: mockUser, authFetch: authFetchMock }),
}));

import UserManagementPanel from './UserManagementPanel';

const USERS = [
  { id: 'me', email: 'me@m5.tech', name: 'Me', role: 'admin' },
  { id: 'u2', email: 'tech@m5.tech', name: 'Tech', role: 'technician' },
  { id: 'u3', email: 'partner@external.com', name: 'Partner', role: 'viewer' },
];

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('<UserManagementPanel />', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    mockUser = { id: 'me', email: 'me@m5.tech', role: 'admin' };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('lists users with role dropdowns; self is disabled', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, USERS));

    render(<UserManagementPanel />);
    await waitFor(() => screen.getByTestId('user-row-me@m5.tech'));

    expect(screen.getByText('me@m5.tech')).toBeInTheDocument();
    expect(screen.getByText('tech@m5.tech')).toBeInTheDocument();
    expect(screen.getByText('partner@external.com')).toBeInTheDocument();

    expect(screen.getByLabelText('Role for me@m5.tech')).toBeDisabled();
    expect(screen.getByLabelText('Role for tech@m5.tech')).not.toBeDisabled();
  });

  it('promotes a viewer to installer via PATCH and refetches', async () => {
    authFetchMock
      .mockResolvedValueOnce(jsonResponse(200, USERS))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'u3',
          email: 'partner@external.com',
          name: 'Partner',
          role: 'installer',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          USERS[0],
          USERS[1],
          { ...USERS[2], role: 'installer' },
        ]),
      );

    render(<UserManagementPanel />);
    await waitFor(() => screen.getByTestId('user-row-partner@external.com'));

    await userEvent.selectOptions(
      screen.getByLabelText('Role for partner@external.com'),
      'installer',
    );

    await waitFor(() =>
      expect(authFetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/users/u3/role',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'installer' }),
        }),
      ),
    );
  });

  it('aborts role change when the admin declines the confirm prompt', async () => {
    window.confirm.mockReturnValueOnce(false);
    authFetchMock.mockResolvedValueOnce(jsonResponse(200, USERS));

    render(<UserManagementPanel />);
    await waitFor(() => screen.getByTestId('user-row-tech@m5.tech'));

    await userEvent.selectOptions(
      screen.getByLabelText('Role for tech@m5.tech'),
      'installer',
    );

    // Only the initial GET should have hit the network.
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces backend errors via alert (e.g., self-demotion)', async () => {
    authFetchMock
      .mockResolvedValueOnce(jsonResponse(200, USERS))
      .mockResolvedValueOnce(
        jsonResponse(400, { detail: 'Admins cannot change their own role' }),
      );

    render(<UserManagementPanel />);
    await waitFor(() => screen.getByTestId('user-row-tech@m5.tech'));

    await userEvent.selectOptions(
      screen.getByLabelText('Role for tech@m5.tech'),
      'admin',
    );

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('Admins cannot change their own role'),
      ),
    );
  });

  it('shows loading then an error when the list fails to load', async () => {
    authFetchMock.mockResolvedValueOnce(jsonResponse(403, { detail: 'Forbidden' }));
    render(<UserManagementPanel />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Forbidden'),
    );
  });
});
