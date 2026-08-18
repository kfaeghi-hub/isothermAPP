// CX-INDEX-DOCUMENT — the printable Cx Index (Phase 2 of
// CX-INDEX-EXPORT-PROPOSAL.md; reworked to submittal grade in Phase 2b from
// the owner's page-level audit of the first Seneca artifact).
//
// The shape (Phase 2b): WIDTH-PACKED STRIPS, not chapter-per-group. Each strip
// claims the full landscape width — as many columns as fit at legible density,
// group bands rendered inside the strip spanning their columns ("(cont'd)" on
// splits), identity columns pinned on every strip, thead AND the stats row
// (tfoot — the invariant: EVERY page carries per-column stats) repeating on
// every page. The first cut's chapter-per-group spent 157 pages on a register
// that fits in a fraction of that with the width actually used.
//
// COLOUR — Amendment 2 (DOCUMENT-IDENTITY-DECISION.md, 2026-08-17): the screen
// palette is admitted into THIS export family only. The 12 group-band colours,
// teal done / amber in-progress fills, a cover echoing the app header. The law
// riding it: COLOUR IS REDUNDANT ENCODING — the drawn marks carry every status
// on their own, and the grayscale rasterization must still read complete
// (battery-asserted). These hexes live here, never in doc-common's DOC.
//
// MARKS ARE DRAWN, NOT TYPED (learned live: the serverless font stack dropped
// U+2713 and every done cell printed blank). The only typed status affordance
// is the ASCII '*' by-type marker — chosen precisely because it cannot be a
// font casualty.

import { esc, DOC, FIRM_HEADER_PDF } from './doc-common.js'
import { classifyCell, columnStat, rollup, statLabel } from './cx-counting.js'
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
  address: string | null
  groups: CxIndexGroup[]
  equipment: CxIndexUnit[]
  /** `${equipmentId}:${columnId}` → status */
  cells: Map<string, string>
  /** `${equipmentId}:${columnId}` present ⇒ overlay-N/A */
  na: Set<string>
}

// ── The export-family palette (Amendment 2) — the screen's 12 band pairs ─────
const BANDS: Array<{ bg: string; text: string }> = [
  { bg: '#e2e8f0', text: '#1e293b' }, // slate
  { bg: '#bae6fd', text: '#0c4a6e' }, // sky
  { bg: '#a5f3fc', text: '#164e63' }, // cyan
  { bg: '#fde68a', text: '#78350f' }, // amber
  { bg: '#fcd34d', text: '#451a03' }, // amber-300
  { bg: '#ddd6fe', text: '#4c1d95' }, // violet
  { bg: '#fef08a', text: '#713f12' }, // yellow
  { bg: '#fed7aa', text: '#7c2d12' }, // orange
  { bg: '#fdba74', text: '#431407' }, // orange-300
  { bg: '#fecdd3', text: '#881337' }, // rose
  { bg: '#a7f3d0', text: '#064e3b' }, // emerald
  { bg: '#86efac', text: '#052e16' }, // green-300
]
const DONE_FILL = '#0f766e'   // teal-700, the screen's done
const PROG_FILL = '#fbbf24'   // amber-400, the screen's in-progress
const NA_FILL   = '#f3f4f6'   // gray-100
const APP_BRAND = '#443C8F'   // the app header the cover echoes

// ── Geometry (inches; landscape letter, 0.45in side margins) ─────────────────
const USABLE_W   = 10.1
const W_NUM      = 0.28
const W_DESC_ON  = 1.35
const W_DESC_OFF = 0.45
const W_CELL     = 0.19
const HEAD_H     = 2.0        // rotated-label row
const LABEL_BUDGET_PT = 137   // ≈ 1.9in of writing length inside HEAD_H

/** 2c-1: THE TAG COLUMN SIZES TO THE REGISTER. Identity never truncates — the
 *  column is as wide as the longest tag needs at 6.75pt monospace
 *  (~0.0563in/char) plus breathing room, floored at the old fixed width. */
const tagColWidth = (equipment: Array<{ tag: string | null }>): number => {
  const longest = equipment.reduce((m, e) => Math.max(m, (e.tag ?? '').length), 0)
  return Math.max(0.95, 0.12 + longest * 0.0563)
}

