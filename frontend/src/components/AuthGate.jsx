import { useState } from 'react';
import useAuth from '@/hooks/useAuth';

export default function AuthGate({ children }) {
  const { user, loading, login } = useAuth();
  const [hovered, setHovered] = useState(false);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--m5-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--m5-yellow)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <p style={{ color: 'var(--m5-muted)', marginTop: 16, fontFamily: 'var(--m5-font-mono)', fontSize: 12, letterSpacing: '0.1em' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--m5-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <img src="/logo-yellow.png" alt="MoonFive" style={{ height: 48 }} />
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--m5-ink)', margin: 0 }}>Inventory Manager</h1>
            <p style={{ color: 'var(--m5-muted)', marginTop: 6, fontSize: 14 }}>
              Track hardware devices through the commissioning pipeline
            </p>
          </div>
          <button
            onClick={login}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              height: 44,
              padding: '0 24px',
              background: hovered ? 'var(--m5-yellow-deep, #e8b800)' : 'var(--m5-yellow)',
              border: 'none',
              borderRadius: 0,
              color: 'var(--m5-ink)',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              transition: 'background 0.12s ease',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return children;
}
