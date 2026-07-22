import { Link } from 'react-router-dom'
import { LogoLockup } from '../../../components/Logo'

// The cover. Purple field, animated isotherm contours (the signature), ruled
// hairlines drawing in, one orchestrated .rise stagger. Primary CTA → /login.
export function LandingHero() {
  return (
    <section className="relative min-h-svh flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      {/* Isotherm contour drift — the logo's curve language at field scale */}
      <svg
        className="lv-contour absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none"
      >
        <path d="M -80 660 C 240 560, 480 760, 800 640 S 1300 520, 1560 620" stroke="#E8432D" strokeOpacity="0.14" strokeWidth="2" />
        <path d="M -80 740 C 280 640, 520 840, 860 720 S 1340 620, 1560 710" stroke="#E8432D" strokeOpacity="0.10" strokeWidth="2" />
        <path d="M -80 820 C 320 730, 560 910, 920 800 S 1380 710, 1560 790" stroke="#7f78cb" strokeOpacity="0.12" strokeWidth="2" />
      </svg>

      {/* Masthead */}
      <header className="relative flex items-center justify-between px-5 sm:px-10 py-5 border-b border-slate-800">
        <LogoLockup variant="reverse" className="[&_span]:text-[11px] rise" />
        <Link
          to="/login"
          className="rise text-[13px] font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-sm px-4 py-2 transition-colors"
          style={{ '--rise-i': 1 } as React.CSSProperties}
        >
          Sign in
        </Link>
      </header>

      {/* Title block */}
      <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="lv-rule h-px w-full max-w-xl bg-slate-800 mb-10" />
        <p className="rise font-mono text-[11px] uppercase tracking-[0.22em] text-slate-400 mb-5"
           style={{ '--rise-i': 1 } as React.CSSProperties}>
          Isotherm Engineering · Cx System
        </p>
        <h1 className="rise font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.02] tracking-[-0.02em] max-w-3xl"
            style={{ '--rise-i': 2 } as React.CSSProperties}>
          Commissioning management,<br className="hidden sm:block" /> built by commissioning agents.
        </h1>
        <p className="rise mt-6 text-[15px] sm:text-base text-slate-400 max-w-xl leading-relaxed"
           style={{ '--rise-i': 3 } as React.CSSProperties}>
          One connected record from IVC to final report — the issues log is the backbone.
        </p>
        <div className="rise mt-10 flex items-center gap-6" style={{ '--rise-i': 4 } as React.CSSProperties}>
          <Link
            to="/login"
            className="bg-white text-slate-900 font-semibold text-sm rounded-sm px-7 py-3 hover:bg-slate-100 transition-colors"
          >
            Sign in
          </Link>
          <a href="#capabilities" className="text-[13px] text-slate-400 hover:text-white transition-colors">
            What it does ↓
          </a>
        </div>
        <div className="lv-rule h-px w-full max-w-xl bg-slate-800 mt-10" style={{ animationDelay: '250ms' }} />
      </div>
    </section>
  )
}
