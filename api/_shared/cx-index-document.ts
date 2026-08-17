// CX-INDEX-DOCUMENT — the printable Cx Index (Phase 2 of
// CX-INDEX-EXPORT-PROPOSAL.md, ruled 2026-08-17).
//
// One HTML for one renderer: landscape letter through the shared toPdf. The
// register prints the way the screen models it — upload-by-discipline is not
// this file's business; it prints CLAIMS:
//
//   · MONOCHROME GLYPHS, ruled Q1. The screen's teal/amber fills are screen
//     identity; the glyph set is the information, and it survives the site
//     greyscale printing every generated document gets. The one non-font mark
//     (the in-progress half-square) is drawn with CSS, not a glyph — U+25D0 is
//     not a bet worth making against a serverless font stack.
//   · A LEGEND ON EVERY STRIP, ruled Q1. A strip that travels alone (chapters
//     get photocopied) still explains itself.
//   · STRUCK-✓ SURVIVES, ruled Q9: completed-then-ruled-N/A renders struck
//     with its legend line. Recorded work is not erased from a client page.
//   · THE NUMBERS ARE PHASE 1'S, by import — columnStat/rollup from
//     cx-counting, the same module the page reads. The PDF cannot disagree
//     with the screen without one of them failing a battery.
//
// Chapters: one stage group per chapter, page-break between chapters, identity
// columns (# · Tag · Descriptor) repeated on every strip, thead repeating on
// every page (BASE_CSS's table-header-group). A group wider than STRIP_COLS
// splits into continued strips — defensive; no firm-default group needs it.

import { esc, DOC, FIRM_HEADER_PDF } from './doc-common.js'
import { classifyCell, columnStat, rollup } from './cx-counting.js'
import type { CellCount, ColumnStat } from './cx-counting.js'

export interface CxIndexColumn { id: string; label: string; scope: 'unit' | 'type' }
export interface CxIndexGroup { name: string; columns: CxIndexColumn[] }
export interface CxIndexUnit {
  id: string
  tag: string | null
  descriptor: string | null
  category: string | null
  equipment_type: string | null
}
export interface CxIndexInput {
  projectName: string
  comNumber: string | null
  clientName: string | null
  groups: CxIndexGroup[]
  equipment: CxIndexUnit[]
  /** `${equipmentId}:${columnId}` → status */
  cells: Map<string, string>
  /** `${equipmentId}:${columnId}` present ⇒ overlay-N/A */
  na: Set<string>
}

const STRIP_COLS = 26

