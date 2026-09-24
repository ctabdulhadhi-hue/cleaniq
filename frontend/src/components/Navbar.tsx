import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Activity } from 'lucide-react';

interface NavbarProps {
  backendConnected: boolean | null;
  activeSessions?: number;
}

export function Navbar({ backendConnected, activeSessions = 0 }: NavbarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  function handleLogoClick() {
    if (location.pathname === '/dashboard') {
      navigate('/');
    } else if (location.pathname !== '/') {
      navigate('/dashboard');
    }
  }

  return (
    <header className="h-16 border-b border-[rgba(255,255,255,0.08)] bg-[#0c0c0e]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      <button
        type="button"
        id="app-navbar-logo-btn"
        onClick={handleLogoClick}
        className="flex items-center gap-3 cursor-pointer group hover:opacity-90 hover:brightness-105 transition-all duration-150 bg-transparent border-none p-0 text-left"
        aria-label="CleanIQ Logo Navigation"
      >
        <img
          src="/logo-dark-bg.svg"
          alt="CleanIQ"
          className="h-8 w-auto object-contain transition-transform duration-150 group-hover:scale-[1.02]"
        />
        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#ff6a3d]/10 text-[#ffb08a] border border-[#ff6a3d]/25 hidden sm:inline-block">
          v1.0-alpha
        </span>
      </button>

      <div className="flex items-center gap-4">
        {/* Core Principle Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.03] border border-[rgba(255,255,255,0.08)] text-xs text-[#8a8a86]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 status-dot-pulse shrink-0" />
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#f2f2f0]">Explicit Approval Required</span>
        </div>

        {/* Backend Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.03] border border-[rgba(255,255,255,0.08)] text-xs">
          <Activity className="w-3.5 h-3.5 text-[#8a8a86]" />
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                backendConnected === true
                  ? 'bg-emerald-400 status-dot-pulse'
                  : backendConnected === false
                  ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-[#f2f2f0]">
              {backendConnected === true
                ? 'Backend Online'
                : backendConnected === false
                ? 'Backend Offline'
                : 'Connecting...'}
            </span>
          </div>
          {backendConnected && (
            <span className="text-[#8a8a86] border-l border-[rgba(255,255,255,0.08)] pl-2 text-[11px]">
              {activeSessions} session{activeSessions === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
