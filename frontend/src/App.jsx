import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import AuthGate from '@/components/AuthGate';
import { Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const DeviceDetail = lazy(() => import('@/pages/DeviceDetail'));
const Scanner = lazy(() => import('@/pages/Scanner'));
const BulkImport = lazy(() => import('@/pages/BulkImport'));
const Settings = lazy(() => import('@/pages/Settings'));

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
