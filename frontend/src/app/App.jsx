import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { AuthProvider, AuthGate } from '@/features/auth';

// Route components are lazy-loaded via their slice barrels.
const Dashboard = lazy(() =>
  import('@/features/devices').then((m) => ({ default: m.Dashboard })),
);
const Devices = lazy(() =>
  import('@/features/devices').then((m) => ({ default: m.Devices })),
);
const DeviceDetail = lazy(() =>
  import('@/features/devices').then((m) => ({ default: m.DeviceDetail })),
);
const Scanner = lazy(() =>
  import('@/features/scanning').then((m) => ({ default: m.Scanner })),
);
const BulkImport = lazy(() =>
  import('@/features/import').then((m) => ({ default: m.BulkImport })),
);
const Settings = lazy(() => import('./routes/Settings'));

function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/:id" element={<DeviceDetail />} />
              <Route path="/scanner" element={<Scanner />} />
              <Route path="/import" element={<BulkImport />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
