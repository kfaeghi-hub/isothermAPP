import { ClipboardCheck, FileText, CalendarCheck, LayoutGrid } from 'lucide-react'
import { useReveal } from '../useReveal'

// Four capability blocks — everything here is BUILT; never invent features.
// Structural ref: 21st.dev grid-feature-cards, re-expressed in the app's
// card-tile + ruled-grid grammar (motion/react dependency stripped).
const CAPABILITIES = [
  {
    icon: ClipboardCheck,
    title: 'Field checklists',
    body: 'A 238-template IVC/PFC library covering mechanical, electrical, BAS, plumbing, and envelope. Multi-unit fill, and it keeps working offline in mechanical rooms.',
  },
  {
    icon: FileText,
    title: 'Issues log & site reports',
    body: 'An ASHRAE 202 findings register with photo diaries. Failed checks become findings automatically; issued reports generate as PDF and Word.',
  },
  {
    icon: CalendarCheck,
    title: 'Meeting minutes',
    body: 'Typed agendas, action items that carry forward until closed, and generated minutes with an action summary by responsible party.',
  },
  {
    icon: LayoutGrid,
    title: 'Dashboard & deliverables',
    body: 'An attention queue that surfaces what needs chasing, portfolio cards, and LEED deliverable tracking from Fundamental through Enhanced.',
  },
]

export function LandingCapabilities() {
  const grid = useReveal<HTMLDivElement>()
  const head = useReveal<HTMLDivElement>()
  return (
    <section id="capabilities" className="bg-slate-50 py-20 sm:py-28 px-5 sm:px-10">
      <div className="max-w-6xl mx-auto">
        <div ref={head} className="lv-hidden flex items-baseline gap-3 border-b-2 border-gray-900 pb-3 mb-10">
          <span className="font-mono text-sm text-standard-600">1</span>
          <h2 className="font-display text-lg font-bold uppercase tracking-[0.06em] text-gray-900">What it does</h2>
        </div>
        <div ref={grid} className="lv-group grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAPABILITIES.map((c, i) => (
            <div key={c.title} className="card-tile bg-white rounded-xl border border-gray-200 p-6"
                 style={{ '--rise-i': i } as React.CSSProperties}>
              <c.icon className="w-6 h-6 text-standard-600" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="font-display text-[15px] font-bold text-gray-900 mt-5">{c.title}</h3>
              <p className="text-[13px] text-gray-600 leading-relaxed mt-2">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