/** 2c-2: STATS ARE STACKED, ONE TREATMENT, ONE SIZE. Per-value shrinking hit
 *  3.9pt on "89/367" — below any legibility floor. Every stat now renders as
 *  numerator over denominator at a single fixed size with a fraction rule;
 *  three characters a line fits the cell at 5.5pt with margin. */
const STAT_FONT_PT = 5.5

/** 2c-3: BAND LABELS NEVER TRUNCATE. A band shrinks toward 5pt to fit its
 *  segment; if even 5pt cannot carry the words, the band shows a G-number
 *  marker and the strip's legend expands it. Returns the render decision. */
function fitBand(name: string, contd: boolean, cols: number, gi: number):
  { text: string; fontPt: number; expanded: string | null } {
  const label = `${name}${contd ? ' (cont’d)' : ''}`
  const budgetPt = cols * W_CELL * 72 - 4
  const fit = budgetPt / (label.length * 0.52)
  if (fit >= 5) return { text: label, fontPt: Math.min(6.5, fit), expanded: null }
  const marker = `G${gi + 1}${contd ? '+' : ''}`
  return { text: marker, fontPt: 6.5, expanded: `${marker} = ${label}` }
}

/** Font size at which a rotated label fits its budget WHOLE — zero truncation
 *  by construction (Phase 2b acceptance). 0.52em/char is a conservative Arial
 *  average; the floor covers every label in the firm register (longest: 53
 *  chars → 4.97pt). A future >58-char label would need a taller header, and
 *  the build should fail a review before a truncated artifact ships. */
function labelFontPt(label: string): number {
  return Math.max(4.5, Math.min(6.5, LABEL_BUDGET_PT / (label.length * 0.52)))
}

