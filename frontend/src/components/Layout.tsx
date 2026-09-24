import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { checkBackendHealth } from '../services/api';

// Cache in module scope to prevent status dot flickering on route changes
let cachedBackendConnected: boolean | null = null;
let cachedActiveSessions = 0;

export function Layout() {
  const [backendConnected, setBackendConnected] = useState<boolean | null>(cachedBackendConnected);
  const [activeSessions, setActiveSessions] = useState<number>(cachedActiveSessions);

  useEffect(() => {
    let isMounted = true;
    const check = async () => {
      try {
        const data = await checkBackendHealth();
        if (isMounted) {
          cachedBackendConnected = true;
          cachedActiveSessions = data.active_sessions || 0;
          setBackendConnected(true);
          setActiveSessions(cachedActiveSessions);
        }
      } catch {
        if (isMounted) {
          cachedBackendConnected = false;
          setBackendConnected(false);
        }
      }
    };

    check();
    const interval = setInterval(check, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f2f2f0] flex flex-col font-sans selection:bg-[#ff6a3d]/30 selection:text-[#ffb08a]">
      <Navbar backendConnected={backendConnected} activeSessions={activeSessions} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8 bg-[#0a0a0c]">
          <div className="w-full">
            <Outlet context={{ backendConnected, activeSessions }} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout;
