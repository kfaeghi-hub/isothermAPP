// The project hero — cover ground, contour band, and the progress instrument.
//
// The instrument is deliberately NOT three dashboard stat cards. It is one
// ruled figure group in the document's own voice: mono tabular readings under
// letter-spaced caps labels, divided by hairlines, with completion carrying a
// thin track beneath it. Three semantics, three colours, no decoration:
//   complete → brand (the work advancing)   open → vermilion (heat)
//   closed   → conform green (settled)
//
// Counters animate ONCE on entry via the parameter-ref pattern (GSAP tweens a
// plain object; textContent is written per frame; React never re-renders).
// React renders the FINAL values, so reduced-motion, a GSAP failure, and a
// blocked chunk all land on the finished state — never on zeros.
import { useRef } from 'react'
import type { PortalProject, PortalStats } from '../../../lib/portal'
import { PortalContour } from '../ui/PortalContour'
import { useCountUp, useHeroReveal, type MotionMode } from '../motion'

export function Hero({ project, stats, motion }: {
  project: PortalProject | null
  stats: PortalStats | null
  motion: MotionMode
}) {
  const scope = useRef<HTMLElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const openRef = useRef<HTMLSpanElement>(null)
  const closedRef = useRef<HTMLSpanElement>(null)

  const total = stats?.checklists_total ?? 0
  const done = stats?.checklists_complete ?? 0
  const pct = total > 0 ? Math.round((100 * done) / total) : null
  const open = stats?.findings_open ?? 0
  const closed = stats?.findings_closed ?? 0

  useHeroReveal(scope, motion)
  useCountUp([pctRef, openRef, closedRef], [pct, open, closed], motion)

  return (
    <header ref={scope} className="relative overflow-hidden pt-cover">
      <PortalContour />
      <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-8 sm:pt-14 sm:pb-10">
        <p className="pt-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400">
          {project?.client_name ?? 'Project record'}
        </p>
        <h1 className="pt-reveal font-display font-bold tracking-tight text-paper mt-2 text-[clamp(1.9rem,5.5vw,3.5rem)] leading-[1.05]">
          {project?.name ?? '—'}
        </h1>
        <p className="pt-reveal mt-3 font-mono text-[11px] text-slate-400">
          {[project?.com_number, stats?.phases?.length ? stats.phases.join(' · ') : null]
            .filter(Boolean).join('  ·  ') || 'Commissioning record'}
        </p>

        {/* ── 01 Progress — the instrument ───────────────────────────────── */}
        <h2 className="pt-reveal mt-10 font-display text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">
          <span className="font-mono text-vermilion-400 mr-2">01</span>Progress
        </h2>

        <div className="pt-reveal mt-3 border-t border-b border-cover-edge">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-cover-edge">
            <Reading label="Checklists complete" hint={total > 0 ? `${done} of ${total}` : 'None issued yet'}>
              <span ref={pctRef} className="font-mono tabular-nums text-brand-200 text-[clamp(2rem,5vw,2.9rem)] leading-none">
                {pct === null ? '—' : pct}
              </span>
              {pct !== null && <span className="font-mono text-brand-300 text-xl ml-0.5">%</span>}
              {pct !== null && (
                <span className="block mt-3 h-[3px] w-full bg-cover-edge rounded-sm overflow-hidden" aria-hidden="true">
                  <span className="block h-full bg-brand-400 rounded-sm" style={{ width: `${pct}%` }} />
                </span>
              )}
            </Reading>

            <Reading label="Open issues" hint={open === 0 ? 'Nothing outstanding' : 'Awaiting resolution'}>
              <span ref={openRef} className="font-mono tabular-nums text-vermilion-400 text-[clamp(2rem,5vw,2.9rem)] leading-none">
                {open}
              </span>
            </Reading>

            <Reading label="Issues resolved" hint={closed === 0 ? 'None closed yet' : 'Verified and closed'}>
              <span ref={closedRef} className="font-mono tabular-nums text-conform-50 text-[clamp(2rem,5vw,2.9rem)] leading-none">
                {closed}
              </span>
            </Reading>
          </div>
        </div>
      </div>
    </header>
  )
}

function Reading({ label, hint, children }: {
  label: string; hint: string; children: React.ReactNode
}) {
  return (
    <div className="py-5 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2.5">{children}</p>
      <p className="mt-2 text-[11px] text-slate-400">{hint}</p>
    </div>
  )
}
