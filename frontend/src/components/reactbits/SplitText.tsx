import React, { useEffect, useState, useMemo } from 'react';

export interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number; // ms per item
  duration?: number; // seconds
  splitType?: 'words' | 'chars';
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';
  textAlign?: React.CSSProperties['textAlign'];
  onAnimationComplete?: () => void;
}

export const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = '',
  delay = 35,
  duration = 0.5,
  splitType = 'words',
  tag = 'span',
  textAlign,
  onAnimationComplete,
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const items = useMemo(() => {
    if (splitType === 'chars') {
      return text.split('');
    }
    return text.split(' ');
  }, [text, splitType]);

  const Tag = tag;

  // Reduced motion: fall back to plain static text
  if (prefersReducedMotion || !isMounted) {
    return (
      <Tag className={className} style={{ textAlign }}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag
      className={`${className} inline-flex flex-wrap`}
      style={{ textAlign }}
      aria-label={text}
    >
      {items.map((item, index) => {
        const itemDelay = (index * delay) / 1000;
        const isSpace = item === ' ';
        const content = isSpace ? '\u00A0' : item;

        return (
          <span
            key={`${item}-${index}`}
            className="inline-block transition-all ease-out split-item"
            style={{
              animation: `reactbits-split-reveal ${duration}s cubic-bezier(0.16, 1, 0.3, 1) both`,
              animationDelay: `${itemDelay}s`,
              marginRight: splitType === 'words' && index < items.length - 1 ? '0.28em' : undefined,
              willChange: 'transform, opacity, filter',
            }}
            onAnimationEnd={index === items.length - 1 ? onAnimationComplete : undefined}
          >
            {content}
          </span>
        );
      })}
    </Tag>
  );
};

export default SplitText;