// Deliberately NOT BASE_CSS: its generic table rules (width:100%, dark thead
// bands, 6px padding) are the site-report's idiom and would fight a 26-column
// matrix. The letterhead rules are copied so FIRM_HEADER_PDF renders verbatim.
const CSS = `
  @page { size: letter landscape; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${DOC.INK}; font-size: 8pt; margin: 0 0.45in; }
  .firm { text-align: center; }
  .firm h1 { color: ${DOC.INK}; font-size: 19pt; letter-spacing: 0.5px; font-weight: 700; }
  .firm .addr { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: ${DOC.BAND}; margin: 9px 0 10px 0; border-radius: 2px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .chapter { page-break-before: always; }
  h1 { font-size: 15pt; letter-spacing: 0.06em; margin: 2px 0 0; text-align: center; }
  h2 { font-size: 10.5pt; margin: 10px 0 2px; }
  .sub { text-align: center; color: #555; font-size: 8pt; margin: 2px 0 10px; }
  table.idx { border-collapse: collapse; width: auto; margin-top: 4px; }
  table.idx th, table.idx td { border: 0.5pt solid #bbb; padding: 1px 2px; }
  th.rot { height: 1.6in; vertical-align: bottom; background: ${DOC.BAND_TINT}; }
  th.rot div { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 6.5pt; font-weight: 600;
               max-height: 1.52in; overflow: hidden; white-space: nowrap; margin: 0 auto; }
  th.idcol { background: ${DOC.BAND_TINT}; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
  td.cell { width: 0.22in; min-width: 0.22in; text-align: center; font-size: 7.5pt; height: 0.16in; }
  td.num { width: 0.3in; text-align: right; font-family: monospace; font-size: 6.5pt; color: #666; }
  td.tag { width: 1.0in; font-family: monospace; font-weight: 700; font-size: 7pt; white-space: nowrap; }
  td.desc { width: 1.6in; font-size: 7pt; color: #333; }
  tr.cat td { background: #e8e8e8; font-weight: 700; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
  tr.zebra td { background: ${DOC.ZEBRA}; }
  tr.stats td { border-top: 1.5pt solid ${DOC.INK}; font-weight: 700; font-size: 6.5pt; text-align: center; background: #fff; }
  /* EVERY MARK IS DRAWN, NOT TYPED. The first render proved the serverless
     Chromium font stack silently drops U+2713 — every done cell printed BLANK,
     which is a wrong register wearing a clean layout. No status may depend on
     a glyph the font may not carry. */
  .m { display: inline-block; width: 7px; height: 7px; vertical-align: middle; }
  .m-done { background: ${DOC.INK}; }
  .m-half { border: 0.75pt solid ${DOC.INK}; background: linear-gradient(90deg, ${DOC.INK} 50%, #fff 50%); }
  .m-na { width: 3px; height: 3px; border-radius: 50%; background: #999; }
  .m-dna { background: #8a8a8a;
           background-image: linear-gradient(45deg, transparent 40%, #fff 40%, #fff 60%, transparent 60%); }
  .legend { font-size: 6.5pt; color: #555; margin: 3px 0 0; }
  .cover-stats { border-collapse: collapse; margin: 8px auto 0; }
  .cover-stats th, .cover-stats td { border: 0.5pt solid #bbb; padding: 2px 8px; font-size: 8pt; }
  .cover-stats th { background: ${DOC.BAND_TINT}; text-align: left; }
  .cover-stats td.pct { text-align: right; font-weight: 700; }
  .bignum { text-align: center; font-size: 22pt; font-weight: 700; margin: 10px 0 0; }
  .bignum small { display: block; font-size: 7.5pt; font-weight: 400; color: #555; letter-spacing: 0.08em; }
`

const LEGEND =
  `<p class="legend"><span class="m m-done"></span> done &nbsp;·&nbsp; ` +
  `<span class="m m-half"></span> in progress &nbsp;·&nbsp; ` +
  `<span class="m m-na"></span> not applicable &nbsp;·&nbsp; ` +
  `<span class="m m-dna"></span> completed, later ruled not applicable &nbsp;·&nbsp; ` +
  `blank = outstanding &nbsp;·&nbsp; ` +
  `by-type columns read K/N: types complete of types in scope (complete = every applicable unit done)</p>`

function glyph(count: CellCount, status: string | undefined): string {
  if (count === 'na') {
    return status === 'done'
      ? '<span class="m m-dna"></span>'
      : '<span class="m m-na"></span>'
  }
  if (status === 'done') return '<span class="m m-done"></span>'
  if (status === 'in_progress') return '<span class="m m-half"></span>'
  return ''
}

function statText(s: ColumnStat, scope: 'unit' | 'type'): string {
  if (scope === 'type') {
    return s.typesInScope === 0 && s.untypedApplicable === 0 ? '—' : `${s.typesComplete}/${s.typesInScope}`
  }
  return s.unitTotal === 0 ? '—' : `${Math.round((s.unitDone / s.unitTotal) * 100)}%`
}

