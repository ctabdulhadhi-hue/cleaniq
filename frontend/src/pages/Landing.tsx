import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Droplet,
  CopyCheck,
  Gauge,
  CheckCircle2,
  Menu,
  X,
} from 'lucide-react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { SplitText } from '../components/reactbits/SplitText';
import { TiltCard } from '../components/reactbits/TiltCard';
import { Preloader } from '../components/effects/Preloader';
import { MagneticButton } from '../components/effects/MagneticButton';
import { MarqueePartners } from '../components/effects/MarqueePartners';
import { useCountUp } from '../hooks/useCountUp';
import { loadSampleDataset } from '../services/api';
import { LinkedinIcon, GithubIcon } from '../components/icons/SocialIcons';

const DarkVeil = lazy(() => import('../components/effects/DarkVeil'));

export function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  const handleTrySample = async () => {
    try {
      setLoadingSample(true);
      const res = await loadSampleDataset();
      navigate(`/dataset?id=${encodeURIComponent(res.dataset_id)}`);
    } catch (err) {
      console.error('Failed to load sample dataset:', err);
      navigate('/dashboard');
    } finally {
      setLoadingSample(false);
    }
  };

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Smooth scroll (Lenis) - Landing page only, destroyed on unmount
  useEffect(() => {
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
      document.body.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
    };
  }, [prefersReducedMotion]);

  // Lock body scroll when full-screen mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Scroll-triggered reveal for Quality Score Card
  const statCardRef = useRef<HTMLDivElement>(null);
  const [hasScrolledIntoView, setHasScrolledIntoView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (hasScrolledIntoView || prefersReducedMotion) {
      return;
    }

    const card = statCardRef.current;
    if (!card) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasScrolledIntoView(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, [hasScrolledIntoView, prefersReducedMotion]);

  // Animated counters for the stat card
  const scoreCount = useCountUp(hasScrolledIntoView ? 94 : 0, { duration: 1100 });
  const completenessCount = useCountUp(hasScrolledIntoView ? 96 : 0, { duration: 1100 });
  const consistencyCount = useCountUp(hasScrolledIntoView ? 92 : 0, { duration: 1100 });
  const validityCount = useCountUp(hasScrolledIntoView ? 95 : 0, { duration: 1100 });
  const uniquenessCount = useCountUp(hasScrolledIntoView ? 93 : 0, { duration: 1100 });

  function handleLogoClick() {
    if (location.pathname === '/dashboard') {
      navigate('/');
    } else if (location.pathname !== '/') {
      navigate('/dashboard');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-[#f2f2f0] font-sans selection:bg-[#ff6a3d]/30 selection:text-[#ffb08a]">
      {/* SECTION 0: BRANDED PRELOADER (First Visit Only) */}
      <Preloader />

      {/* SECTION 1: NAVBAR */}
      <header className="sticky top-0 z-50 bg-[#0c0c0e]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.08)]">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          {/* Logo / Wordmark */}
          <button
            type="button"
            id="landing-navbar-logo-btn"
            onClick={handleLogoClick}
            className="flex items-center cursor-pointer group hover:opacity-90 hover:brightness-105 transition-all duration-150 bg-transparent border-none p-0 text-left"
            aria-label="CleanIQ Logo"
          >
            <img
              src="/logo-dark-bg.svg"
              alt="CleanIQ"
              className="h-8 w-auto object-contain transition-transform duration-150 group-hover:scale-[1.02]"
            />
          </button>

          {/* Centered Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#93938e]">
            <a href="#product" className="hover:text-white transition-colors">
              Product
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
            <a href="#resources" className="hover:text-white transition-colors">
              Resources
            </a>
          </nav>

          {/* Sign in Pill Button (Desktop), Social Icons & Hamburger Menu (Mobile) */}
          <div className="flex items-center gap-3">
            {/* Social Icons Group (Desktop): LinkedIn immediately left of GitHub */}
            <div className="hidden sm:flex items-center gap-1 mr-1">
              <a
                href="https://www.linkedin.com/in/abdul-hadhi-707134382"
                target="_blank"
                rel="noopener noreferrer"
                id="navbar-linkedin-link"
                className="p-2 rounded-lg text-[#93938e] hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="LinkedIn"
                title="LinkedIn Profile"
              >
                <LinkedinIcon className="w-4 h-4" />
              </a>
              <a
                href="https://github.com/ctabdulhadhi"
                target="_blank"
                rel="noopener noreferrer"
                id="navbar-github-link"
                className="p-2 rounded-lg text-[#93938e] hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="GitHub"
                title="GitHub"
              >
                <GithubIcon className="w-4 h-4" />
              </a>
            </div>

            <Link
              to="/dashboard"
              className="hidden md:inline-block px-5 py-2 rounded-full text-xs font-semibold text-white border border-[rgba(255,255,255,0.15)] hover:bg-white/10 transition-all"
            >
              Sign in
            </Link>

            <button
              type="button"
              id="mobile-menu-toggle-btn"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="md:hidden p-2 rounded-lg text-[#93938e] hover:text-white hover:bg-white/5 transition-colors focus:outline-none"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* FULL-SCREEN MOBILE MENU OVERLAY */}
      <div
        id="fullscreen-mobile-menu"
        className={`fixed inset-0 z-50 bg-[#0c0c0e]/98 backdrop-blur-2xl flex flex-col justify-between p-8 md:hidden transition-all duration-300 ease-in-out ${
          isMobileMenuOpen
            ? 'opacity-100 pointer-events-auto translate-y-0'
            : 'opacity-0 pointer-events-none -translate-y-3'
        }`}
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="flex items-center justify-between">
          <img src="/logo-dark-bg.svg" alt="CleanIQ" className="h-8 w-auto object-contain" />
          <button
            type="button"
            id="mobile-menu-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2.5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex flex-col gap-6 my-auto text-left">
          <a
            href="#product"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-3xl font-bold tracking-tight text-white/90 hover:text-[#ff6a3d] transition-colors"
          >
            Product
          </a>
          <a
            href="#features"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-3xl font-bold tracking-tight text-white/90 hover:text-[#ff6a3d] transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-3xl font-bold tracking-tight text-white/90 hover:text-[#ff6a3d] transition-colors"
          >
            Pricing
          </a>
          <a
            href="#resources"
            onClick={() => setIsMobileMenuOpen(false)}
            className="text-3xl font-bold tracking-tight text-white/90 hover:text-[#ff6a3d] transition-colors"
          >
            Resources
          </a>
        </nav>

        <div className="pt-6 border-t border-white/10 flex flex-col gap-4">
          <Link
            to="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-full text-center py-4 rounded-xl bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] font-bold text-base transition-colors"
          >
            Sign in
          </Link>
          {/* Social Icons row at the bottom of mobile menu */}
          <div className="flex items-center justify-center gap-3 py-1">
            <a
              href="https://www.linkedin.com/in/abdul-hadhi-707134382"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-full bg-white/5 border border-white/10 text-[#93938e] hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
              aria-label="LinkedIn"
              title="LinkedIn Profile"
            >
              <LinkedinIcon className="w-5 h-5" />
            </a>
            <a
              href="https://github.com/ctabdulhadhi"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-full bg-white/5 border border-white/10 text-[#93938e] hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
              aria-label="GitHub"
              title="GitHub"
            >
              <GithubIcon className="w-5 h-5" />
            </a>
          </div>
          <p className="text-center text-xs text-[#71716b]">
            Controlled tabular data cleaning with zero data leakage
          </p>
        </div>
      </div>

      {/* SECTION 2: HERO */}
      <section className="relative pt-24 pb-28 px-6 md:px-12 text-center overflow-hidden">
        {/* DarkVeil Shader Background (WebGL via ogl, Lazy-loaded, pauses off-screen, respects prefers-reduced-motion) */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {!prefersReducedMotion ? (
            <Suspense fallback={<div className="w-full h-full bg-[#0a0a0c]" />}>
              <DarkVeil
                hueShift={208}
                noiseIntensity={0.05}
                scanlineIntensity={0}
                speed={0.3}
                scanlineFrequency={0}
                warpAmount={0.15}
                resolutionScale={0.75}
              />
            </Suspense>
          ) : (
            <div className="w-full h-full bg-[#0a0a0c]" />
          )}
        </div>

        {/* Radial dark vignette overlay to keep generative glow centered behind hero headline */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, transparent 0%, #0a0a0c 75%)',
          }}
        />

        {/* Dark gradient overlay between canvas (z-0) and text (z-[2]) for legibility and seamless page fade */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(10, 10, 12, 0.25) 0%, rgba(10, 10, 12, 0.65) 60%, #0c0c0e 100%)',
          }}
        />

        {/* Existing hero content: relative z-[2] so it renders above canvas & gradient */}
        <div className="relative z-[2] max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#ff6a3d]/10 text-[#ffb08a] border border-[#ff6a3d]/30 mb-8">
            <Sparkles className="w-3.5 h-3.5 text-[#ff6a3d]" />
            <span>AI-assisted data cleaning</span>
          </div>

          {/* React Bits Animated Headline with two-tone coloring intact */}
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white max-w-4xl mx-auto leading-[1.15] mb-6 flex flex-col items-center justify-center gap-1.5">
            <SplitText
              text="Turn messy data into"
              className="text-white justify-center"
              splitType="words"
              delay={45}
              duration={0.6}
            />
            <SplitText
              text="clean decisions"
              className="text-[#ff6a3d] justify-center"
              splitType="words"
              delay={45}
              duration={0.6}
            />
          </h1>

          <p className="text-base md:text-lg text-[#93938e] max-w-2xl mx-auto leading-relaxed mb-10">
            Automate missing value imputation, duplicate detection, and transparent quality scoring in seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-20">
            {/* Magnetic primary CTA on desktop */}
            <MagneticButton>
              <Link
                to="/dashboard"
                id="try-cleaniq-btn"
                className="w-full sm:w-auto inline-flex items-center justify-center bg-[#ff6a3d] hover:bg-[#ff7b50] text-[#0c0c0e] font-semibold px-7 py-3.5 rounded-xl transition-all cursor-pointer shadow-none text-sm"
              >
                Try CleanIQ
              </Link>
            </MagneticButton>

            <button
              type="button"
              id="try-sample-btn"
              onClick={handleTrySample}
              disabled={loadingSample}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-[rgba(255,255,255,0.15)] hover:bg-white/5 text-slate-200 font-medium px-7 py-3.5 rounded-xl transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {loadingSample ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Loading sample...</span>
                </>
              ) : (
                <span>Try with sample data</span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 3: INFINITELY SCROLLING HORIZONTAL MARQUEE TECH-PARTNER STRIP */}
      <MarqueePartners />

      {/* SECTION 4: 3-CARD FEATURE SECTION */}
      <section id="features" className="py-24 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-4">
            Everything your dataset needs, in one pass
          </h2>
          <p className="text-sm md:text-base text-[#8a8a86]">
            Inspect, clean, and validate complex tabular datasets with full step auditability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Missing Values */}
          <TiltCard
            delay={0}
            tiltAmplitude={6}
            spotlightColor="rgba(255, 106, 61, 0.12)"
            className="bg-[#131317] border border-[rgba(255,255,255,0.08)] rounded-[14px] p-7 flex flex-col justify-between hover:border-[rgba(255,255,255,0.15)]"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#ff6a3d]/10 border border-[#ff6a3d]/20 flex items-center justify-center mb-6">
                <Droplet className="w-5.5 h-5.5 text-[#ff6a3d]" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Missing Values</h3>
              <p className="text-sm text-[#8a8a86] leading-relaxed">
                Preview smart fills and statistical imputations across affected columns before applying changes.
              </p>
            </div>
          </TiltCard>

          {/* Card 2: Duplicate Detection */}
          <TiltCard
            delay={0.1}
            tiltAmplitude={6}
            spotlightColor="rgba(255, 106, 61, 0.12)"
            className="bg-[#131317] border border-[rgba(255,255,255,0.08)] rounded-[14px] p-7 flex flex-col justify-between hover:border-[rgba(255,255,255,0.15)]"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#ff6a3d]/10 border border-[#ff6a3d]/20 flex items-center justify-center mb-6">
                <CopyCheck className="w-5.5 h-5.5 text-[#ff6a3d]" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Duplicate Detection</h3>
              <p className="text-sm text-[#8a8a86] leading-relaxed">
                Identify exact and fuzzy row duplicates instantly with full audit trail control.
              </p>
            </div>
          </TiltCard>

          {/* Card 3: Quality Scoring */}
          <TiltCard
            delay={0.2}
            tiltAmplitude={6}
            spotlightColor="rgba(255, 106, 61, 0.12)"
            className="bg-[#131317] border border-[rgba(255,255,255,0.08)] rounded-[14px] p-7 flex flex-col justify-between hover:border-[rgba(255,255,255,0.15)]"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#ff6a3d]/10 border border-[#ff6a3d]/20 flex items-center justify-center mb-6">
                <Gauge className="w-5.5 h-5.5 text-[#ff6a3d]" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Quality Scoring</h3>
              <p className="text-sm text-[#8a8a86] leading-relaxed">
                A transparent score built from four measurable factors: completeness, consistency, validity, and uniqueness.
              </p>
            </div>
          </TiltCard>
        </div>
      </section>

      {/* SECTION 5: TWO-COLUMN PROOF SECTION */}
      <section id="product" className="pb-28 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column */}
          <div>
            <span className="text-xs font-semibold text-[#ff6a3d] tracking-wider uppercase mb-3 block">
              Auditable & Transparent
            </span>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-5 leading-tight">
              Confidence in every dataset
            </h2>
            <p className="text-sm md:text-base text-[#8a8a86] leading-relaxed mb-8">
              CleanIQ keeps your team in control. Preview every transformation, track full step histories, and export comprehensive quality reports.
            </p>
            <ul className="space-y-4 text-sm font-medium text-slate-200">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#ff6a3d] shrink-0" />
                <span>Full operation history</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#ff6a3d] shrink-0" />
                <span>Undo any step</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#ff6a3d] shrink-0" />
                <span>Exportable quality reports</span>
              </li>
            </ul>
          </div>

          {/* Right Column: Dark Stat Card with Scroll-Triggered Reveal & Spotlight */}
          <div ref={statCardRef}>
            <TiltCard
              tiltAmplitude={5}
              spotlightColor="rgba(255, 106, 61, 0.14)"
              className="bg-[#131317] border border-[rgba(255,255,255,0.08)] rounded-[14px] p-8 md:p-10 shadow-lg hover:border-[rgba(255,255,255,0.15)]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#8a8a86] uppercase tracking-wider">
                  Overall Dataset Health
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ▲ 12% Improved
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-5xl md:text-6xl font-extrabold text-white tracking-tight">
                  {scoreCount}
                </span>
                <span className="text-2xl font-bold text-[#71716b]">/ 100</span>
              </div>

              {/* 4-Bar Quality Breakdown Chart with Scroll-Triggered Growth */}
              <div className="space-y-4 pt-4 border-t border-[rgba(255,255,255,0.08)]">
                <p className="text-xs font-medium text-[#71716b] uppercase tracking-wider mb-3">
                  Dimension Breakdown
                </p>

                {/* Completeness Bar */}
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-slate-300">Completeness</span>
                    <span className="text-[#ff6a3d]">{completenessCount}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#ff6a3d] rounded-full"
                      style={{
                        width: hasScrolledIntoView ? '96%' : '0%',
                        transition: prefersReducedMotion
                          ? 'none'
                          : 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>

                {/* Consistency Bar */}
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-slate-300">Consistency</span>
                    <span className="text-slate-400">{consistencyCount}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-400/80 rounded-full"
                      style={{
                        width: hasScrolledIntoView ? '92%' : '0%',
                        transition: prefersReducedMotion
                          ? 'none'
                          : 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>

                {/* Validity Bar */}
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-slate-300">Validity</span>
                    <span className="text-slate-400">{validityCount}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-400/80 rounded-full"
                      style={{
                        width: hasScrolledIntoView ? '95%' : '0%',
                        transition: prefersReducedMotion
                          ? 'none'
                          : 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>

                {/* Uniqueness Bar */}
                <div>
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-slate-300">Uniqueness</span>
                    <span className="text-slate-400">{uniquenessCount}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-400/80 rounded-full"
                      style={{
                        width: hasScrolledIntoView ? '93%' : '0%',
                        transition: prefersReducedMotion
                          ? 'none'
                          : 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Landing;
