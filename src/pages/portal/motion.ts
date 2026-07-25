// The three fallback gates, inherited VERBATIM from the landing standard
// (LandingPage.tsx / BuildingSection.tsx). Read them as a contract, not advice:
//
//   1. prefers-reduced-motion → DECIDED ONCE AT MOUNT, two first-class paths,
//      no `change` listener. Never re-mount a timeline mid-session.
//   2. Any animation failure → the static composition, try/caught. "A phone
//      that shows something simple beats a phone that shows nothing."
//   3. (pointer: coarse) → REDUCE, NEVER DROP. Fewer animated elements, no
//      hover affordances. The record itself is never withheld.
//
// The load-bearing consequence for every consumer: final values are rendered
// into the DOM by React FIRST. Animation only ever re-plays what is already
// there, so a GSAP failure, a blocked chunk, or JS off all degrade to the
// finished state rather than to zeros or blanks.
import { useState, useLayoutEffect, useRef, type RefObject } from 'react'

export interface MotionMode {
  /** No scroll-driven or duration-based motion. Counters show final values. */
  reduced: boolean
  /** Touch: reduce the animated element count, drop hover-only affordances. */
  coarse: boolean
}

/** Gate 1 + 3, resolved once. matchMedia itself is try/caught (gate 2 applies
 *  to feature detection too — an old WebView that throws must still render). */
export function useMotionMode(): MotionMode {
  return useState<MotionMode>(() => {
    try {
      return {
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        coarse: window.matchMedia('(pointer: coarse)').matches,
      }
    } catch {
      return { reduced: true, coarse: false }
    }
  })[0]
}

/**
 * Stat counters — GSAP moment 1 of 2.
 *
 * The parameter-ref pattern inherited from the landing: GSAP tweens a PLAIN
 * OBJECT and the callback writes textContent. React never re-renders, so a
 * 60fps count costs zero reconciliation.
 *
 * useLayoutEffect (not useEffect) so the start value is written BEFORE paint —
 * otherwise the final value flashes for a frame before resetting to zero.
 */
export function useCountUp(
  refs: RefObject<HTMLElement | null>[],
  /** A null entry means "this reading has no number" (e.g. a project with no
   *  checklists shows an em-dash). Nulls are SKIPPED, never counted from zero —
   *  animating them would overwrite the placeholder with a fake `0`, which is
   *  a different and wrong claim. Caught by looking at an empty project. */
  values: (number | null)[],
  { reduced, coarse }: MotionMode,
  format: (n: number) => string = n => String(Math.round(n)),
) {
  const played = useRef(false)
  useLayoutEffect(() => {
    // Reduced: React already rendered the final values. Do nothing at all.
    if (reduced || played.current) return
    if (!refs.every(r => r.current)) return
    played.current = true

    // Gate 2: if anything in here throws, the DOM keeps the final values.
    try {
      const counters = refs
        .map((ref, i) => ({ ref, target: values[i], v: 0 }))
        .filter((c): c is { ref: RefObject<HTMLElement | null>; target: number; v: number } =>
          typeof c.target === 'number')
      for (const c of counters) if (c.ref.current) c.ref.current.textContent = format(0)

      import('gsap').then(({ gsap }) => {
        try {
          for (const [i, c] of counters.entries()) {
            gsap.to(c, {
              v: c.target,
              // Coarse = reduce: one shared, shorter sweep instead of a
              // staggered cascade of independent tweens.
              duration: coarse ? 0.7 : 1.1,
              delay: coarse ? 0 : i * 0.08,
              ease: 'power2.out',
              onUpdate: () => { if (c.ref.current) c.ref.current.textContent = format(c.v) },
              onComplete: () => { if (c.ref.current) c.ref.current.textContent = format(c.target) },
            })
          }
        } catch {
          for (const c of counters) if (c.ref.current) c.ref.current.textContent = format(c.target)
        }
      }).catch(() => {
        // Chunk blocked / offline: restore the finished state immediately.
        for (const c of counters) if (c.ref.current) c.ref.current.textContent = format(c.target)
      })
    } catch { /* DOM already holds the final values */ }
    // values are read once, on the first play — a later data change must not
    // re-run the entrance (that is what `played` guards).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, coarse, refs.length, values.join(',')])
}

/**
 * Hero reveal — GSAP moment 2 of 2. A single short rise on the hero's own
 * children. Not scroll-driven: no ScrollTrigger, no Lenis, native scroll
 * everywhere (a working document must not have its scroll hijacked on site
 * data). Reduced → the elements are simply already in place.
 */
export function useHeroReveal(
  scope: RefObject<HTMLElement | null>,
  { reduced, coarse }: MotionMode,
) {
  const played = useRef(false)
  useLayoutEffect(() => {
    if (reduced || played.current || !scope.current) return
    played.current = true
    const targets = Array.from(scope.current.querySelectorAll<HTMLElement>('.pt-reveal'))
    if (!targets.length) return

    try {
      for (const t of targets) { t.style.opacity = '0'; t.style.transform = 'translateY(10px)' }
      const restore = () => { for (const t of targets) { t.style.opacity = ''; t.style.transform = '' } }

      import('gsap').then(({ gsap }) => {
        try {
          gsap.to(targets, {
            opacity: 1, y: 0,
            duration: coarse ? 0.32 : 0.45,
            stagger: coarse ? 0.03 : 0.06,
            ease: 'power2.out',
            clearProps: 'opacity,transform',
          })
        } catch { restore() }
      }).catch(restore)
    } catch { /* nothing was hidden */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, coarse])
}
