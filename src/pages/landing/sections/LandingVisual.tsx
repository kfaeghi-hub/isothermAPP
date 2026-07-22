import { useReveal } from '../useReveal'
import dashboardShot from '../../../assets/landing-dashboard.png'

// The document plate: a framed slice of the live dashboard. The screenshot is
// captured from the ZZ-TEST family ONLY (clipped above the project cards so no
// project names ship) — real client data must never appear on this page.
export function LandingVisual() {
  const el = useReveal<HTMLDivElement>()
  return (
    <section className="bg-slate-50 pb-20 sm:pb-28 px-5 sm:px-10">
      <div ref={el} className="lv-hidden max-w-6xl mx-auto">
        {/* aspect-ratio reserved so the lazy image causes zero layout shift */}
        <figure className="m-0">
          <div className="border border-gray-300 rounded-sm overflow-hidden shadow-md bg-white"
               style={{ aspectRatio: '2400 / 636' }}>
            <img
              src={dashboardShot}
              loading="lazy"
              alt="Isotherm Cx dashboard title block: the Portfolio Register with active-project, open-finding, and overdue-action statistics"
              className="w-full h-full object-cover"
            />
          </div>
          <figcaption className="font-mono text-[11px] text-gray-500 mt-3 tracking-[0.04em]">
            Portfolio Register — the live project dashboard. Test data shown.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
