import { useState } from 'react';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import CameraView from '@/features/scanning/components/CameraView';
import ManualEntry from '@/features/scanning/components/ManualEntry';
import ScanResult from '@/features/scanning/components/ScanResult';
import { Camera, Keyboard } from 'lucide-react';

export default function Scanner() {
  const [mode, setMode] = useState('camera');
  const [device, setDevice] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [lastMac, setLastMac] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState(null);

  async function handleLookup(mac) {
    setLastMac(mac);
    setDevice(null);
    setNotFound(false);

    try {
      const res = await fetch(`/api/devices/lookup/${encodeURIComponent(mac)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        setDevice(await res.json());
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
  }

  const modeBtn = (key) => ({
    height: 36,
    padding: '0 14px',
    border: '1px solid var(--m5-rule)',
    borderRight: key === 'camera' ? 'none' : '1px solid var(--m5-rule)',
    background: mode === key ? 'var(--m5-ink)' : (hoveredBtn === key ? 'var(--m5-cream-deep)' : 'var(--m5-cream)'),
    color: mode === key ? 'var(--m5-cream)' : 'var(--m5-ink)',
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.12s ease, color 0.12s ease',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* M5 topbar */}
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
              MoonFive / Inventory / Scanner
            </div>
            <h1 style={{
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              margin: 0,
              color: 'var(--m5-ink)',
            }}>
              Scanner.
            </h1>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', paddingBottom: 4 }}>
            <button
              style={modeBtn('camera')}
              onMouseEnter={() => setHoveredBtn('camera')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => setMode('camera')}
            >
              <Camera size={14} />
              Camera
            </button>
            <button
              style={modeBtn('manual')}
              onMouseEnter={() => setHoveredBtn('manual')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => setMode('manual')}
            >
              <Keyboard size={14} />
              Manual
            </button>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: '28px 40px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Scanner input area */}
          <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--m5-rule)',
              background: 'var(--m5-cream-deep)',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
            }}>
              {mode === 'camera' ? 'Camera scan' : 'Manual entry'}
            </div>
            <div style={{ padding: '20px' }}>
              {mode === 'camera' ? (
                <CameraView onResult={handleLookup} enabled={mode === 'camera'} />
              ) : (
                <ManualEntry onSubmit={handleLookup} />
              )}
            </div>
          </div>

          {/* Scan result — ScanResult returns null when no device/notFound */}
          <ScanResult device={device} notFound={notFound} mac={lastMac} />
        </div>
      </main>
    </div>
  );
}
