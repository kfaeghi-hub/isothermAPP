// The cinematic page: Lenis smooth scroll, GSAP + ScrollTrigger choreography,
// the ContourField morphing behind everything. Beats (see the V2 proposal):
// load reveal → calm cursor-reactive hero → pinned stage where four
// typographic phrases pass through while the field steps up → crescendo +
// CTA → footer on solid ground. Copy is Tony's to revise — keep it minimal.

import { Fragment, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { LogoLockup } from '../../components/Logo'
import { ContourField, INITIAL_FIELD, type FieldParams } from './ContourField'
import { CssContour } from './CssContour'
import { LandingFooter } from './sections/LandingFooter'

gsap.registerPlugin(ScrollTrigger)

export const PHRASES = ['Field checklists', 'Issues log', 'Meeting minutes', 'Deliverables']
const HEADLINE = 'Commissioning management, built by commissioning agents.'

/** SplitText is Club-only — a word splitter is all the effect needs. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((w, i, arr) => (
        <Fragment key={i}>
          <span className="lp-mask"><span className="lp-word">{w}</span></span>
          {/* the joining space lives OUTSIDE the inline-block mask — a trailing
              space inside one collapses and the words fuse visually */}
          {i < arr.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </>
  )
}

export function CinematicLanding() {
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<FieldParams>({ ...INITIAL_FIELD })

  useLayoutEffect(() => {
    const lenis = new Lenis({ duration: 1.15 })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    const ctx = gsap.context(() => {
      // Beat 0 — load: field breathes in, headline reveals word by word.
      gsap.to(field.current, { amp: INITIAL_FIELD.amp, duration: 2.4, ease: 'power2.out' })
      gsap.from('.lp-word', {
        yPercent: 120, opacity: 0, filter: 'blur(8px)',
        duration: 1.1, stagger: 0.07, ease: 'power3.out', delay: 0.2,
      })
      gsap.from('.lp-hero-meta', { opacity: 0, y: 16, duration: 0.9, stagger: 0.12, delay: 0.9, ease: 'power2.out' })

      // Beat 1 — hero parallaxes away as the scroll begins.
      gsap.to('.lp-hero-inner', {
        yPercent: -20, opacity: 0,
        scrollTrigger: { trigger: '.lp-hero', start: 'top top', end: 'bottom 35%', scrub: 0.5 },
      })

      // Beat 2 — the pinned stage: each phrase passes through in place while
      // the field steps up (amplitude, density, hue) one increment per beat.
      const phrases = gsap.utils.toArray<HTMLElement>('.lp-phrase')
      const stage = gsap.timeline({
        scrollTrigger: { trigger: '.lp-stage', start: 'top top', end: '+=400%', pin: true, scrub: 0.6 },
      })
      phrases.forEach((el, i) => {
        stage
          .fromTo(el,
            { opacity: 0, letterSpacing: '0.4em', filter: 'blur(12px)' },
            { opacity: 1, letterSpacing: '0.08em', filter: 'blur(0px)', duration: 0.55, ease: 'power2.out' }, i)
          .to(field.current, {
            amp: 0.55 + (i + 1) * 0.3, density: 8 + (i + 1) * 2.4, hueMix: 0.15 + (i + 1) * 0.2,
            duration: 1, ease: 'none',
          }, i)
          .to(el, { opacity: 0, letterSpacing: '0.3em', filter: 'blur(10px)', duration: 0.45, ease: 'power2.in' }, i + 0.55)
      })

      // Beat 3 — crescendo: the field peaks, the closing line + CTA arrive…
      gsap.timeline({
        scrollTrigger: { trigger: '.lp-finale', start: 'top 85%', end: 'top 25%', scrub: 0.5 },
      })
        .to(field.current, { amp: 2.2, density: 19, hueMix: 1, drift: 1.6, ease: 'none' }, 0)
        .from('.lp-finale-inner', { opacity: 0, y: 70, ease: 'none' }, 0)
      // …then the instrument comes to rest.
      gsap.to(field.current, {
        amp: 0.45, density: 9, drift: 0.7,
        scrollTrigger: { trigger: '.lp-finale', start: 'top 25%', end: 'bottom top', scrub: 0.7 },
      })
    }, root)

    return () => {
      ctx.revert()
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [])

  return (
    <div ref={root} className="bg-slate-950 text-slate-100">
      <ContourField params={field} fallback={<div className="fixed inset-0 z-0 bg-slate-900"><CssContour /></div>} />

      <div className="relative z-10">
        {/* Hero */}
        <section className="lp-hero min-h-svh flex flex-col">
          <header className="flex items-center justify-between px-5 sm:px-10 py-5">
            <LogoLockup variant="reverse" className="lp-hero-meta [&_span]:text-[11px]" />
            <Link to="/login"
              className="lp-hero-meta text-[13px] font-semibold text-slate-300 hover:text-white border border-slate-700/70 hover:border-slate-400 rounded-sm px-4 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              Sign in
            </Link>
          </header>
          <div className="lp-hero-inner flex-1 flex flex-col items-center justify-center text-center px-6 pb-24">
            <p className="lp-hero-meta font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-7">
              Isotherm Engineering · Cx System
            </p>
            <h1 className="font-display text-[10.5vw] sm:text-6xl lg:text-7xl font-bold text-white leading-[1.02] tracking-[-0.02em] max-w-5xl">
              <Words text={HEADLINE} />
            </h1>
            <div className="lp-hero-meta mt-12 flex items-center gap-7">
              <Link to="/login"
                className="bg-white text-slate-900 font-semibold text-sm rounded-sm px-7 py-3 hover:bg-slate-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2">
                Sign in
              </Link>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Scroll</span>
            </div>
          </div>
        </section>

        {/* The stage — four typographic moments, pinned while the field morphs */}
        <section className="lp-stage h-svh relative" aria-label="Capabilities">
          {PHRASES.map((p, i) => (
            <h2 key={p} className="lp-phrase absolute inset-0 flex items-center justify-center text-center px-6
              font-display text-[9vw] sm:text-6xl lg:text-7xl font-bold text-white opacity-0">
              <span className="font-mono text-base sm:text-lg text-standard-300 mr-5 align-middle">{String(i + 1).padStart(2, '0')}</span>
              {p}
            </h2>
          ))}
        </section>

        {/* Crescendo */}
        <section className="lp-finale min-h-svh flex items-center justify-center text-center px-6">
          <div className="lp-finale-inner">
            <p className="font-display text-4xl sm:text-5xl font-bold text-white tracking-[-0.02em]">
              One connected record.
            </p>
            <Link to="/login"
              className="inline-block mt-10 bg-white text-slate-900 font-semibold text-base rounded-sm px-10 py-4 hover:bg-slate-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2">
              Sign in
            </Link>
          </div>
        </section>

        <div className="relative">
          <LandingFooter />
        </div>
      </div>
    </div>
  )
}
