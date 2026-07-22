// Public landing page — unauthenticated visitors at "/" land here; the CTA
// leads to /login. Contained: everything under src/pages/landing/ + its own
// landing.css; no app component was modified for this page (LogoMark/LogoLockup
// are consumed as-is). As-built record: docs/LANDING-PAGE-PROPOSAL.md.
//
// TODO (Tony, scheduled): regenerate src/assets/landing-dashboard.png at the
// END of the UI punch-list session so the shipped image matches the polished
// app. Capture rule: dev.test session, clipped ABOVE the project cards —
// ZZ-TEST family only, no project names ever ship on this page.

import './landing.css'
import { LandingHero } from './sections/LandingHero'
import { LandingCapabilities } from './sections/LandingCapabilities'
import { LandingVisual } from './sections/LandingVisual'
import { LandingFooter } from './sections/LandingFooter'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <LandingHero />
      <main>
        <LandingCapabilities />
        <LandingVisual />
      </main>
      <LandingFooter />
    </div>
  )
}
