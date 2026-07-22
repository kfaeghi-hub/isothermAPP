// Public landing page — unauthenticated visitors at "/" land here; CTA →
// /login. Contained: everything under src/pages/landing/ (GSAP, Lenis, and
// Three.js are imported ONLY here — the lazy split keeps the authenticated
// app at zero added bytes). As-built record: docs/LANDING-PAGE-PROPOSAL.md V2.
//
// Two first-class render paths, decided once at mount:
//   cinematic — Lenis + GSAP/ScrollTrigger choreography over the WebGL
//               contour field (which itself falls back to the CSS contour
//               if a context can't be created)
//   static    — prefers-reduced-motion: plain stacked page, no motion, no
//               canvas; all content visible

import './landing.css'
import { CinematicLanding } from './CinematicLanding'
import { StaticLanding } from './StaticLanding'

export default function LandingPage() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduced ? <StaticLanding /> : <CinematicLanding />
}
