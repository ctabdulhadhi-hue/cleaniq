import { useState, useEffect, useRef } from 'react';

interface PreloaderProps {
  onComplete?: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [shouldRender, setShouldRender] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isAlreadySeen = sessionStorage.getItem('cleaniq_preloader_seen') === 'true';
    return !isReducedMotion && !isAlreadySeen;
  });

  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (!shouldRender) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const duration = 950; // ~950ms counter animation
    const startTime = performance.now();
    let rafId: number;

    const tick = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
      const currentPercent = Math.min(100, Math.round(easedProgress * 100));

      setProgress(currentPercent);

      if (rawProgress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Mark session seen and initiate fade-out
        try {
          sessionStorage.setItem('cleaniq_preloader_seen', 'true');
        } catch {
          // Ignore storage restrictions
        }
        setIsFadingOut(true);

        setTimeout(() => {
          setShouldRender(false);
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
          }
        }, 320); // match 300ms fade transition
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [shouldRender, onComplete]);

  if (!shouldRender) return null;

  return (
    <div
      id="cleaniq-preloader"
      className={`fixed inset-0 z-[9999] bg-[#0a0a0c] flex flex-col items-center justify-center transition-opacity duration-300 ease-out select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
      aria-hidden={isFadingOut}
    >
      <div className="flex flex-col items-center">
        {/* Brand Checkmark Icon */}
        <div className="relative mb-6">
          <div className="absolute -inset-4 bg-[#ff6a3d]/20 rounded-full blur-xl animate-pulse pointer-events-none" />
          <img
            src="/logo-icon.svg"
            alt="CleanIQ"
            className="w-14 h-14 md:w-16 md:h-16 relative z-10 drop-shadow-[0_0_20px_rgba(255,106,61,0.4)]"
          />
        </div>

        {/* Percentage Counter */}
        <div className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
          {progress}%
        </div>

        {/* Minimal Progress Bar */}
        <div className="w-36 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#ff6a3d] rounded-full transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <span className="mt-3 text-[11px] font-medium tracking-widest uppercase text-[#71716b]">
          CleanIQ Engine
        </span>
      </div>
    </div>
  );
}

export default Preloader;