const CSS = `
  @page { size: letter landscape; }
  * { box-sizing: border-box; margin: 0; padding: 0;
      print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${DOC.INK}; font-size: 8pt; margin: 0 0.45in; }
  .firm { text-align: center; }
  .firm h1 { color: ${DOC.INK}; font-size: 19pt; letter-spacing: 0.5px; font-weight: 700; }
  .firm .addr { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: ${APP_BRAND}; margin: 9px 0 10px 0; border-radius: 2px; }
  h1.doc { font-size: 15pt; letter-spacing: 0.06em; margin: 2px 0 0; text-align: center; }
  .strip { page-break-before: always; }
  h2 { font-size: 10pt; margin: 8px 0 2px; }
  .sub { text-align: center; color: #555; font-size: 8pt; margin: 2px 0 6px; }
  .info { border-collapse: collapse; margin: 10px auto 0; }
  .info td { padding: 3px 10px; font-size: 9pt; border: 0.5pt solid #ccc; }
  .info td.k { color: #666; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; background: #f7f7f7; }
  table.idx { border-collapse: collapse; width: 100%; margin-top: 3px; table-layout: fixed; }
  table.idx th, table.idx td { border: 0.5pt solid #c4c4c4; padding: 0 1px; overflow: hidden; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
  th.band { height: 0.17in; font-size: 6.5pt; font-weight: 700; text-transform: none;
            white-space: nowrap; overflow: hidden; }
  th.rot { height: ${HEAD_H}in; vertical-align: bottom; background: #ececec; }
  th.rot div { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 600;
               max-height: ${HEAD_H - 0.06}in; white-space: nowrap; margin: 0 auto; }
  th.idcol { background: #ececec; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.04em; vertical-align: bottom; padding-bottom: 2px; }
  td.cell { text-align: center; height: 0.135in; }
  td.num { text-align: right; font-family: monospace; font-size: 6pt; color: #777; padding-right: 2px; }
  td.tag { font-family: monospace; font-weight: 700; font-size: 6.75pt; white-space: nowrap; }
  td.desc { font-size: 6.5pt; color: #333; white-space: nowrap; }
  tr.cat td { background: #e6e6e6; font-weight: 700; font-size: 6pt; text-transform: uppercase; letter-spacing: 0.04em; height: 0.14in; }
  tr.zebra td.num, tr.zebra td.tag, tr.zebra td.desc { background: ${DOC.ZEBRA}; }
  tr.stats td { border-top: 1.2pt solid ${DOC.INK}; font-weight: 700; text-align: center; background: #fff; height: 0.26in; white-space: nowrap; padding: 0; }
  tr.stats td.lbl { text-align: left; font-size: 6pt; letter-spacing: 0.05em; padding-left: 3px; vertical-align: middle; }
  tr.stats .sn, tr.stats .sd { display: block; font-size: ${STAT_FONT_PT}pt; line-height: 1.15; }
  tr.stats .sd { border-top: 0.5pt solid #999; margin: 0 2px; }
  tr.stats .sdash { font-size: ${STAT_FONT_PT}pt; }
  .c-done { background: ${DONE_FILL}; }
  .c-prog { background: ${PROG_FILL}; }
  .c-na   { background: ${NA_FILL}; }
  .m { display: inline-block; width: 6px; height: 6px; vertical-align: middle; }
  .m-done { background: #fff; }
  .m-half { border: 0.75pt solid ${DOC.INK}; background: linear-gradient(90deg, ${DOC.INK} 50%, #fff 50%); }
  .m-na { width: 3px; height: 3px; border-radius: 50%; background: #999; }
  .m-dna { background: #8a8a8a;
           background-image: linear-gradient(45deg, transparent 40%, #fff 40%, #fff 60%, transparent 60%); }
  .legend { font-size: 7.5pt; color: #444; margin: 4px 0 2px; }
  .legend .m { width: 8px; height: 8px; }
  .legend .m-na { width: 4px; height: 4px; }
  .legend .sep { color: #bbb; padding: 0 7px; }
  .legend .swatch { display: inline-block; width: 10px; height: 8px; vertical-align: middle; }
  .cover-stats { border-collapse: collapse; margin: 8px auto 0; }
  .cover-stats th, .cover-stats td { border: 0.5pt solid #bbb; padding: 2px 8px; font-size: 8pt; }
  .cover-stats th { text-align: left; font-weight: 700; }
  .cover-stats td.pct { text-align: right; font-weight: 700; }
  .bignum { text-align: center; font-size: 22pt; font-weight: 700; margin: 10px 0 0; color: ${DONE_FILL}; }
  .bignum small { display: block; font-size: 7.5pt; font-weight: 400; color: #555; letter-spacing: 0.08em; }
  .closing { margin-top: 14px; text-align: center; }
  .closing .rule { height: 2px; background: ${APP_BRAND}; margin: 8px auto; width: 3in; }
  .closing .end { font-size: 9pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
`

const SEP = `<span class="sep">|</span>`
const LEGEND =
  `<p class="legend">` +
  `<span class="m m-done" style="background:${DONE_FILL}"></span> done${SEP}` +
  `<span class="m m-half"></span> in progress${SEP}` +
  `<span class="m m-na"></span> not applicable${SEP}` +
  `<span class="m m-dna"></span> completed, later ruled not applicable${SEP}` +
  `blank = outstanding${SEP}` +
  `* = counted by type — stats read K/N, types complete of types in scope ` +
  `(complete = every applicable unit done); unit columns read n/N, done units of applicable</p>`

function glyph(count: CellCount, status: string | undefined): { cls: string; mark: string } {
  if (count === 'na') {
    return status === 'done'
      ? { cls: 'c-na', mark: '<span class="m m-dna"></span>' }
      : { cls: 'c-na', mark: '<span class="m m-na"></span>' }
  }
  if (status === 'done') return { cls: 'c-done', mark: '<span class="m m-done"></span>' }
  if (status === 'in_progress') return { cls: 'c-prog', mark: '<span class="m m-half"></span>' }
  return { cls: '', mark: '' }
}

interface StripSeg { group: CxIndexGroup; gi: number; columns: CxIndexColumn[]; contd: boolean }

