import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Layout } from '../Layout';
import { OrangeWipeOverlay } from './OrangeWipeOverlay';

// Code-split route components to optimize production bundle size
const Landing = lazy(() => import('../../pages/Landing').then((m) => ({ default: m.Landing })));
const Dashboard = lazy(() => import('../../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Upload = lazy(() => import('../../pages/Upload').then((m) => ({ default: m.Upload })));
const Dataset = lazy(() => import('../../pages/Dataset').then((m) => ({ default: m.Dataset })));
const Cleaning = lazy(() => import('../../pages/Cleaning').then((m) => ({ default: m.Cleaning })));
const Visualization = lazy(() => import('../../pages/Visualization').then((m) => ({ default: m.Visualization })));
const History = lazy(() => import('../../pages/History').then((m) => ({ default: m.History })));

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500/20 border-t-orange-500 animate-spin" />
        <span className="text-xs font-mono text-zinc-500 tracking-wider">LOADING...</span>
      </div>
    </div>
  );
}

function isLandingPath(path: string): boolean {
  return path === '/' || path === '/landing';
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.2, 0.8, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: 0.25,
      ease: [0.2, 0.8, 0.2, 1],
    },
  },
};

const reducedMotionVariants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 1, y: 0, transition: { duration: 0 } },
};

export function AnimatedRoutes() {
  const location = useLocation();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Check prefers-reduced-motion updates
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Track mode switch between Landing and App to trigger orange wipe overlay
  const [prevPath, setPrevPath] = useState(location.pathname);
  const [isWiping, setIsWiping] = useState(false);

  if (prevPath !== location.pathname) {
    const wasLanding = isLandingPath(prevPath);
    const isNowLanding = isLandingPath(location.pathname);
    setPrevPath(location.pathname);

    // Only wipe when crossing between Landing and App modes
    if (!prefersReducedMotion && wasLanding !== isNowLanding) {
      setIsWiping(true);
    } else {
      setIsWiping(false);
    }
  }

  useEffect(() => {
    if (isWiping) {
      const timer = setTimeout(() => {
        setIsWiping(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isWiping]);

  return (
    <>
      {/* Orange-tinted overlay wipe for Landing <-> App mode switch */}
      {isWiping && <OrangeWipeOverlay />}

      {/* Shared Page Transition Layer wrapping all routes */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          variants={prefersReducedMotion ? reducedMotionVariants : pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="w-full flex-1 flex flex-col min-h-screen"
        >
          <Suspense fallback={<PageFallback />}>
            <Routes location={location}>
              {/* Public Marketing Landing Page */}
              <Route path="/" element={<Landing />} />
              <Route path="/landing" element={<Landing />} />

              {/* Authenticated / Main Application */}
              <Route path="/app" element={<Navigate to="/dashboard" replace />} />
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/dataset" element={<Dataset />} />
                <Route path="/cleaning" element={<Cleaning />} />
                <Route path="/visualization" element={<Visualization />} />
                <Route path="/history" element={<History />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default AnimatedRoutes;
