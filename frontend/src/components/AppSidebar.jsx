import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScanLine, Upload, Settings, LogOut } from 'lucide-react';
import useAuth from '@/hooks/useAuth';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

const workspaceItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Scanner', url: '/scanner', icon: ScanLine },
  { title: 'Bulk Import', url: '/import', icon: Upload },
];

const adminItems = [
  { title: 'Settings', url: '/settings', icon: Settings },
];

const s = {
  aside: {
    width: '232px',
    minWidth: '232px',
    background: 'var(--m5-ink)',
    color: 'var(--m5-cream)',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
    flexShrink: 0,
  },
  brand: {
    padding: '24px 20px 28px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderBottom: '1px solid var(--m5-rule-dark)',
    cursor: 'pointer',
  },
  brandLogo: {
    width: '28px',
    height: '28px',
    objectFit: 'contain',
  },
  brandText: {
    display: 'flex',
    flexDirection: 'column',
  },
  brandTitle: {
    fontWeight: 900,
    fontSize: '16px',
    letterSpacing: '-0.02em',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
  },
  brandSeparator: {
    color: 'var(--m5-muted)',
    fontWeight: 400,
    margin: '0 6px',
  },
  brandSub: {
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--m5-muted)',
    display: 'block',
    marginTop: '4px',
  },
  group: {
    padding: '20px 12px 0',
  },
  groupLabel: {
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '10.5px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--m5-muted)',
    padding: '0 12px 10px',
    display: 'block',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
  },
  footer: {
    marginTop: 'auto',
    borderTop: '1px solid var(--m5-rule-dark)',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
  },
  avatar: {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    background: 'var(--m5-yellow)',
    color: 'var(--m5-ink)',
    fontWeight: 900,
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    flexShrink: 0,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flex: 1,
  },
  userName: {
    fontWeight: 600,
    fontSize: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userRole: {
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '10.5px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--m5-muted)',
  },
};

function NavItem({ item, active }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = React.useState(false);

  const itemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    background: active
      ? 'rgba(250,247,238,0.06)'
      : hovered
      ? 'rgba(250,247,238,0.05)'
      : 'transparent',
    color: active || hovered ? 'var(--m5-cream)' : 'rgba(250,247,238,0.72)',
    border: 'none',
    borderLeft: active ? '2px solid var(--m5-yellow)' : '2px solid transparent',
    textAlign: 'left',
    width: '100%',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.12s ease, color 0.12s ease',
    borderRadius: 0,
    fontFamily: 'inherit',
  };

  return (
    <button
      style={itemStyle}
      onClick={() => navigate(item.url)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <item.icon size={16} />
      {item.title}
    </button>
  );
}

function LogoutButton({ onClick }) {
  const [hovered, setHovered] = React.useState(false);

  const btnStyle = {
    background: 'transparent',
    border: '1px solid var(--m5-rule-dark)',
    color: hovered ? 'var(--m5-cream)' : 'var(--m5-muted)',
    borderColor: hovered ? 'var(--m5-cream)' : 'var(--m5-rule-dark)',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    borderRadius: 0,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'color 0.12s ease, border-color 0.12s ease',
  };

  return (
    <button
      style={btnStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Logout"
    >
      <LogOut size={14} />
    </button>
  );
}

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isAdmin = user?.role === 'admin';
  const initials = user ? getInitials(user.name || user.email) : '?';

  return (
    <aside style={s.aside}>
      {/* Brand */}
      <div style={s.brand} onClick={() => navigate('/')}>
        <img src="/images/mf-white.png" alt="Moon Five" style={s.brandLogo} />
        <div style={s.brandText}>
          <span style={s.brandTitle}>
            Moon Five
            <span style={s.brandSeparator}>/</span>
            Inventory
          </span>
          <span style={s.brandSub}>v2.4</span>
        </div>
      </div>

      {/* Workspace group */}
      <div style={s.group}>
        <span style={s.groupLabel}>Workspace</span>
        <nav style={s.nav}>
          {workspaceItems.map((item) => (
            <NavItem
              key={item.url}
              item={item}
              active={
                item.url === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.url)
              }
            />
          ))}
        </nav>
      </div>

      {/* Admin group */}
      {isAdmin && (
        <div style={s.group}>
          <span style={s.groupLabel}>Admin</span>
          <nav style={s.nav}>
            {adminItems.map((item) => (
              <NavItem
                key={item.url}
                item={item}
                active={location.pathname.startsWith(item.url)}
              />
            ))}
          </nav>
        </div>
      )}

      {/* Footer */}
      {user && (
        <div style={s.footer}>
          <div style={s.avatar}>{initials}</div>
          <div style={s.userInfo}>
            <span style={s.userName}>{user.name || user.email}</span>
            <span style={s.userRole}>{user.role}</span>
          </div>
          <LogoutButton onClick={logout} />
        </div>
      )}
    </aside>
  );
}
