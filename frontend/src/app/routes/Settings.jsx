import { useState } from 'react';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import { useAuth } from '@/features/auth';
import { StagesPanel } from '@/features/stages';
import { SubsystemsPanel } from '@/features/subsystems';

export default function Settings() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('stages');
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
          <header style={{ padding: '24px 40px 0' }}>
            <div style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
              marginBottom: 6,
            }}>
              MoonFive / Inventory / Settings
            </div>
            <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1, margin: 0, color: 'var(--m5-ink)' }}>
              Settings.
            </h1>
          </header>
          <div style={{ padding: '28px 40px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 13 }}>
            Only admins can manage settings.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div>
            <div style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
              marginBottom: 6,
            }}>
              MoonFive / Inventory / Settings
            </div>
            <h1 style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1, margin: 0, color: 'var(--m5-ink)' }}>
              Settings.
            </h1>
          </div>
        </header>

        <div style={{ padding: '28px 40px 64px' }}>
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--m5-rule)',
            marginBottom: 24,
          }}>
            {['stages', 'subsystems'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeSection === section ? '2px solid var(--m5-ink)' : '2px solid transparent',
                  color: activeSection === section ? 'var(--m5-ink)' : 'var(--m5-muted)',
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontWeight: activeSection === section ? 600 : 400,
                  transition: 'color 0.12s, border-color 0.12s',
                  marginBottom: -1,
                }}
              >
                {section === 'stages' ? 'Commissioning Stages' : 'Board Subsystems'}
              </button>
            ))}
          </div>

          {activeSection === 'stages' && <StagesPanel />}
          {activeSection === 'subsystems' && <SubsystemsPanel />}
        </div>
      </main>
    </div>
  );
}
