import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, HardDrive, ScanLine, Upload, Settings, LogOut, Menu } from 'lucide-react';
import useAuth from '@/features/auth/useAuth';

function getInitials(name) {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

const workspaceItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Devices', url: '/devices', icon: HardDrive },
  { title: 'Scanner', url: '/scanner', icon: ScanLine },
  { title: 'Bulk Import', url: '/import', icon: Upload },
];

const adminItems = [
  { title: 'Settings', url: '/settings', icon: Settings },
];

const s = {
  nav: {
    display: 'flex',
    flexDirection: 'column',
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
};

function NavItem({ item, active, collapsed }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = React.useState(false);

  const itemStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: '12px',
    padding: collapsed ? '10px 0' : '10px 12px',
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
      title={collapsed ? item.title : undefined}
    >
      <item.icon size={16} />
      {!collapsed && item.title}
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
      aria-label="Logout"
    >
      <LogOut size={14} />
    </button>
  );
}

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = React.useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const isAdmin = user?.role === 'admin';
  const initials = user ? getInitials(user.name || user.email) : '?';

  const asideStyle = {
    width: collapsed ? '56px' : '232px',
    minWidth: collapsed ? '56px' : '232px',
    background: 'var(--m5-ink)',
    color: 'var(--m5-cream)',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    flexShrink: 0,
    transition: 'width 0.18s ease, min-width 0.18s ease',
  };

  const brandStyle = {
    padding: collapsed ? '20px 0 20px' : '20px 16px 20px',
    display: 'flex',
    flexDirection: collapsed ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'space-between',
    gap: collapsed ? '12px' : '0',
    borderBottom: '1px solid var(--m5-rule-dark)',
    minHeight: '72px',
  };

  const brandLeftStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    flex: collapsed ? 'none' : 1,
    minWidth: 0,
  };

  const toggleBtnStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--m5-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: 0,
    transition: 'color 0.12s ease',
  };

  const groupStyle = {
    padding: collapsed ? '16px 0 0' : '20px 12px 0',
  };

  const groupLabelStyle = {
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '10.5px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--m5-muted)',
    padding: collapsed ? '0 0 10px' : '0 12px 10px',
    display: collapsed ? 'none' : 'block',
  };

  const footerStyle = {
    marginTop: 'auto',
    borderTop: '1px solid var(--m5-rule-dark)',
    padding: collapsed ? '14px 0' : '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: '10px',
    fontSize: '13px',
  };

  return (
    <aside style={asideStyle}>
      {/* Brand */}
      <div style={brandStyle}>
        <div style={brandLeftStyle} onClick={() => navigate('/')}>
          {!collapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src="/logo-yellow.png"
                  alt="Inventory"
                  style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                />
                <span style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  Inventory
                </span>
              </div>
              <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--m5-muted)', marginTop: '5px', paddingLeft: '34px' }}>
                v2.4
              </span>
            </div>
          ) : (
            <img
              src="/logo-yellow.png"
              alt="Inventory"
              style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
            />
          )}
        </div>
        <button
          style={toggleBtnStyle}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--m5-cream)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--m5-muted)')}
        >
          <Menu size={16} />
        </button>
      </div>

      {/* Workspace group */}
      <div style={groupStyle}>
        <span style={groupLabelStyle}>Workspace</span>
        <nav style={s.nav}>
          {workspaceItems.map((item) => (
            <NavItem
              key={item.url}
              item={item}
              collapsed={collapsed}
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
        <div style={groupStyle}>
          <span style={groupLabelStyle}>Admin</span>
          <nav style={s.nav}>
            {adminItems.map((item) => (
              <NavItem
                key={item.url}
                item={item}
                collapsed={collapsed}
                active={location.pathname.startsWith(item.url)}
              />
            ))}
          </nav>
        </div>
      )}

      {/* Footer */}
      {user && (
        <div style={footerStyle}>
          <div style={s.avatar} title={collapsed ? (user.name || user.email) : undefined}>
            {initials}
          </div>
          {!collapsed && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || user.email}
                </span>
                <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: '10.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--m5-muted)' }}>
                  {user.role}
                </span>
              </div>
              <LogoutButton onClick={logout} />
            </>
          )}
        </div>
      )}
    </aside>
  );
}
