import { useState } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import CameraView from '@/components/scanner/CameraView';
import ManualEntry from '@/components/scanner/ManualEntry';
import ScanResult from '@/components/scanner/ScanResult';
import { Button } from '@/components/ui/button';
import { Camera, Keyboard } from 'lucide-react';

export default function Scanner() {
  const [mode, setMode] = useState('camera');
  const [device, setDevice] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [lastMac, setLastMac] = useState('');

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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 p-4 border-b border-border">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold flex-1">Scanner</h1>
          <div className="flex gap-1">
            <Button
              variant={mode === 'camera' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('camera')}
              className="cursor-pointer"
            >
              <Camera className="h-4 w-4 mr-1" /> Camera
            </Button>
            <Button
              variant={mode === 'manual' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('manual')}
              className="cursor-pointer"
            >
              <Keyboard className="h-4 w-4 mr-1" /> Manual
            </Button>
          </div>
        </header>
        <div className="p-4 space-y-6">
          {mode === 'camera' ? (
            <CameraView onResult={handleLookup} enabled={mode === 'camera'} />
          ) : (
            <ManualEntry onSubmit={handleLookup} />
          )}
          <ScanResult device={device} notFound={notFound} mac={lastMac} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
