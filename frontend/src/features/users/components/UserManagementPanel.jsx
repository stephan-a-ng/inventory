import { useEffect, useState } from 'react';
import useAuth from '@/features/auth/useAuth';

const ROLE_OPTIONS = ['admin', 'technician', 'installer', 'viewer'];

const cellStyle = {
  padding: '12px 16px',
  fontFamily: 'var(--m5-font-mono)',
  fontSize: 12,
  color: 'var(--m5-ink)',
  borderBottom: '1px solid var(--m5-rule)',
};

const headerCellStyle = {
  ...cellStyle,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--m5-muted)',
  borderBottom: '2px solid var(--m5-rule)',
  fontWeight: 600,
};

export default function UserManagementPanel() {
  const { user: currentUser, authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await authFetch('/api/users');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || `Failed to load users (HTTP ${res.status})`);
        return;
      }
      setUsers(await res.json());
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // authFetch is stable from useAuth; not adding to deps to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRoleChange(userId, newRole) {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    if (target.role === newRole) return;

    const ok = window.confirm(
      `Change ${target.email}'s role from "${target.role}" to "${newRole}"?`,
    );
    if (!ok) return;

    const res = await authFetch(`/api/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.detail || `Failed to update role (HTTP ${res.status})`);
      return;
    }
    loadUsers();
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 13,
          color: 'var(--m5-muted)',
        }}
      >
        Loading users…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 13,
          color: 'rgb(180, 30, 30)',
        }}
        role="alert"
      >
        {error}
      </div>
    );
  }

  return (
    <div data-testid="user-management-panel">
      <div
        style={{
          padding: '0 0 16px',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: 'var(--m5-muted)',
        }}
      >
        {users.length} user{users.length === 1 ? '' : 's'}. Promote a partner
        installer to <code>installer</code> to unlock the mobile-app PoP fetch.
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: 'white',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, textAlign: 'left' }}>Name</th>
            <th style={{ ...headerCellStyle, textAlign: 'left' }}>Email</th>
            <th style={{ ...headerCellStyle, textAlign: 'left' }}>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <tr key={u.id} data-testid={`user-row-${u.email}`}>
                <td style={cellStyle}>{u.name || '—'}</td>
                <td style={cellStyle}>{u.email}</td>
                <td style={cellStyle}>
                  <select
                    value={u.role}
                    disabled={isSelf}
                    aria-label={`Role for ${u.email}`}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    style={{
                      padding: '6px 10px',
                      fontFamily: 'var(--m5-font-mono)',
                      fontSize: 12,
                      border: '1px solid var(--m5-rule)',
                      borderRadius: 4,
                      background: isSelf ? 'var(--m5-cream)' : 'white',
                      color: 'var(--m5-ink)',
                    }}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {isSelf && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: 'var(--m5-muted)',
                      }}
                    >
                      (you)
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
