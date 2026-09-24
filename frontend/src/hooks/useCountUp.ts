import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  duration?: number; // duration in milliseconds (default: 600ms)
  decimals?: number; // number of decimal places (default: 0)
}

/**
 * useCountUp
 * Animates a numeric value counting up/down when targetValue changes over ~0.6s.
 * Does NOT animate on re-renders when targetValue is unchanged.
 * Respects prefers-reduced-motion by updating immediately without animation.
 */
export function useCountUp(targetValue: number, options: UseCountUpOptions = {}): number {
  const { duration = 600, decimals = 0 } = options;
  const [displayValue, setDisplayValue] = useState<number>(targetValue);
  const prevTargetRef = useRef<number>(targetValue);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // If targetValue hasn't changed, do not count up on simple re-renders
    if (prevTargetRef.current === targetValue) {
      return;
    }

    const startValue = prevTargetRef.current;
    prevTargetRef.current = targetValue;

    // Respect prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || duration <= 0) {
      setDisplayValue(targetValue);
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: 1 - (1 - t)^3
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (targetValue - startValue) * ease;

      const factor = Math.pow(10, decimals);
      setDisplayValue(Math.round(current * factor) / factor);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
      }
    };

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [targetValue, duration, decimals]);

  return displayValue;
}

export default useCountUp;
