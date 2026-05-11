import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import AppSidebar from '@/shared/components/layout/AppSidebar';
import HeroPipeline from '@/features/devices/components/HeroPipeline';
import DeviceFinder from '@/features/devices/components/DeviceFinder';
import ActivityFeed from '@/features/audit/components/ActivityFeed';
import useDeviceStore from '@/features/devices/stores/deviceStore';
import useAuth from '@/features/auth/useAuth';

import './Dashboard.css';

// Polls the activity feed + stats so the dashboard reflects scans/registrations
// without a manual reload. 20s is unobtrusive and well inside the cache TTL.
const REFRESH_MS = 20_000;

function formatDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSync(d) {
  if (!d) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `synced ${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `synced ${mins}m ago`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stats, recentAudit, fetchStats, fetchRecentAudit } = useDeviceStore();

  useEffect(() => {
    fetchStats();
    fetchRecentAudit();
    const t = setInterval(() => {
      fetchStats();
      fetchRecentAudit();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Re-derives whenever fetched data changes (which fires after each interval tick).
  const lastSync = useMemo(() => new Date(), [stats, recentAudit]); // eslint-disable-line react-hooks/exhaustive-deps

  const userLabel = user
    ? `${(user.name || user.email).toUpperCase()} · ${(user.role || '').toUpperCase()}`
    : '';

  return (
    <div className="dashboard-v2">
      <AppSidebar />

      <div className="col">
        <header className="top">
          <div className="right">
            <span>
              <span className="dot" />
              Live · {formatSync(lastSync)}
            </span>
            <span>{formatDate()}</span>
            {userLabel && <span className="who">{userLabel}</span>}
          </div>
        </header>

        <main>
          <HeroPipeline stats={stats} />

          <section className="actions">
            <DeviceFinder />
          </section>

          <ActivityFeed
            entries={recentAudit}
            onViewAll={() => navigate('/devices')}
          />
        </main>
      </div>
    </div>
  );
}
