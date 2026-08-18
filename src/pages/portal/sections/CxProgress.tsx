// 05 Commissioning progress — the Cx Index crosses the wall as NUMBERS ONLY
// (PORTAL-PROPOSAL §8 amendment, 2026-08-17). The project figure, per-stage
// bars, and a by-unit category table: the same claims-weighted definition the
// internal page and the issued PDF compute (portal_internal.cx_index_stats ↔
// cx-counting), asserted identical by the battery. No rows, no tags, no cells,
// no drill — every element here bottoms out at a number, never at a unit or an
// internal surface. Cell-level detail travels as the issued Cx Index PDF.
//
// ONE component serves both shells (account and link), data injected as props —
// forking it is how two registers drift.
import type { PortalCxIndexRow } from '../../../lib/portal'
import { EmptyState } from '../ui/EmptyState'

export function CxProgress({ rows }: { rows: PortalCxIndexRow[] }) {
  const project = rows.find(r => r.kind === 'project')
  const groups = rows.filter(r => r.kind === 'group').sort((a, b) => a.sort - b.sort)
  const cats = rows.filter(r => r.kind === 'category').sort((a, b) => b.sort - a.sort)

  return (
    <section aria-labelledby="pt-cxprogress">
      <h2 id="pt-cxprogress" className="font-display text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400 mb-3">
        <span className="font-mono text-vermilion-400 mr-2">05</span>Commissioning progress
      </h2>

      <div className="pt-panel overflow-hidden">
        {!project || project.den === 0 ? (
          <EmptyState
            headline="No commissioning claims scored yet"
            line="Stage-group and equipment-class progress appears here as the commissioning index is worked."
          />
        ) : (
          <>
            {/* The project figure — claims-weighted, the register's one number */}
            <div className="px-4 sm:px-5 py-4 flex items-baseline gap-4 border-b border-rule">
              <span className="font-display font-bold text-3xl text-ink-display tabular-nums">
                {project.pct ?? 0}%
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-gray-500">
                {project.num} of {project.den} claims complete · weighted across every column
              </span>
            </div>

            {/* Per-stage bars */}
            <ul className="divide-y divide-rule">
              {groups.map(g => (
                <li key={g.name} className="px-4 sm:px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink-display min-w-0 truncate">{g.name}</span>
                    <span className="font-mono text-[11px] text-gray-500 tabular-nums flex-shrink-0">
                      {g.den === 0 ? '—' : `${g.num}/${g.den} · ${g.pct ?? 0}%`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-[3px] bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-600 rounded-full" style={{ width: `${g.pct ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>

            {/* By-unit category table — labelled for what it is */}
            {cats.length > 0 && (
              <div className="border-t border-rule">
                <p className="px-4 sm:px-5 pt-3 pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
                  Equipment classes — cells done of applicable, by unit
                </p>
                <ul className="px-4 sm:px-5 pb-3 columns-1 sm:columns-2 gap-8">
                  {cats.map(c => (
                    <li key={c.name} className="flex items-baseline justify-between gap-3 py-1 break-inside-avoid">
                      <span className="text-[12px] text-gray-600 min-w-0 truncate">
                        {c.name}
                        <span className="text-gray-400 font-mono text-[10px]"> ×{c.sort}</span>
                      </span>
                      <span className="font-mono text-[11px] text-gray-500 tabular-nums flex-shrink-0">
                        {c.den === 0 ? '—' : `${c.pct ?? 0}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
