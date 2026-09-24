import React, { useRef, useState, useEffect } from 'react';

export interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  tiltAmplitude?: number; // subtle degrees, e.g. 5-8
  liftOnHover?: boolean;
  spotlightColor?: string;
  delay?: number; // stagger delay in seconds
  animateOnScroll?: boolean;
}

export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  tiltAmplitude = 6,
  liftOnHover = true,
  spotlightColor = 'rgba(255, 106, 61, 0.14)',
  delay = 0,
  animateOnScroll = true,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(!animateOnScroll);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; opacity: number }>({
    x: 0,
    y: 0,
    opacity: 0,
  });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mq.addEventListener('change', handleMotionChange);
    return () => mq.removeEventListener('change', handleMotionChange);
  }, []);

  useEffect(() => {
    if (!animateOnScroll || reducedMotion) {
      setInView(true);
      return;
    }

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [animateOnScroll, reducedMotion]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const normX = x / rect.width - 0.5;
    const normY = y / rect.height - 0.5;

    setTilt({
      x: -normY * tiltAmplitude,
      y: normX * tiltAmplitude,
    });

    setSpotlight({
      x,
      y,
      opacity: 1,
    });
  };

  const handleMouseEnter = () => {
    if (reducedMotion) return;
    setSpotlight((prev) => ({ ...prev, opacity: 1 }));
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setSpotlight((prev) => ({ ...prev, opacity: 0 }));
  };

  // If reduced motion is preferred, render static card without 3D transforms
  if (reducedMotion) {
    return (
      <div
        ref={cardRef}
        className={`relative ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  const transformStyle = [
    `perspective(1000px)`,
    `rotateX(${tilt.x.toFixed(2)}deg)`,
    `rotateY(${tilt.y.toFixed(2)}deg)`,
    liftOnHover && (tilt.x !== 0 || tilt.y !== 0) ? `translateY(-3px)` : `translateY(0)`,
  ].join(' ');

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative transition-all duration-300 ease-out will-change-transform ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
      style={{
        transform: inView ? transformStyle : 'translateY(24px)',
        transitionDelay: `${delay}s`,
        transitionProperty: 'transform, opacity, border-color, box-shadow',
        ...props.style,
      }}
      {...props}
    >
      {/* Dynamic React Bits cursor spotlight overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 ease-in-out -z-0"
        style={{
          opacity: spotlight.opacity,
          background: `radial-gradient(380px circle at ${spotlight.x}px ${spotlight.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
};

export const SpotlightCard = TiltCard;
export default TiltCard;
