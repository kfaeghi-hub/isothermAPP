// The reduced-motion variant: a clean static page — no Lenis, no GSAP, no
// canvas. Same content, plain stacked flow, flat contour SVG (held still by
// the reduced-motion CSS). This is a first-class render path, not a degraded
// afterthought.

import { Link } from 'react-router-dom'
import { LogoLockup } from '../../components/Logo'
import { CssContour } from './CssContour'
import { LandingFooter } from './sections/LandingFooter'
import { PHRASES } from './CinematicLanding'

export function StaticLanding() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <section className="relative overflow-hidden">
        <CssContour />
        <header className="relative flex items-center justify-between px-5 sm:px-10 py-5 border-b border-slate-800">
          <LogoLockup variant="reverse" className="[&_span]:text-[11px]" />
          <Link to="/login"
            className="text-[13px] font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-sm px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            Sign in
          </Link>
        </header>
        <div className="relative text-center px-6 py-24 sm:py-32">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-6">
            Isotherm Engineering · Cx System
          </p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.05] tracking-[-0.02em] max-w-4xl mx-auto">
            Commissioning management, built by commissioning agents.
          </h1>
          <Link to="/login"
            className="inline-block mt-10 bg-white text-slate-900 font-semibold text-sm rounded-sm px-7 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2">
            Sign in
          </Link>
        </div>
      </section>

      <section className="border-t border-slate-800 px-6 py-16" aria-label="Capabilities">
        <ul className="max-w-3xl mx-auto space-y-6">
          {PHRASES.map((p, i) => (
            <li key={p} className="flex items-baseline gap-5">
              <span className="font-mono text-sm text-standard-300">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">{p}</h2>
            </li>
          ))}
        </ul>
        <p className="max-w-3xl mx-auto mt-12 font-display text-xl font-bold text-slate-300">
          One connected record.
        </p>
      </section>

      <LandingFooter />
    </div>
  )
}
