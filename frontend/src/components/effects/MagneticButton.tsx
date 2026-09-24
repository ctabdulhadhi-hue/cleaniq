import { useState, useRef, useEffect } from 'react';
import type { ReactNode, ComponentPropsWithoutRef } from 'react';

interface MagneticButtonProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
  maxDistance?: number;
  className?: string;
}

export function MagneticButton({
  children,
  maxDistance = 6,
  className = '',
  ...props
}: MagneticButtonProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only enable on desktop with fine pointer (not touch) and without reduced motion
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsEnabled(hasFinePointer && !prefersReducedMotion);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEnabled || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) * 0.22;
    const deltaY = (e.clientY - centerY) * 0.22;

    const clampedX = Math.max(-maxDistance, Math.min(maxDistance, deltaX));
    const clampedY = Math.max(-maxDistance, Math.min(maxDistance, deltaY));

    setPosition({ x: clampedX, y: clampedY });
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (!isEnabled) return;
    setPosition({ x: 0, y: 0 });
    setIsHovered(false);
  };

  return (
    <div
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`inline-block will-change-transform ${className}`}
      style={
        isEnabled
          ? {
              transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
              transition: isHovered
                ? 'transform 0.12s cubic-bezier(0.2, 0, 0, 1)'
                : 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)',
            }
          : undefined
      }
      {...props}
    >
      {children}
    </div>
  );
}

export default MagneticButton;
