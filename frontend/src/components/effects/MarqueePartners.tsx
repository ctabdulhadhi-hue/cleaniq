import { useState, useEffect } from 'react';
import { Code2, Flame, Cpu, Database, Brain } from 'lucide-react';

const PARTNERS = [
  { name: 'Pandas', icon: Code2 },
  { name: 'FastAPI', icon: Flame },
  { name: 'React', icon: Cpu },
  { name: 'PostgreSQL', icon: Database },
  { name: 'Gemini', icon: Brain },
];

export function MarqueePartners() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return (
    <section className="py-10 px-6 border-y border-[rgba(255,255,255,0.06)] bg-[#09090b]/50 text-center overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <p className="text-xs uppercase font-medium tracking-wider text-[#71716b] mb-6">
          Partnering with tools data teams already trust
        </p>

        {prefersReducedMotion ? (
          /* Static row for reduced motion */
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 text-sm font-medium text-[#8a8a86]">
            {PARTNERS.map((partner) => {
              const Icon = partner.icon;
              return (
                <div key={partner.name} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#71716b]" />
                  <span>{partner.name}</span>
                </div>
              );
            })}
          </div>
        ) : (
          /* Continuous looping horizontal marquee with edge mask and pause on hover */
          <div className="marquee-container relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <style>{`
              @keyframes marquee-scroll {
                0% {
                  transform: translateX(0%);
                }
                100% {
                  transform: translateX(-50%);
                }
              }
              .marquee-inner {
                display: flex;
                width: max-content;
                animation: marquee-scroll 24s linear infinite;
              }
              .marquee-container:hover .marquee-inner {
                animation-play-state: paused;
              }
            `}</style>
            <div className="marquee-inner">
              {/* First Track */}
              <div className="flex items-center gap-12 md:gap-18 pr-12 md:pr-18 text-sm font-medium text-[#8a8a86]">
                {PARTNERS.map((partner) => {
                  const Icon = partner.icon;
                  return (
                    <div
                      key={`track1-${partner.name}`}
                      className="flex items-center gap-2.5 transition-colors hover:text-white cursor-default shrink-0"
                    >
                      <Icon className="w-4 h-4 text-[#71716b] transition-colors group-hover:text-[#ff6a3d]" />
                      <span>{partner.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Second Track for Seamless Continuous Looping */}
              <div
                className="flex items-center gap-12 md:gap-18 pr-12 md:pr-18 text-sm font-medium text-[#8a8a86]"
                aria-hidden="true"
              >
                {PARTNERS.map((partner) => {
                  const Icon = partner.icon;
                  return (
                    <div
                      key={`track2-${partner.name}`}
                      className="flex items-center gap-2.5 transition-colors hover:text-white cursor-default shrink-0"
                    >
                      <Icon className="w-4 h-4 text-[#71716b] transition-colors group-hover:text-[#ff6a3d]" />
                      <span>{partner.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default MarqueePartners;