/** Pack every group's columns, in order, into full-width strips. */
function packStrips(groups: CxIndexGroup[], maxCols: number): StripSeg[][] {
  const strips: StripSeg[][] = []
  let strip: StripSeg[] = []
  let used = 0
  groups.forEach((g, gi) => {
    let offset = 0
    while (offset < g.columns.length) {
      if (used >= maxCols) { strips.push(strip); strip = []; used = 0 }
      const take = Math.min(g.columns.length - offset, maxCols - used)
      strip.push({ group: g, gi, columns: g.columns.slice(offset, offset + take), contd: offset > 0 })
      used += take
      offset += take
    }
  })
  if (strip.length) strips.push(strip)
  return strips
}

export function buildCxIndexHtml(input: CxIndexInput): {
  html: string
  stats: { projectPct: number | null; groups: Array<{ name: string; pct: number | null }>; strips: number }
} {
  const { groups, equipment, cells, na } = input
  const count = (equipId: string, colId: string): CellCount =>
    classifyCell(na.has(`${equipId}:${colId}`), (cells.get(`${equipId}:${colId}`) ?? undefined) as any)

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
  const totalCols = groups.reduce((s, g) => s + g.columns.length, 0)
  const totalEntries = cells.size
  const generated = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })

  // Descriptor column narrows when the register carries no descriptors (grows
  // only if content exists — Phase 2b). Tag column sizes to the register (2c-1).
  const hasDesc = equipment.some(e => (e.descriptor ?? '').trim() !== '')
  const wDesc = hasDesc ? W_DESC_ON : W_DESC_OFF
  const wTag = tagColWidth(equipment)
  const idW = W_NUM + wTag + wDesc
  const maxCols = Math.floor((USABLE_W - idW) / W_CELL)
  const strips = packStrips(groups, maxCols)

  // ── Submittal cover ────────────────────────────────────────────────────────
  const cover = `
    ${FIRM_HEADER_PDF}
    <h1 class="doc">COMMISSIONING INDEX</h1>
    <table class="info">
      ${input.clientName ? `<tr><td class="k">Client</td><td>${esc(input.clientName)}</td></tr>` : ''}
      <tr><td class="k">Project</td><td>${esc(input.projectName)}${input.comNumber ? ` &nbsp;·&nbsp; ${esc(input.comNumber)}` : ''}</td></tr>
      ${input.address ? `<tr><td class="k">Address</td><td>${esc(input.address)}</td></tr>` : ''}
      <tr><td class="k">Prepared by</td><td>Isotherm Engineering Ltd.</td></tr>
      <tr><td class="k">Generated</td><td>${generated} — reflects register at generation</td></tr>
    </table>
    <div class="bignum">${projectPct === null ? '—' : `${projectPct}%`}<small>PROJECT COMPLETION — CLAIMS-WEIGHTED ACROSS EVERY COLUMN</small></div>
    <p class="sub">${equipment.length} items &nbsp;·&nbsp; ${totalCols} columns &nbsp;·&nbsp; ${totalEntries} entries</p>
    <table class="cover-stats">
      ${groupPcts.map((g, gi) => {
        const b = BANDS[gi % BANDS.length]
        return `<tr><th style="background:${b.bg};color:${b.text}">${esc(g.name)}</th><td class="pct">${g.pct === null ? '—' : `${g.pct}%`}</td></tr>`
      }).join('')}
    </table>
    ${LEGEND}`

  // ── Body rows, grouped by category (numbering restarts per category) ───────
  const byCategory: Array<{ cat: string | null; units: CxIndexUnit[] }> = []
  for (const e of equipment) {
    const last = byCategory[byCategory.length - 1]
    if (last && (last.cat ?? '') === (e.category ?? '')) last.units.push(e)
    else byCategory.push({ cat: e.category, units: [e] })
  }

  const stripHtml = strips.map((segs, si) => {
    const cols = segs.flatMap(s => s.columns)
    const names = [...new Set(segs.map(s => s.group.name))]
    const title = names.length > 2 ? `${names[0]} → ${names[names.length - 1]}` : names.join(' · ')

    const colgroup =
      `<colgroup><col style="width:${W_NUM}in"><col style="width:${wTag.toFixed(3)}in"><col style="width:${wDesc}in">` +
      cols.map(() => `<col style="width:${W_CELL}in">`).join('') + `</colgroup>`

    // 2c-3: bands fit or hand their words to the strip legend, never clip.
    const expansions: string[] = []
    const bandRow =
      `<tr><th class="idcol" colspan="3" style="background:#fff;border:none"></th>` +
      segs.map(s => {
        const b = BANDS[s.gi % BANDS.length]
        const fit = fitBand(s.group.name, s.contd, s.columns.length, s.gi)
        if (fit.expanded) expansions.push(fit.expanded)
        return `<th class="band" colspan="${s.columns.length}" ` +
               `style="background:${b.bg};color:${b.text};font-size:${fit.fontPt.toFixed(2)}pt">` +
               `${esc(fit.text)}</th>`
      }).join('') + `</tr>`
    const stripLegend = expansions.length
      ? LEGEND.replace('</p>', `${SEP}${expansions.map(esc).join(' · ')}</p>`)
      : LEGEND

    const labelRow =
      `<tr><th class="idcol">#</th><th class="idcol">Tag</th><th class="idcol">${hasDesc ? 'Descriptor' : ''}</th>` +
      cols.map(c => {
        const label = `${c.label}${c.scope === 'type' ? ' *' : ''}`
        return `<th class="rot"><div style="font-size:${labelFontPt(label).toFixed(2)}pt">${esc(label)}</div></th>`
      }).join('') + `</tr>`

    // 2c-2: every stat renders STACKED — numerator over denominator at one
    // fixed size (STAT_FONT_PT, the named floor). The Phase 2b per-value
    // shrink bottomed at 3.9pt, which is not a floor, it is a basement.
    const statsRow =
      `<tr class="stats"><td class="lbl" colspan="3">PER COLUMN — done over total (* by type)</td>` +
      cols.map(c => {
        const t = statLabel(colStats.get(c.id)!)
        if (t === '—') return `<td><span class="sdash">—</span></td>`
        const [n, d] = t.split('/')
        return `<td><span class="sn">${esc(n)}</span><span class="sd">${esc(d)}</span></td>`
      }).join('') + `</tr>`

    let zebra = false
    const body = byCategory.map(cat => {
      const catRow = cat.cat
        ? `<tr class="cat"><td colspan="${3 + cols.length}">${esc(cat.cat)}</td></tr>`
        : ''
      const unitRows = cat.units.map((e, i) => {
        zebra = !zebra
        const tds = cols.map(c => {
          const g = glyph(count(e.id, c.id), cells.get(`${e.id}:${c.id}`))
          return `<td class="cell ${g.cls}">${g.mark}</td>`
        }).join('')
        return `<tr${zebra ? ' class="zebra"' : ''}><td class="num">${i + 1}</td>` +
               `<td class="tag">${esc(e.tag ?? '')}</td><td class="desc">${hasDesc ? esc(e.descriptor ?? '') : ''}</td>${tds}</tr>`
      }).join('')
      return catRow + unitRows
    }).join('')

    return `<div class="strip">
      <h2>${esc(title)} — columns ${cols.length ? `${strips.slice(0, si).reduce((s, x) => s + x.reduce((a, b) => a + b.columns.length, 0), 0) + 1}–${strips.slice(0, si + 1).reduce((s, x) => s + x.reduce((a, b) => a + b.columns.length, 0), 0)}` : ''} of ${totalCols} (strip ${si + 1} of ${strips.length})</h2>
      ${stripLegend}
      <table class="idx">${colgroup}<thead>${bandRow}${labelRow}</thead><tfoot>${statsRow}</tfoot><tbody>${body}</tbody></table>
    </div>`
  }).join('')

  // ── Closing block — the document ends deliberately ─────────────────────────
  const closing = `
    <div class="closing">
      <p class="sub">${equipment.length} items &nbsp;·&nbsp; ${totalCols} columns &nbsp;·&nbsp; ${totalEntries} entries &nbsp;·&nbsp; project completion ${projectPct === null ? '—' : `${projectPct}%`}</p>
      <div class="rule"></div>
      <p class="end">End of Commissioning Index</p>
    </div>`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
    `<body>${cover}${stripHtml}${closing}</body></html>`
  return { html, stats: { projectPct, groups: groupPcts, strips: strips.length } }
}