export function buildCxIndexHtml(input: CxIndexInput): {
  html: string
  stats: { projectPct: number | null; groups: Array<{ name: string; pct: number | null }> }
} {
  const { groups, equipment, cells, na } = input
  const count = (equipId: string, colId: string): CellCount =>
    classifyCell(na.has(`${equipId}:${colId}`), (cells.get(`${equipId}:${colId}`) ?? undefined) as any)

  // ── Phase 1's numbers, from Phase 1's module ───────────────────────────────
  const colStats = new Map<string, ColumnStat>()
  groups.forEach(g => g.columns.forEach(col => {
    colStats.set(col.id, columnStat(
      equipment.map(e => ({ typeKey: e.equipment_type, count: count(e.id, col.id) })),
      col.scope
    ))
  }))
  const groupPcts = groups.map(g => ({
    name: g.name,
    pct: rollup(g.columns.map(c => colStats.get(c.id)!)).pct,
  }))
  const projectPct = rollup([...colStats.values()]).pct
  const totalEntries = cells.size

  // ── Cover block ────────────────────────────────────────────────────────────
  const cover = `
    ${FIRM_HEADER_PDF}
    <h1>COMMISSIONING INDEX</h1>
    <p class="sub">${esc(input.projectName)}${input.comNumber ? ` &nbsp;·&nbsp; ${esc(input.comNumber)}` : ''}${input.clientName ? ` &nbsp;·&nbsp; ${esc(input.clientName)}` : ''}</p>
    <p class="sub">${equipment.length} items &nbsp;·&nbsp; ${groups.reduce((s, g) => s + g.columns.length, 0)} columns &nbsp;·&nbsp; ${totalEntries} entries</p>
    <div class="bignum">${projectPct === null ? '—' : `${projectPct}%`}<small>PROJECT COMPLETION — CLAIMS-WEIGHTED ACROSS EVERY COLUMN</small></div>
    <table class="cover-stats">
      ${groupPcts.map(g => `<tr><th>${esc(g.name)}</th><td class="pct">${g.pct === null ? '—' : `${g.pct}%`}</td></tr>`).join('')}
    </table>
    ${LEGEND}`

  // ── Chapters ───────────────────────────────────────────────────────────────
  // Category grouping mirrors the screen: header row per category, numbering
  // restarts per category.
  const byCategory: Array<{ cat: string | null; units: CxIndexUnit[] }> = []
  for (const e of equipment) {
    const last = byCategory[byCategory.length - 1]
    if (last && (last.cat ?? '') === (e.category ?? '')) last.units.push(e)
    else byCategory.push({ cat: e.category, units: [e] })
  }

  const chapters = groups.map((g, gi) => {
    const strips: CxIndexColumn[][] = []
    for (let i = 0; i < g.columns.length; i += STRIP_COLS) strips.push(g.columns.slice(i, i + STRIP_COLS))
    const gp = groupPcts[gi].pct

    const stripHtml = strips.map((cols, si) => {
      const head =
        `<tr><th class="idcol">#</th><th class="idcol">Tag</th><th class="idcol">Descriptor</th>` +
        cols.map(c => `<th class="rot"><div>${esc(c.label)}${c.scope === 'type' ? ' — by type' : ''}</div></th>`).join('') +
        `</tr>`

      let zebra = false
      const body = byCategory.map(cat => {
        const catRow = cat.cat
          ? `<tr class="cat"><td colspan="${3 + cols.length}">${esc(cat.cat)}</td></tr>`
          : ''
        const unitRows = cat.units.map((e, i) => {
          zebra = !zebra
          const tds = cols.map(c =>
            `<td class="cell">${glyph(count(e.id, c.id), cells.get(`${e.id}:${c.id}`))}</td>`).join('')
          return `<tr${zebra ? ' class="zebra"' : ''}><td class="num">${i + 1}</td>` +
                 `<td class="tag">${esc(e.tag ?? '')}</td><td class="desc">${esc(e.descriptor ?? '')}</td>${tds}</tr>`
        }).join('')
        return catRow + unitRows
      }).join('')

      const stats =
        `<tr class="stats"><td colspan="3" style="text-align:right;">% BY COLUMN</td>` +
        cols.map(c => `<td>${statText(colStats.get(c.id)!, c.scope)}</td>`).join('') + `</tr>`

      return `
        <h2>${esc(g.name)}${strips.length > 1 ? ` — part ${si + 1} of ${strips.length}` : ''}` +
        `${gp !== null && si === 0 ? ` · ${gp}%` : ''}</h2>
        ${LEGEND}
        <table class="idx"><thead>${head}</thead><tbody>${body}${stats}</tbody></table>`
    }).join('')

    return `<div class="chapter">${stripHtml}</div>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
    `<body>${cover}${chapters}</body></html>`
  return { html, stats: { projectPct, groups: groupPcts } }
}
