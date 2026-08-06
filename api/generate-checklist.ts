import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx'
// Auth is the ONE shared import this endpoint takes — its render pipeline stays
// deliberately independent of doc-common (landscape + per-mode footers).
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
// ...and the document PALETTE. This file keeps its own CSS body, landscape page
// setup, per-mode footers and `tbody.keep` pagination rules — those are genuinely
// different and merging them would risk pagination. Only the VALUES are shared
// (identity ruling, 2026-07-26): 25 of the old 104 hex literals lived in this
// file's private copies, which is why "change doc-common and you're done" was false.
import { DOC, DOC_SEMANTIC } from './_shared/doc-common.js'

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const FIRM_NAME  = 'ISOTHERM ENGINEERING LTD.'
const FIRM_ADDR  = '95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2'
const FIRM_PHONE = 'Ph 905-822-2430'
const FIRM_EMAIL = 'info@isothermengineering.com'

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isoShort(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

function stLabel(status: string | null | undefined): string {
  if (!status) return ''
  const s = status.toLowerCase()
  if (s === 'y')    return 'Y'
  if (s === 'n')    return 'N'
  if (s === 'nr')   return 'NR'
  if (s === 'na')   return 'NA'
  if (s === 'pass') return 'PASS'
  if (s === 'fail') return 'FAIL'
  return status.toUpperCase()
}

function stClass(status: string | null | undefined): string {
  if (!status) return ''
  const s = status.toLowerCase()
  if (s === 'y' || s === 'pass') return 'st-y'
  if (s === 'n' || s === 'fail') return 'st-n'
  return 'st-nr'
}

function stInline(status: string | null | undefined): string {
  if (!status) return ''
  const s = status.toLowerCase()
  if (s === 'y' || s === 'pass') return `color:${DOC_SEMANTIC.RECORDED};font-weight:bold;`
  if (s === 'n' || s === 'fail') return `color:${DOC_SEMANTIC.OUTSTANDING};font-weight:bold;`
  return 'color:#888888;'
}

function rKey(itemId: string, targetId: string): string { return `${itemId}:${targetId}` }
function gKey(gridId: string, targetId: string, rowKey: string): string { return `${gridId}:${targetId}:${rowKey}` }

/** Percentage <col> widths. PDF only — html-to-docx does not understand colgroup, and we
 *  must never put width: on th/td (it crashes the library). */
function colgroup(widths: number[]): string {
  return `<colgroup>${widths.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`
}

// Empty-cell semantics (standardized in both PDF and DOCX paths):
//   completed mode — field defined for the section but empty  → "—"
//   blank mode     — fillable cells stay clean white for handwriting
//   (not-defined cells are the shaded .np-blocked / tdBlocked cells, no text, either mode)
function dashOr(mode: 'completed' | 'blank', value: string): string {
  if (value) return esc(value)
  return mode === 'completed' ? '<span class="empty-dash">—</span>' : ''
}
function dashOrInline(mode: 'completed' | 'blank', value: string): string {
  if (value) return esc(value)
  return mode === 'completed' ? '<span style="color:#999999;">—</span>' : ''
}

// ── Nameplate ──────────────────────────────────────────────────────────────────
// The three field-def "sections" (spec / shop_drawing / installed) are the three VALUE
// COLUMNS, and each carries a DIFFERENT field list: "Serial Number" exists only under
// installed, "EWT Cooling" only under spec, "Sound Rating" only under shop_drawing.
//
// So a row is a field name (the union across sections), and a cell is BLOCKED when that
// field is not defined for that column — exactly as the real form blacks those cells out.
// Rows are rendered whether or not they hold a value: an empty nameplate must still print
// the full field set, otherwise the table collapses to a bare header.

type Section = 'spec' | 'shop_drawing' | 'installed'
const SECTIONS: Section[] = ['spec', 'shop_drawing', 'installed']

interface FieldDef { equipment_type: string; section: Section; field_name: string; unit: string | null; sort_order: number }

interface NpCell { value: string; blocked: boolean }
interface NpRow  { label: string; cells: NpCell[] }   // cells.length === nUnits * 3

/** Identity fields lead the sheet, as on the real form. */
const IDENTITY_FIRST = ['Manufacturer', 'Model Number', 'Model', 'Serial Number']

/** Equipment root columns back-fill a cell when nameplate_extra has no value for it. */
function rootFallback(eq: any, field: string): string {
  const map: Record<string, unknown> = {
    'Manufacturer':  eq.manufacturer,
    'Model Number':  eq.model,
    'Model':         eq.model,
    'Serial Number': eq.serial_number,
    'Voltage':       eq.voltage,
    'Phase':         eq.phase,
    'Hz':            eq.hz,
    'Water Flow':    eq.flow,
    'Flow':          eq.flow,
    'Capacity':      eq.capacity,
  }
  const v = map[field]
  return v == null ? '' : String(v)
}

function cellValue(eq: any, section: Section, field: string): string {
  const extra = eq?.nameplate_extra ?? {}
  const v = extra?.[section]?.[field]
  if (v != null && String(v).trim() !== '') return String(v)
  return rootFallback(eq ?? {}, field)
}

/** Row order: identity first, then each section's own sort_order, skipping duplicates. */
function orderedFields(defs: FieldDef[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of IDENTITY_FIRST) {
    if (defs.some(d => d.field_name === id) && !seen.has(id)) { seen.add(id); out.push(id) }
  }
  for (const sec of SECTIONS) {
    const inSec = defs.filter(d => d.section === sec).sort((a, b) => a.sort_order - b.sort_order)
    for (const d of inSec) {
      if (!seen.has(d.field_name)) { seen.add(d.field_name); out.push(d.field_name) }
    }
  }
  return out
}

function unitFor(defs: FieldDef[], field: string): string {
  const d = defs.find(x => x.field_name === field && x.unit)
  return d?.unit ? ` (${d.unit})` : ''
}

/** The always-rendered fallback when an equipment type has no field defs at all. */
const BASIC_FIELDS = [
  'Manufacturer', 'Model', 'Serial Number', 'Voltage', 'Phase', 'Hz', 'Amperage', 'Flow', 'Capacity',
]

function buildNameplate(
  responseTargets: any[],
  snapshot: Record<string, any> | null,
  mode: 'completed' | 'blank',
  fieldDefs: FieldDef[],
): { rows: NpRow[]; usedFallback: boolean } {
  // Completed mode reads the FROZEN snapshot, never live equipment (rule 4).
  const eqFor = (t: any) =>
    (mode === 'completed' && snapshot?.[t.equipment_id]) ? snapshot[t.equipment_id] : (t.equipment ?? {})

  const typesPresent = [...new Set(responseTargets.map(t => t.equipment?.equipment_type).filter(Boolean))]
  const defsForType = (type: string | null | undefined) =>
    fieldDefs.filter(d => d.equipment_type === type)

  const anyDefs = typesPresent.some(t => defsForType(t).length > 0)

  // ── Fallback: no field defs anywhere -> the basic grid, rendered in full. Never empty.
  if (!anyDefs) {
    const rows: NpRow[] = BASIC_FIELDS.map(field => ({
      label: field.toUpperCase(),
      cells: responseTargets.flatMap(t => {
        const eq = eqFor(t)
        const spec = rootFallback(eq, field)
        const inst = mode === 'blank' ? '' : rootFallback(eq, field)
        return [
          { value: spec, blocked: false },
          { value: '',   blocked: false },   // shop drawing: no source in the basic grid
          { value: inst, blocked: false },
        ]
      }),
    }))
    return { rows, usedFallback: true }
  }

  // ── Field-def driven. Rows = union of field names across every unit's type.
  const allDefs = responseTargets.flatMap(t => defsForType(t.equipment?.equipment_type))
  const fields = orderedFields(allDefs)

  const rows: NpRow[] = fields.map(field => ({
    label: (field + unitFor(allDefs, field)).toUpperCase(),
    cells: responseTargets.flatMap(t => {
      const defs = defsForType(t.equipment?.equipment_type)
      const eq   = eqFor(t)
      return SECTIONS.map<NpCell>(sec => {
        const defined = defs.some(d => d.section === sec && d.field_name === field)
        if (!defined) return { value: '', blocked: true }
        // Blank mode: Specified + Shop Drawing pre-filled from the live register;
        // Installed left empty for the contractor to write in on site.
        if (mode === 'blank' && sec === 'installed') return { value: '', blocked: false }
        return { value: cellValue(eq, sec, field), blocked: false }
      })
    }),
  }))

  return { rows, usedFallback: false }
}

// ── CSS (PDF path) ─────────────────────────────────────────────────────────────

const CSS = `
  @page { size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; color: #222; font-size: 9.5pt; line-height: 1.4; }
  .page { padding: 0 46px; }

  .firm { text-align: center; }
  .firm h1 { color: ${DOC.INK}; font-size: 18pt; font-weight: 700; letter-spacing: 0.5px; }
  .firm .addr { font-size: 8pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: ${DOC.BAND}; margin: 8px 0 0; border-radius: 2px; }

  .title-legend { display: table; width: 100%; margin-top: 10px; }
  .tl-title { display: table-cell; vertical-align: middle; }
  .tl-legend { display: table-cell; vertical-align: top; border: 1px solid ${DOC.BORDER}; border-radius: 4px; padding: 6px 10px; background: ${DOC.ZEBRA}; font-size: 7.5pt; color: #333; white-space: nowrap; }
  .cl-name { font-size: 11pt; font-weight: 700; color: ${DOC.INK}; }
  .cl-sub { font-size: 8pt; color: #666; margin-top: 1px; }
  .lg-hdr { font-weight: 700; color: ${DOC.INK}; margin-bottom: 3px; }

  .blank-notice { background: #FFF9C4; border: 1px solid #F59E0B; padding: 5px 10px; margin: 8px 0; font-size: 8pt; font-weight: 700; color: #92400E; border-radius: 4px; }

  h2.sec { color: ${DOC.INK}; font-size: 10.5pt; font-weight: 700; margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 2px solid ${DOC.INK}; page-break-after: avoid; break-after: avoid; }

  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 4px; font-size: 8.5pt; }
  thead { display: table-header-group; }
  thead th { background: ${DOC.BAND}; color: #fff; font-weight: 600; text-align: center; padding: 5px 6px; font-size: 8pt; border: 1px solid ${DOC.INK}; word-wrap: break-word; }
  thead th.lh { text-align: left; }
  tbody td { padding: 5px 6px; border: 1px solid ${DOC.RULE}; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  tbody tr:nth-child(even) td { background: ${DOC.ZEBRA}; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  /* PAGINATION RULE: a section band and its first item row live in tbody.keep —
     unbreakable, so a band can never strand as the last element on a page. */
  tbody.keep { page-break-inside: avoid; break-inside: avoid; }

  /* Header block — bordered, two columns, matching the real form */
  .hdr-tbl td { padding: 7px 10px; border: 1px solid ${DOC.BORDER}; vertical-align: top; font-size: 8.5pt; background: #fff !important; }
  .hdr-lbl { color: #6E6E6E; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  .hdr-val { font-weight: 600; color: ${DOC.INK}; }
  .hdr-line { border-bottom: 1px solid ${DOC.BORDER}; display: inline-block; min-width: 55%; height: 11px; }

  .th-unit { background: ${DOC.BAND_UNIT} !important; font-size: 8pt; }
  .th-sub  { background: ${DOC.BAND_SUB} !important; font-size: 7pt; }
  .np-label { text-align: left !important; font-size: 7.5pt; }
  .np-val  { text-align: center; font-size: 8pt; }
  /* Not-applicable cell (field not defined for this section): shaded, NO text —
     on the blank hand-out the contractor instantly sees which cells to skip. */
  .np-blocked { background: #E5E5E5 !important; }
  .empty-dash { color: #999999; }
  /* Blank mode: fillable cells must be CLEAN WHITE for handwriting — zebra striping
     would read as almost the same grey as the not-applicable shade on paper. */
  body.mode-blank tbody tr:nth-child(even) td { background: #fff; }
  body.mode-blank tbody tr:nth-child(even) td.np-blocked,
  body.mode-blank .np-blocked { background: #E5E5E5 !important; }

  .sec-row td { background: ${DOC.RULE} !important; font-weight: 700; font-size: 7.5pt; color: ${DOC.INK}; text-transform: uppercase; padding: 4px 8px; border-color: ${DOC.BORDER}; }

  .st-cell { text-align: center; font-weight: 600; }
  .st-y  { color: ${DOC_SEMANTIC.RECORDED}; }
  .st-n  { color: ${DOC_SEMANTIC.OUTSTANDING}; }
  .st-nr { color: #888; }
  .fnd   { display: block; font-size: 6.5pt; color: ${DOC_SEMANTIC.OUTSTANDING}; font-weight: 700; margin-top: 1px; }
  .hint  { font-style: italic; font-size: 7.5pt; color: #888; margin-top: 2px; }

  .so-role { font-weight: 600; font-size: 8.5pt; }

  /* ── Phase 0 elements, approved 2026-08-05 ──────────────────────────────── */
  /* The masthead names the document TYPE before anyone reads a line item.
     Start-Up is the only checklist that is a procedure with a live appliance at
     the end of it, and the form should say so. */
  .masthead { background: ${DOC.BAND}; color: #fff; padding: 7px 12px; margin-top: 9px; border-radius: 3px; page-break-after: avoid; break-after: avoid; }
  .mh-type { font-size: 11pt; font-weight: 700; letter-spacing: 1.2px; }
  .mh-eq { font-size: 8.5pt; margin-top: 1px; color: #E8E8E8; }

  /* A warning that is ticked is a warning that was read after the fact. This is
     read before the first line is answered, so it is a banner and not an item. */
  .prestart-banner { border: 2px solid ${DOC.INK}; background: ${DOC.BAND_TINT}; color: ${DOC.INK};
    padding: 7px 11px; margin: 10px 0 0; font-size: 9pt; font-weight: 700; page-break-inside: avoid; break-inside: avoid; }
  .pb-lead { font-size: 7pt; letter-spacing: 1px; font-weight: 700; display: block; margin-bottom: 2px; }

  /* Two parties, two DIFFERENT claims, printed in full. The claim is the
     signature of the type: the contractor certifies performance, the CxA
     attests to observation only. */
  .so-claim { font-size: 7pt; font-style: italic; color: #555; margin-top: 3px; display: block; }
`

// ── Shared shape ───────────────────────────────────────────────────────────────

interface DocData {
  instance:       any
  project:        any
  responseTargets: any[]
  sections:       any[]
  items:          any[]
  grids:          any[]
  signoffs:       any[]
  fieldDefs:      FieldDef[]
  responseMap:    Record<string, any>
  gridRespMap:    Record<string, any>
  findingMap:     Record<string, { number: string | null; title: string | null }>  // rKey -> finding
  mode:           'completed' | 'blank'
  // Blank-mode audience: 'field' = internal Field Copy (no banner, Isotherm company
  // prefilled); 'contractor' = the hand-out treatment. Ignored in completed mode.
  audience:       'field' | 'contractor'
  // Template-level render flag. 'check_table' = transposed fleet record (units as
  // rows, items as numbered columns, landscape, chunked). Null = standard layout.
  renderMode:     string | null
}

/** MASTHEAD — the document type, named before the first line item.
 *  Approved with the Phase 0 design. Start-Up only for now: it is the only
 *  family that is a procedure with a live appliance at the end of it, and the
 *  other three do not need announcing. */
function mastheadHtml(instance: any, targets: any[]): string {
  if (instance.type !== 'startup') return ''
  const first = targets?.[0]?.equipment
  const descriptor = first?.descriptor || first?.equipment_type || ''
  const tags = (targets ?? []).map((t: any) => t.equipment?.tag).filter(Boolean)
  const sub = [descriptor, tags.join(', ')].filter(Boolean).join(' \u00b7 ')
  return `<div class="masthead">
    <div class="mh-type">${targetsAreSystems(targets) ? 'SYSTEM' : 'EQUIPMENT'} START-UP CHECKLIST</div>
    ${sub ? `<div class="mh-eq">${esc(sub)}</div>` : ''}
  </div>`
}

/** PRE-START BANNER — a form-level warning, read before anything is answered.
 *  Never a line item: a warning that is ticked is a warning that was read after
 *  the fact, and the first one of these is a lockout instruction. */
function prestartBannerHtml(instance: any): string {
  const text = instance.prestart_banner_snapshot
  if (!text) return ''
  return `<div class="prestart-banner">
    <span class="pb-lead">BEFORE YOU TOUCH THIS EQUIPMENT</span>${esc(text)}
  </div>`
}

/** The two claims that make Start-Up a type rather than an ivc variant. The
 *  contractor certifies that the work was performed; the CxA attests to
 *  observation ONLY and explicitly does not assume responsibility for it.
 *  Ruled verbatim 2026-08-05 — this wording is not paraphrasable. */
const STARTUP_CLAIMS: Array<[RegExp, string]> = [
  [/contractor/i, 'I certify the start-up was performed in accordance with the manufacturer\u2019s instructions and the sections above.'],
  [/commissioning authority|cxa|witness/i, 'I witnessed the start-up recorded above. This signature attests to observation only and does not transfer responsibility for the work.'],
]
function signoffClaim(instance: any, roleLabel: string): string {
  if (instance.type !== 'startup') return ''
  const hit = STARTUP_CLAIMS.find(([re]) => re.test(roleLabel ?? ''))
  return hit ? `<span class="so-claim">${esc(hit[1])}</span>` : ''
}

/** A SYSTEM HAS NO NAMEPLATE. There is no plate on a sprinkler system, so the
 *  Specified / Shop Drawing / Installed grid renders rows that can never be
 *  filled — the empty grid the system-attachment ruling called worse than an
 *  absent one. The design-basis block that belongs there instead (density,
 *  hazard class, water supply, zones) is a NAMED DEFERRAL, woken by the first
 *  project that needs one recorded.
 *
 *  The first target speaks for all of them: a database trigger refuses a
 *  checklist whose targets mix kinds, so there is no case where this is
 *  ambiguous. */
function targetsAreSystems(targets: any[]): boolean {
  return targets?.[0]?.equipment?.kind === 'system'
}

/** Legend wording depends on the checklist type. */
function legendLines(instance: any): string[] {
  if (instance.type === 'fpt') {
    return ['PASS — Verified / Acceptable', 'FAIL — Not Verified / Deficient']
  }
  // Start-Up carries a fourth state the other families do not have. HOLD means
  // the sequence could not proceed — no permanent power, no water treatment, no
  // gas — which is not "not satisfactory", and the legend has to say so or the
  // form teaches the wrong thing. Approved 2026-08-05 with the Phase 0 design.
  if (instance.type === 'startup') {
    return [
      'Y — Complete / satisfactory',
      'N — Not satisfactory — raise finding',
      'NR — Not required for this unit',
      'HOLD — Cannot proceed — state why',
    ]
  }
  return [
    'Y — Installed / Acceptable',
    'N — Missing and Required',
    'NR — Not Required',
    'NA — Not Applicable',
  ]
}

/** Findings linked to this instance, in number order. */
function linkedFindings(findingMap: DocData['findingMap']) {
  const seen = new Map<string, { number: string | null; title: string | null }>()
  for (const f of Object.values(findingMap)) {
    const k = String(f.number ?? f.title ?? '')
    if (!seen.has(k)) seen.set(k, f)
  }
  return [...seen.values()].sort((a, b) =>
    Number(a.number ?? 0) - Number(b.number ?? 0))
}

// ── Check-table HTML builder (PDF path, render_mode='check_table') ─────────────
// Transposed fleet record: rows = instance targets (units), columns = the items,
// numbered 1..N in section order. Landscape; when the fleet's checks exceed one
// page width the item columns CHUNK across pages with the unit-tag column
// repeated per chunk. A procedures-key legend (item number -> label + hint)
// precedes the matrix, reproducing the source's Instructions sheet. Completed
// cells render status + response date (N red per convention), never date alone.

const CT_CHUNK = 9 // item columns per landscape chunk (tag column repeated)

function buildCheckTableHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, signoffs,
          responseMap, findingMap, mode, audience } = d

  // Items numbered 1..N in section order, each carrying its section title.
  const ordered: { item: any; n: number; secTitle: string }[] = []
  let n = 0
  for (const section of sections) {
    for (const item of items.filter(i => i.section_id === section.id)) {
      ordered.push({ item, n: ++n, secTitle: section.title })
    }
  }

  // Procedures key (legend) — number, label, hint.
  const keyRows = ordered.map(o => `
    <tr><td class="ctk-n">${o.n}</td><td><b>${esc(o.item.label)}</b>${o.item.hint ? `<div class="hint">${esc(o.item.hint)}</div>` : ''}</td></tr>`).join('')

  // Matrix chunks.
  const chunks: typeof ordered[] = []
  for (let i = 0; i < ordered.length; i += CT_CHUNK) chunks.push(ordered.slice(i, i + CT_CHUNK))

  const cellFor = (o: { item: any; n: number }, t: any): string => {
    if (mode === 'blank') return `<td class="ct-cell"></td>`
    const r = responseMap[rKey(o.item.id, t.id)]
    const st = r?.status ?? null
    const date = isoShort(r?.updated_at ?? r?.created_at)
    const fnd = findingMap[rKey(o.item.id, t.id)]
    if (!st) return `<td class="ct-cell"><span class="empty-dash">—</span></td>`
    return `<td class="ct-cell"><span class="${stClass(st)}">${esc(stLabel(st))}</span>` +
           `${date ? `<div class="ct-date">${esc(date)}</div>` : ''}` +
           `${fnd ? `<div class="fnd">→ #${esc(fnd.number ?? '?')}</div>` : ''}</td>`
  }

  const matrixHtml = chunks.map((chunk, ci) => {
    // Section band: colspan runs over this chunk's columns per section.
    const bands: { title: string; span: number }[] = []
    for (const o of chunk) {
      const last = bands[bands.length - 1]
      if (last && last.title === o.secTitle) last.span++
      else bands.push({ title: o.secTitle, span: 1 })
    }
    const bandThs = bands.map(b => `<th class="ct-band" colspan="${b.span}">${esc(b.title)}</th>`).join('')
    const colThs = chunk.map(o =>
      `<th class="ct-col"><div class="ct-num">${o.n}</div><div class="ct-lbl">${esc(o.item.label)}</div></th>`).join('')
    const bodyRows = responseTargets.map(t => {
      const tag = esc(t.equipment?.tag ?? t.equipment?.descriptor ?? '?')
      return `<tr class="ct-row"><td class="ct-tag">${tag}</td>${chunk.map(o => cellFor(o, t)).join('')}</tr>`
    }).join('\n')
    const w = 84 / chunk.length
    return `
  <h2 class="sec">Checkout Record${chunks.length > 1 ? ` — Columns ${chunk[0].n}–${chunk[chunk.length - 1].n} of ${ordered.length}` : ''}</h2>
  <table class="ct">
    ${colgroup([16, ...Array(chunk.length).fill(w)])}
    <thead>
      <tr><th class="lh" rowspan="3">Unit Tag</th>${bandThs}</tr>
      <tr>${colThs}</tr>
      <tr>${chunk.map(() => `<th class="ct-sub">${mode === 'blank' ? 'Status / Date' : ''}</th>`).join('')}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  ${ci < chunks.length - 1 ? '<div class="ct-break"></div>' : ''}`
  }).join('\n')

  // Header block (same conventions as the standard layout).
  const blankLine = `<span class="hdr-line"></span>`
  const rightRows = mode === 'blank'
    ? (audience === 'field'
        ? [['Name', blankLine], ['Company', `<span class="hdr-val">Isotherm Engineering Ltd.</span>`], ['Email', blankLine], ['Phone', blankLine], ['Date', blankLine]]
        : [['Name', blankLine], ['Company', blankLine], ['Email', blankLine], ['Phone', blankLine], ['Date', blankLine]])
    : [
        ['Name',    `<span class="hdr-val">${esc(instance.completed_by ?? instance.authored_by ?? '')}</span>`],
        ['Company', `<span class="hdr-val">Isotherm Engineering Ltd.</span>`],
        ['Email',   `<span class="hdr-val">${FIRM_EMAIL}</span>`],
        ['Phone',   `<span class="hdr-val">${FIRM_PHONE}</span>`],
        ['Date',    `<span class="hdr-val">${esc(isoShort(instance.completed_at ?? instance.date_performed))}</span>`],
      ]
  const leftRows = [
    ['Customer',        esc(project?.companies?.name ?? project?.companies?.abbreviation ?? '—')],
    ['Project',         esc(project?.name ?? '—')],
    ['Project Address', esc(project?.address ?? '—')],
    ['Project #',       esc(project?.com_number ?? '—')],
  ].map(([l, v]) => `<div><span class="hdr-lbl">${l}:</span> <span class="hdr-val">${v}</span></div>`).join('')
  const rightHtml = rightRows.map(([l, v]) => `<div><span class="hdr-lbl">${l}:</span> ${v}</div>`).join('')

  const modeSubtitle = mode === 'blank'
    ? (audience === 'field' ? 'FIELD COPY' : 'BLANK FORM — FOR CONTRACTOR USE')
    : `COMPLETED${instance.completed_at ? ' · ' + isoShort(instance.completed_at) : ''}`

  const findings = mode === 'blank' ? [] : linkedFindings(findingMap)
  const findingsHtml = findings.length === 0 ? '' : `
  <h2 class="sec">Linked Findings</h2>
  <table>
    ${colgroup([12, 88])}
    <thead><tr><th class="lh">Finding</th><th class="lh">Title</th></tr></thead>
    <tbody>${findings.map(f =>
      `<tr><td style="font-weight:700;color:${DOC_SEMANTIC.OUTSTANDING};">#${esc(f.number ?? '?')}</td><td>${esc(f.title ?? '')}</td></tr>`
    ).join('\n')}</tbody>
  </table>`

  const signoffRows = signoffs.map(s => {
    const nameCompany = mode === 'blank' ? '' : [s.signer_name, s.signer_company].filter(Boolean).join(' / ')
    const date = mode === 'blank' ? '' : isoShort(s.signed_at)
    return `<tr>
      <td class="so-role">${esc(s.role_label_snapshot)}${signoffClaim(instance, s.role_label_snapshot)}</td>
      <td>${dashOr(mode, nameCompany)}</td>
      <td></td>
      <td style="font-family:monospace;font-size:8pt;">${dashOr(mode, date)}</td>
    </tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${CSS}${CT_CSS}</style></head>
<body class="mode-${mode}">
<div class="page">

  <div class="firm">
    <h1>${FIRM_NAME}</h1>
    <div class="addr">${FIRM_ADDR} &nbsp;&bull;&nbsp; ${FIRM_PHONE} &nbsp;&bull;&nbsp; ${FIRM_EMAIL}</div>
  </div>
  <div class="brandrule"></div>

  ${mastheadHtml(instance, responseTargets)}

  ${mode === 'blank' && audience === 'contractor' ? `<div class="blank-notice">BLANK FORM — FOR CONTRACTOR USE — Complete on site and return to Isotherm Engineering Ltd.</div>` : ''}

  ${prestartBannerHtml(instance)}

  <div class="title-legend">
    <div class="tl-title">
      <div class="cl-name">${esc(instance.source_template_name_snapshot)}</div>
      <div class="cl-sub">${esc(instance.source_template_type_snapshot?.toUpperCase())} &nbsp;&bull;&nbsp; FLEET CHECKOUT RECORD &nbsp;&bull;&nbsp; ${esc(modeSubtitle)}</div>
    </div>
    <div class="tl-legend">
      <div class="lg-hdr">LEGEND</div>
      ${legendLines(instance).map(esc).join('<br>')}
    </div>
  </div>

  <table class="hdr-tbl" style="margin-top:10px;">
    ${colgroup([50, 50])}
    <tbody><tr><td>${leftRows}</td><td>${rightHtml}</td></tr></tbody>
  </table>

  <h2 class="sec">Checkout Procedures and Key</h2>
  <div class="ct-keynote">Each numbered column of the checkout record refers to the procedure below. In each cell, record the check's status and completion date.</div>
  <table>
    ${colgroup([6, 94])}
    <tbody>${keyRows}</tbody>
  </table>

  <div class="ct-break"></div>

  ${matrixHtml}

  ${findingsHtml}

  ${signoffs.length > 0 ? `
  <h2 class="sec">Sign-offs</h2>
  <table>
    ${colgroup([28, 34, 22, 16])}
    <thead>
      <tr><th class="lh">Position / Title</th><th class="lh">Name / Company</th><th class="lh">Signature</th><th class="lh">Date</th></tr>
    </thead>
    <tbody>${signoffRows}</tbody>
  </table>` : ''}

</div>
</body></html>`
}

const CT_CSS = `
  @page { size: letter landscape; }
  .ct { table-layout: fixed; width: 100%; }
  .ct-band { background: ${DOC.BAND_TINT}; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; padding: 3px 2px; border: 1px solid ${DOC.BORDER}; }
  .ct-col { vertical-align: bottom; padding: 3px 2px; border: 1px solid #ccc; background: #F0F0F0; }
  .ct-num { font-size: 9pt; font-weight: 700; }
  .ct-lbl { font-size: 6.4pt; font-weight: 600; line-height: 1.25; word-wrap: break-word; }
  .ct-sub { font-size: 6pt; color: #999; font-weight: 400; border: 1px solid #ccc; padding: 1px; }
  .ct-tag { font-weight: 700; font-size: 8pt; padding: 3px 4px; border: 1px solid #ccc; background: #FAFAFA; }
  .ct-cell { text-align: center; padding: 2px; border: 1px solid #ccc; font-size: 8pt; min-height: 18px; }
  .ct-date { font-size: 6pt; color: #666; font-family: monospace; }
  .ct-row { page-break-inside: avoid; }
  .ct-break { page-break-after: always; }
  .ct-keynote { font-size: 8pt; color: #555; margin: 4px 0 6px; }
  .ctk-n { font-weight: 700; text-align: center; }
`

// ── HTML builder (PDF path) ────────────────────────────────────────────────────

function buildChecklistHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, grids, signoffs, fieldDefs,
          responseMap, gridRespMap, findingMap, mode, audience } = d
  const snapshot = instance.nameplate_snapshot ?? null
  const nUnits = responseTargets.length
  const unitTag = (t: any) => esc(t.equipment?.tag ?? t.equipment?.descriptor ?? '?')

  // ── Unit identity ───────────────────────────────────────────────────────────
  const idFields = ['tag', 'descriptor', 'location', 'area_served'] as const
  const idLabels = ['UNIT TAG', 'DESCRIPTOR', 'LOCATION', 'AREA SERVED']
  const unitIdRows = idFields.map((field, i) => {
    const cells = responseTargets.map(t => `<td class="np-val">${dashOr(mode, t.equipment?.[field] ?? '')}</td>`).join('')
    return `<tr><td class="np-label">${esc(idLabels[i])}</td>${cells}</tr>`
  }).join('\n')
  const idWidths = [28, ...responseTargets.map(() => 72 / nUnits)]

  // ── Nameplate ───────────────────────────────────────────────────────────────
  const { rows: npRows } = buildNameplate(responseTargets, snapshot, mode, fieldDefs)
  const npUnitThs = responseTargets.map(t => `<th class="th-unit" colspan="3">${unitTag(t)}</th>`).join('')
  const npSubThs  = responseTargets.map(() =>
    `<th class="th-sub">Specified</th><th class="th-sub">Shop Drawing</th><th class="th-sub">Installed</th>`).join('')
  // class="np-row" is the counting marker for the no-dropped-rows guard.
  const npBodyRows = npRows.map(row =>
    `<tr class="np-row"><td class="np-label">${esc(row.label)}</td>${row.cells.map(c =>
      c.blocked ? `<td class="np-blocked"></td>` : `<td class="np-val">${dashOr(mode, c.value)}</td>`
    ).join('')}</tr>`
  ).join('\n')
  // Field 28%, then an equal third of the remaining 72% per unit's Spec/Shop/Installed.
  const npCellW = 72 / (nUnits * 3)
  const npWidths = [28, ...Array(nUnits * 3).fill(npCellW)]

  // ── Checks + grids ──────────────────────────────────────────────────────────
  // Item 50% / unit response columns equal share / Comments 25%.
  const respW = 25 / nUnits
  const itemWidths = [50, ...Array(nUnits).fill(respW), 25]
  const unitThs = responseTargets.map(t => `<th>${unitTag(t)}</th>`).join('')

  let checksBody = ''
  let gridsHtml = ''
  for (const section of sections) {
    const sItems = items.filter(i => i.section_id === section.id)
    const sGrids = grids.filter(g => g.section_id === section.id)
    if (sItems.length === 0 && sGrids.length === 0) continue

    if (sItems.length > 0) {
      const rowsHtml = sItems.map(item => {
        const stCells = responseTargets.map(t => {
          const st = mode === 'blank' ? null : (responseMap[rKey(item.id, t.id)]?.status ?? null)
          const fnd = mode === 'blank' ? null : findingMap[rKey(item.id, t.id)]
          const label = st ? `<span class="${stClass(st)}">${esc(stLabel(st))}</span>` : dashOr(mode, '')
          return `<td class="st-cell">${label}` +
                 `${fnd ? `<span class="fnd">→ #${esc(fnd.number ?? '?')}</span>` : ''}</td>`
        }).join('')
        const comment = mode === 'blank' ? '' : responseTargets
          .map(t => responseMap[rKey(item.id, t.id)]?.comment).filter(Boolean).join(' / ')
        return `<tr>
          <td>${esc(item.label)}${item.hint ? `<div class="hint">${esc(item.hint)}</div>` : ''}</td>
          ${stCells}
          <td>${dashOr(mode, comment)}</td>
        </tr>`
      })
      // PAGINATION RULE: a section band must never be the last element on a page.
      // The band and its first item row share an unbreakable tbody, so if the pair
      // doesn't fit before the footer reserve, both move to the next page together.
      const band = `<tr class="sec-row"><td colspan="${2 + nUnits}">${esc(section.title)}</td></tr>`
      checksBody += `<tbody class="keep">${band}\n${rowsHtml[0]}</tbody>\n`
      if (rowsHtml.length > 1) checksBody += `<tbody>${rowsHtml.slice(1).join('\n')}</tbody>\n`
    }

    // Grids get their OWN tables — a measurement grid has a different column count from
    // the checks table, and cramming both into one table is what broke the widths.
    //
    // WIDE-GRID RULE (generic, all templates): grids with ≥5 columns render PER TARGET
    // (one stacked table per unit) — a two-unit combined layout would need 10+ measurement
    // columns and become unreadable on Letter. ≤4-column grids keep the combined two-unit
    // layout (endorsed as the standard: compact, directly comparative).
    for (const grid of sGrids) {
      const cols = grid.definition.columns as any[]
      const rows = grid.definition.rows   as any[]
      const nc = cols.length
      const stacked = nUnits > 1 && nc >= 5

      const renderGrid = (targets: any[], titleSuffix: string) => {
        const gUnitThs = targets.map(t => `<th class="th-unit" colspan="${nc}">${unitTag(t)}</th>`).join('')
        const gColThs  = targets.map(() =>
          cols.map(c => `<th class="th-sub">${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}</th>`).join('')
        ).join('')
        const gridRows = rows.map(row => {
          const cells = targets.map(t =>
            cols.map(col => {
              const val = mode === 'blank' ? '' : (gridRespMap[gKey(grid.id, t.id, row.key)]?.data?.[col.key] ?? '')
              return `<td class="np-val">${dashOr(mode, val)}</td>`
            }).join('')
          ).join('')
          return `<tr><td class="np-label">${esc(row.label)}</td>${cells}</tr>`
        }).join('\n')

        const gW = 78 / (targets.length * nc)
        const gWidths = [22, ...Array(targets.length * nc).fill(gW)]
        return `
      <h2 class="sec">${esc(grid.title)}${titleSuffix}</h2>
      <table>
        ${colgroup(gWidths)}
        <thead>
          <tr><th class="lh" rowspan="2"></th>${gUnitThs}</tr>
          <tr>${gColThs}</tr>
        </thead>
        <tbody>${gridRows}</tbody>
      </table>`
      }

      if (stacked) {
        for (const t of responseTargets) {
          gridsHtml += renderGrid([t], ` — ${esc(t.equipment?.tag ?? '?')}`)
        }
      } else {
        const tags = responseTargets.map(t => t.equipment?.tag ?? '?').join(' / ')
        gridsHtml += renderGrid(responseTargets, nUnits > 1 ? ` — ${esc(tags)}` : '')
      }
    }
  }

  // ── Linked findings ─────────────────────────────────────────────────────────
  const findings = mode === 'blank' ? [] : linkedFindings(findingMap)
  const findingsHtml = findings.length === 0 ? '' : `
  <h2 class="sec">Linked Findings</h2>
  <table>
    ${colgroup([12, 88])}
    <thead><tr><th class="lh">Finding</th><th class="lh">Title</th></tr></thead>
    <tbody>${findings.map(f =>
      `<tr><td style="font-weight:700;color:${DOC_SEMANTIC.OUTSTANDING};">#${esc(f.number ?? '?')}</td><td>${esc(f.title ?? '')}</td></tr>`
    ).join('\n')}</tbody>
  </table>`

  // ── Signoffs ────────────────────────────────────────────────────────────────
  const signoffRows = signoffs.map(s => {
    const nameCompany = mode === 'blank' ? '' : [s.signer_name, s.signer_company].filter(Boolean).join(' / ')
    const date = mode === 'blank' ? '' : isoShort(s.signed_at)
    return `<tr>
      <td class="so-role">${esc(s.role_label_snapshot)}${signoffClaim(instance, s.role_label_snapshot)}</td>
      <td>${dashOr(mode, nameCompany)}</td>
      <td></td>
      <td style="font-family:monospace;font-size:8pt;">${dashOr(mode, date)}</td>
    </tr>`
  }).join('\n')

  // ── Header block ────────────────────────────────────────────────────────────
  // Blank/contractor: the CONTRACTOR identifies themselves — no Isotherm name on the form.
  // Blank/field: internal copy — Company prefilled, Name/Date left for handwriting.
  const blankLine = `<span class="hdr-line"></span>`
  const rightRows = mode === 'blank'
    ? (audience === 'field'
        ? [['Name', blankLine], ['Company', `<span class="hdr-val">Isotherm Engineering Ltd.</span>`], ['Email', blankLine], ['Phone', blankLine], ['Date', blankLine]]
        : [['Name', blankLine], ['Company', blankLine], ['Email', blankLine], ['Phone', blankLine], ['Date', blankLine]])
    : [
        ['Name',    `<span class="hdr-val">${esc(instance.completed_by ?? instance.authored_by ?? '')}</span>`],
        ['Company', `<span class="hdr-val">Isotherm Engineering Ltd.</span>`],
        ['Email',   `<span class="hdr-val">${FIRM_EMAIL}</span>`],
        ['Phone',   `<span class="hdr-val">${FIRM_PHONE}</span>`],
        ['Date',    `<span class="hdr-val">${esc(isoShort(instance.completed_at ?? instance.date_performed))}</span>`],
      ]
  const leftRows = [
    ['Customer',        esc(project?.companies?.name ?? project?.companies?.abbreviation ?? '—')],
    ['Project',         esc(project?.name ?? '—')],
    ['Project Address', esc(project?.address ?? '—')],
    ['Project #',       esc(project?.com_number ?? '—')],
  ].map(([l, v]) => `<div><span class="hdr-lbl">${l}:</span> <span class="hdr-val">${v}</span></div>`).join('')
  const rightHtml = rightRows
    .map(([l, v]) => `<div><span class="hdr-lbl">${l}:</span> ${v}</div>`).join('')

  const modeSubtitle = mode === 'blank'
    ? (audience === 'field' ? 'FIELD COPY' : 'BLANK FORM — FOR CONTRACTOR USE')
    : `COMPLETED${instance.completed_at ? ' · ' + isoShort(instance.completed_at) : ''}`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body class="mode-${mode}">
<div class="page">

  <div class="firm">
    <h1>${FIRM_NAME}</h1>
    <div class="addr">${FIRM_ADDR} &nbsp;&bull;&nbsp; ${FIRM_PHONE} &nbsp;&bull;&nbsp; ${FIRM_EMAIL}</div>
  </div>
  <div class="brandrule"></div>

  ${mastheadHtml(instance, responseTargets)}

  ${mode === 'blank' && audience === 'contractor' ? `<div class="blank-notice">BLANK FORM — FOR CONTRACTOR USE — Complete on site and return to Isotherm Engineering Ltd.</div>` : ''}

  ${prestartBannerHtml(instance)}

  <div class="title-legend">
    <div class="tl-title">
      <div class="cl-name">${esc(instance.source_template_name_snapshot)}</div>
      <div class="cl-sub">${esc(instance.source_template_type_snapshot?.toUpperCase())} &nbsp;&bull;&nbsp; ${esc(modeSubtitle)}</div>
    </div>
    <div class="tl-legend">
      <div class="lg-hdr">LEGEND</div>
      ${legendLines(instance).map(esc).join('<br>')}
    </div>
  </div>

  <table class="hdr-tbl" style="margin-top:10px;">
    ${colgroup([50, 50])}
    <tbody><tr><td>${leftRows}</td><td>${rightHtml}</td></tr></tbody>
  </table>

  <h2 class="sec">Unit Identity</h2>
  <table>
    ${colgroup(idWidths)}
    <thead><tr><th class="lh"></th>${responseTargets.map(t => `<th>${unitTag(t)}</th>`).join('')}</tr></thead>
    <tbody>${unitIdRows}</tbody>
  </table>

  ${targetsAreSystems(responseTargets) ? '' : `
  <h2 class="sec">Equipment Nameplate Data</h2>
  <table>
    ${colgroup(npWidths)}
    <thead>
      <tr><th class="lh" rowspan="2"></th>${npUnitThs}</tr>
      <tr>${npSubThs}</tr>
    </thead>
    <tbody>${npBodyRows}</tbody>
  </table>`}

  ${checksBody.trim() ? `
  <h2 class="sec">Installation Checks</h2>
  <table>
    ${colgroup(itemWidths)}
    <thead>
      <tr><th class="lh">Item</th>${unitThs}<th class="lh">Comments</th></tr>
    </thead>
    ${checksBody}
  </table>` : ''}

  ${gridsHtml}

  ${findingsHtml}

  ${signoffs.length > 0 ? `
  <h2 class="sec">Sign-offs</h2>
  <table>
    ${colgroup([28, 34, 22, 16])}
    <thead>
      <tr><th class="lh">Position / Title</th><th class="lh">Name / Company</th><th class="lh">Signature</th><th class="lh">Date</th></tr>
    </thead>
    <tbody>${signoffRows}</tbody>
  </table>` : ''}

</div>
</body></html>`
}

// ── DOCX HTML builder ──────────────────────────────────────────────────────────
// Inline styles only. NEVER width: on th/td (html-to-docx crashes). No <colgroup> —
// the library does not understand it; width:100% on <table> is what it honours.

function buildChecklistDocxHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, grids, signoffs, fieldDefs,
          responseMap, gridRespMap, findingMap, mode, audience } = d
  const snapshot = instance.nameplate_snapshot ?? null
  const nUnits = responseTargets.length

  const T    = 'style="width:100%;border-collapse:collapse;font-size:8.5pt;"'
  const TH   = `style="background-color:${DOC.BAND};color:#ffffff;font-weight:bold;text-align:center;padding:5px 6px;border:1px solid ${DOC.INK};font-size:8pt;"`
  const THL  = `style="background-color:${DOC.BAND};color:#ffffff;font-weight:bold;text-align:left;padding:5px 6px;border:1px solid ${DOC.INK};font-size:8pt;"`
  const THUN = `style="background-color:${DOC.BAND_UNIT};color:#ffffff;font-weight:bold;text-align:center;padding:5px 6px;border:1px solid ${DOC.BAND_UNIT};font-size:8pt;"`
  const THSB = `style="background-color:${DOC.BAND_SUB};color:#ffffff;font-weight:bold;text-align:center;padding:5px 6px;border:1px solid ${DOC.BAND_SUB};font-size:7pt;"`
  // Blank mode drops zebra striping: fillable cells must be clean white so the
  // only grey on the page is the not-applicable shade.
  const zebra = mode === 'completed'
  const td   = (i: number, extra = '') =>
    `style="padding:5px 6px;border:1px solid ${DOC.RULE};vertical-align:top;font-size:8pt;${zebra && i % 2 === 1 ? `background-color:${DOC.ZEBRA};` : ''}${extra}"`
  const tdBlocked = `style="padding:5px 6px;border:1px solid ${DOC.RULE};background-color:#E5E5E5;font-size:8pt;"`
  const tdSec = `style="background-color:${DOC.RULE};font-weight:bold;font-size:7.5pt;color:${DOC.INK};text-transform:uppercase;padding:4px 8px;border:1px solid ${DOC.BORDER};"`

  const unitTag = (t: any) => esc(t.equipment?.tag ?? t.equipment?.descriptor ?? '?')

  // Unit identity
  const idFields = ['tag', 'descriptor', 'location', 'area_served'] as const
  const idLabels = ['UNIT TAG', 'DESCRIPTOR', 'LOCATION', 'AREA SERVED']
  const unitIdRows = idFields.map((field, i) => {
    const cells = responseTargets.map(t =>
      `<td ${td(i, 'text-align:center;')}>${dashOrInline(mode, t.equipment?.[field] ?? '')}</td>`).join('')
    return `<tr><td ${td(i, 'font-size:7.5pt;')}>${esc(idLabels[i])}</td>${cells}</tr>`
  }).join('\n')

  // Nameplate
  const { rows: npRows } = buildNameplate(responseTargets, snapshot, mode, fieldDefs)
  const npUnitThs = responseTargets.map(t => `<th ${THUN} colspan="3">${unitTag(t)}</th>`).join('')
  const npSubThs  = responseTargets.map(() =>
    `<th ${THSB}>Specified</th><th ${THSB}>Shop Drawing</th><th ${THSB}>Installed</th>`).join('')
  const npBodyRows = npRows.map((row, ri) =>
    `<tr class="np-row">
      <td ${td(ri, 'font-size:7.5pt;')}>${esc(row.label)}</td>
      ${row.cells.map(c =>
        c.blocked ? `<td ${tdBlocked}></td>` : `<td ${td(ri, 'text-align:center;')}>${dashOrInline(mode, c.value)}</td>`
      ).join('')}
    </tr>`
  ).join('\n')

  // Checks
  const unitThs = responseTargets.map(t => `<th ${TH}>${unitTag(t)}</th>`).join('')
  let checksBody = ''
  let gridsHtml  = ''
  let rowIdx = 0

  for (const section of sections) {
    const sItems = items.filter(i => i.section_id === section.id)
    const sGrids = grids.filter(g => g.section_id === section.id)
    if (sItems.length === 0 && sGrids.length === 0) continue

    if (sItems.length > 0) {
      checksBody += `<tr><td ${tdSec} colspan="${2 + nUnits}">${esc(section.title)}</td></tr>\n`
      for (const item of sItems) {
        const stCells = responseTargets.map(t => {
          const st  = mode === 'blank' ? null : (responseMap[rKey(item.id, t.id)]?.status ?? null)
          const fnd = mode === 'blank' ? null : findingMap[rKey(item.id, t.id)]
          const fndHtml = fnd
            ? `<br><span style="font-size:6.5pt;color:${DOC_SEMANTIC.OUTSTANDING};font-weight:bold;">&rarr; #${esc(fnd.number ?? '?')}</span>`
            : ''
          const label = st ? esc(stLabel(st)) : dashOrInline(mode, '')
          return `<td ${td(rowIdx, 'text-align:center;font-weight:bold;' + stInline(st))}>${label}${fndHtml}</td>`
        }).join('')
        const comment = mode === 'blank' ? '' : responseTargets
          .map(t => responseMap[rKey(item.id, t.id)]?.comment).filter(Boolean).join(' / ')
        checksBody += `<tr>
          <td ${td(rowIdx)}>${esc(item.label)}${item.hint ? `<br><em style="font-size:7.5pt;color:#888;">${esc(item.hint)}</em>` : ''}</td>
          ${stCells}
          <td ${td(rowIdx)}>${dashOrInline(mode, comment)}</td>
        </tr>\n`
        rowIdx++
      }
    }

    // WIDE-GRID RULE (mirror of the PDF builder): ≥5-column grids render per target
    // (one stacked table per unit); ≤4-column grids keep the combined two-unit layout.
    for (const grid of sGrids) {
      const cols = grid.definition.columns as any[]
      const rows = grid.definition.rows   as any[]
      const nc   = cols.length
      const stacked = nUnits > 1 && nc >= 5

      const renderGrid = (targets: any[], titleSuffix: string) => {
        const gUnitThs = targets.map(t => `<th ${THUN} colspan="${nc}">${unitTag(t)}</th>`).join('')
        const gColThs  = targets.map(() =>
          cols.map(c => `<th ${THSB}>${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}</th>`).join('')).join('')

        let gRows = ''
        for (const row of rows) {
          const cells = targets.map(t =>
            cols.map(col => {
              const val = mode === 'blank' ? '' : (gridRespMap[gKey(grid.id, t.id, row.key)]?.data?.[col.key] ?? '')
              return `<td ${td(rowIdx, 'text-align:center;')}>${dashOrInline(mode, val)}</td>`
            }).join('')
          ).join('')
          gRows += `<tr><td ${td(rowIdx)}>${esc(row.label)}</td>${cells}</tr>\n`
          rowIdx++
        }

        return `
      <h2>${esc(grid.title)}${titleSuffix}</h2>
      <table ${T}>
        <thead>
          <tr><th ${THL} rowspan="2"></th>${gUnitThs}</tr>
          <tr>${gColThs}</tr>
        </thead>
        <tbody>${gRows}</tbody>
      </table>`
      }

      if (stacked) {
        for (const t of responseTargets) {
          gridsHtml += renderGrid([t], ` — ${esc(t.equipment?.tag ?? '?')}`)
        }
      } else {
        const tags = responseTargets.map(t => t.equipment?.tag ?? '?').join(' / ')
        gridsHtml += renderGrid(responseTargets, nUnits > 1 ? ` — ${esc(tags)}` : '')
      }
    }
  }

  // Linked findings
  const findings = mode === 'blank' ? [] : linkedFindings(findingMap)
  const findingsHtml = findings.length === 0 ? '' : `
<h2>Linked Findings</h2>
<table ${T}>
  <thead><tr><th ${THL}>Finding</th><th ${THL}>Title</th></tr></thead>
  <tbody>${findings.map((f, i) =>
    `<tr><td ${td(i, `font-weight:bold;color:${DOC_SEMANTIC.OUTSTANDING};`)}>#${esc(f.number ?? '?')}</td><td ${td(i)}>${esc(f.title ?? '')}</td></tr>`
  ).join('\n')}</tbody>
</table>`

  // Signoffs
  const signoffRows = signoffs.map((s, i) => {
    const nameCompany = mode === 'blank' ? '' : [s.signer_name, s.signer_company].filter(Boolean).join(' / ')
    const date = mode === 'blank' ? '' : isoShort(s.signed_at)
    return `<tr>
      <td ${td(i, 'font-weight:bold;')}>${esc(s.role_label_snapshot)}</td>
      <td ${td(i)}>${dashOrInline(mode, nameCompany)}</td>
      <td ${td(i)}></td>
      <td ${td(i, 'font-size:8pt;')}>${dashOrInline(mode, date)}</td>
    </tr>`
  }).join('\n')

  // Header block
  const line = `<span style="color:${DOC.BORDER};">__________________________</span>`
  const rightRows = mode === 'blank'
    ? (audience === 'field'
        ? [['Name', line], ['Company', `<strong>Isotherm Engineering Ltd.</strong>`], ['Email', line], ['Phone', line], ['Date', line]]
        : [['Name', line], ['Company', line], ['Email', line], ['Phone', line], ['Date', line]])
    : [
        ['Name',    `<strong>${esc(instance.completed_by ?? instance.authored_by ?? '')}</strong>`],
        ['Company', `<strong>Isotherm Engineering Ltd.</strong>`],
        ['Email',   `<strong>${FIRM_EMAIL}</strong>`],
        ['Phone',   `<strong>${FIRM_PHONE}</strong>`],
        ['Date',    `<strong>${esc(isoShort(instance.completed_at ?? instance.date_performed))}</strong>`],
      ]
  const hdrLbl = 'style="color:#6E6E6E;font-size:7.5pt;"'
  const leftHtml = [
    ['Customer',        esc(project?.companies?.name ?? project?.companies?.abbreviation ?? '—')],
    ['Project',         esc(project?.name ?? '—')],
    ['Project Address', esc(project?.address ?? '—')],
    ['Project #',       esc(project?.com_number ?? '—')],
  ].map(([l, v]) => `<p style="margin:3px 0;"><span ${hdrLbl}>${l}:</span> <strong>${v}</strong></p>`).join('')
  const rightHtml = rightRows
    .map(([l, v]) => `<p style="margin:3px 0;"><span ${hdrLbl}>${l}:</span> ${v}</p>`).join('')

  const modeSubtitle = mode === 'blank' ? (audience === 'field' ? 'FIELD COPY' : 'BLANK FORM — FOR CONTRACTOR USE') :
    `COMPLETED${instance.completed_at ? ' · ' + isoShort(instance.completed_at) : ''}`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; }
  h1 { color: ${DOC.INK}; font-size: 18pt; font-weight: bold; text-align: center; margin: 0; }
  h2 { color: ${DOC.INK}; font-size: 10.5pt; font-weight: bold; margin: 14px 0 5px; }
  p { margin: 3px 0; }
</style>
</head>
<body>

<h1>${FIRM_NAME}</h1>
<p style="text-align:center;font-size:8pt;color:#555;margin:2px 0;">${FIRM_ADDR} &nbsp;&bull;&nbsp; ${FIRM_PHONE} &nbsp;&bull;&nbsp; ${FIRM_EMAIL}</p>

${mode === 'blank' && audience === 'contractor' ? `<p style="background-color:#FFF9C4;border:1px solid #F59E0B;padding:5px 10px;font-size:8pt;font-weight:bold;color:#92400E;margin:8px 0;">BLANK FORM — FOR CONTRACTOR USE — Complete on site and return to Isotherm Engineering Ltd.</p>` : ''}

<p style="font-size:12pt;font-weight:bold;color:${DOC.INK};margin-top:10px;">${esc(instance.source_template_name_snapshot)}</p>
<p style="font-size:8pt;color:#666;">${esc(instance.source_template_type_snapshot?.toUpperCase())} &nbsp;&bull;&nbsp; ${esc(modeSubtitle)}</p>

<p style="font-size:8pt;color:#333;border:1px solid ${DOC.BORDER};background-color:${DOC.ZEBRA};padding:5px 8px;margin:8px 0;">
  <strong style="color:${DOC.INK};">LEGEND:</strong> ${legendLines(instance).map(esc).join(' &nbsp;·&nbsp; ')}
</p>

<table ${T} style="width:100%;border-collapse:collapse;margin-top:10px;">
  <tbody><tr>
    <td style="padding:7px 10px;border:1px solid ${DOC.BORDER};vertical-align:top;">${leftHtml}</td>
    <td style="padding:7px 10px;border:1px solid ${DOC.BORDER};vertical-align:top;">${rightHtml}</td>
  </tr></tbody>
</table>

<h2>Unit Identity</h2>
<table ${T}>
  <thead><tr><th ${THL}></th>${responseTargets.map(t => `<th ${TH}>${unitTag(t)}</th>`).join('')}</tr></thead>
  <tbody>${unitIdRows}</tbody>
</table>

${targetsAreSystems(responseTargets) ? '' : `
<h2>Equipment Nameplate Data</h2>
<table ${T}>
  <thead>
    <tr><th ${THL} rowspan="2"></th>${npUnitThs}</tr>
    <tr>${npSubThs}</tr>
  </thead>
  <tbody>${npBodyRows}</tbody>
</table>`}

${checksBody.trim() ? `
<h2>Installation Checks</h2>
<table ${T}>
  <thead><tr><th ${THL}>Item</th>${unitThs}<th ${THL}>Comments</th></tr></thead>
  <tbody>${checksBody}</tbody>
</table>` : ''}

${gridsHtml}

${findingsHtml}

${signoffs.length > 0 ? `
<h2>Sign-offs</h2>
<table ${T}>
  <thead>
    <tr><th ${THL}>Position / Title</th><th ${THL}>Name / Company</th><th ${THL}>Signature</th><th ${THL}>Date</th></tr>
  </thead>
  <tbody>${signoffRows}</tbody>
</table>` : ''}

</body></html>`
}

// ── PDF via Puppeteer + @sparticuz/chromium-min ────────────────────────────────
// Footer via displayHeaderFooter (NOT position:fixed, which clips rows at page breaks).
// top: 0.5in gives continuation pages their margin.

async function toPdf(html: string, landscape = false): Promise<Buffer> {
  const execPath = await chromium.executablePath(CHROMIUM_PACK_URL)
  const browser  = await puppeteer.launch({
    args: chromium.args,
    executablePath: execPath,
    headless: 'shell',
    defaultViewport: null,
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format: 'letter',
      landscape,
      printBackground: true,
      margin: { top: '0.5in', right: '0', bottom: '0.55in', left: '0' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;padding:6px 46px 12px;text-align:center;font-family:Arial,sans-serif;font-size:7.5pt;color:#888888;border-top:1px solid #e5e5e5;box-sizing:border-box;line-height:1.3;">${FIRM_NAME} &nbsp;|&nbsp; ${FIRM_ADDR} &nbsp;|&nbsp; ${FIRM_PHONE} &nbsp;|&nbsp; ${FIRM_EMAIL} &nbsp;&bull;&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ── DOCX via html-to-docx ──────────────────────────────────────────────────────

async function toDocx(html: string): Promise<Buffer> {
  // width: on th/td crashes html-to-docx's buildTableCellWidth. Strip it defensively —
  // the builder above already avoids it, but this guard is cheap and the crash is fatal.
  const safeHtml = html.replace(/(<t[hd][^>]*?) style="([^"]*)"/gi, (_: string, tag: string, styles: string) => {
    const filtered = styles.split(';').map((s: string) => s.trim())
      .filter((s: string) => s && !s.toLowerCase().startsWith('width'))
      .join('; ')
    return filtered ? `${tag} style="${filtered}"` : tag
  })
  const result = await HTMLtoDOCX(safeHtml, null, {
    table:   { row: { cantSplit: true } },
    margins: { top: 720, right: 1080, bottom: 900, left: 1080, header: 708, footer: 708, gutter: 0 },
    font:    'Arial',
    fontSize: 20,
    footer:  false,
    header:  false,
  })
  return Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer)
}

// ── Check-table DOCX (attempted-but-optional per the gate verdict) ─────────────
// The transposed matrix is a wide fixed table html-to-docx may fight; if it
// throws, the caller ships PDF-only with a note rather than failing the render.

function buildCheckTableDocxHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, responseMap, mode } = d
  const T  = 'style="width:100%;border-collapse:collapse;font-size:7pt;"'
  const TH = 'style="border:1px solid #999;background:#efefef;font-size:6.5pt;padding:2px;"'
  const TD = 'style="border:1px solid #999;padding:2px;text-align:center;"'
  const ordered: { item: any; n: number }[] = []
  let n = 0
  for (const section of sections)
    for (const item of items.filter(i => i.section_id === section.id)) ordered.push({ item, n: ++n })
  const keyRows = ordered.map(o =>
    `<tr><td ${TD}><b>${o.n}</b></td><td style="border:1px solid #999;padding:2px;">${esc(o.item.label)}${o.item.hint ? ` — <i>${esc(o.item.hint)}</i>` : ''}</td></tr>`).join('')
  const headRow = `<tr><th ${TH}>Unit Tag</th>${ordered.map(o => `<th ${TH}>${o.n}</th>`).join('')}</tr>`
  const bodyRows = responseTargets.map(t => {
    const cells = ordered.map(o => {
      if (mode === 'blank') return `<td ${TD}></td>`
      const r = responseMap[rKey(o.item.id, t.id)]
      const st = r?.status ?? null
      const date = isoShort(r?.updated_at ?? r?.created_at)
      return `<td ${TD}>${st ? `<span style="${stInline(st)}">${esc(stLabel(st))}</span>${date ? `<br><span style="font-size:5.5pt;color:#666;">${esc(date)}</span>` : ''}` : ''}</td>`
    }).join('')
    return `<tr><td style="border:1px solid #999;padding:2px;font-weight:bold;">${esc(t.equipment?.tag ?? '?')}</td>${cells}</tr>`
  }).join('\n')
  return `
  <h1 style="font-size:13pt;">${esc(instance.source_template_name_snapshot)}</h1>
  <p style="font-size:8pt;">${esc(project?.name ?? '')} — Fleet Checkout Record (${responseTargets.length} units)</p>
  <h2 style="font-size:10pt;">Checkout Procedures and Key</h2>
  <table ${T}><tbody>${keyRows}</tbody></table>
  <h2 style="font-size:10pt;">Checkout Record</h2>
  <table ${T}><thead>${headRow}</thead><tbody>${bodyRows}</tbody></table>`
}

// ── Vercel serverless handler ──────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { instance_id, mode = 'completed', audience: audienceParam } = req.body ?? {}
    if (!instance_id) return res.status(400).json({ error: 'instance_id required' })
    if (mode !== 'completed' && mode !== 'blank')
      return res.status(400).json({ error: 'mode must be completed or blank' })
    if (audienceParam !== undefined && audienceParam !== 'field' && audienceParam !== 'contractor')
      return res.status(400).json({ error: 'audience must be field or contractor' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // Identity BEFORE any resource lookup (no id probing), then 404, then authz.
    const { userId } = await requireUser(req, supabase)

    const { data: instance, error: instErr } = await supabase
      .from('checklist_instances').select('*').eq('id', instance_id).single()
    if (instErr || !instance)
      return res.status(404).json({ error: instErr?.message ?? 'instance not found' })

    await requireProjectAccess(supabase, userId, instance.project_id)

    const { data: project } = await supabase
      .from('projects').select('*, companies(id, name, abbreviation)')
      .eq('id', instance.project_id).single()

    const { data: targetsData } = await supabase
      .from('checklist_instance_targets')
      .select('*, equipment(*)')
      .eq('instance_id', instance_id)
      .order('sort_order')

    const allTargets = (targetsData ?? []) as any[]
    const responseTargets = allTargets.filter((t: any) => t.role !== 'related')

    // ── Nameplate field defs: per-project first, firm defaults as the fallback ──
    const eqTypes = [...new Set(
      responseTargets.map((t: any) => t.equipment?.equipment_type).filter(Boolean),
    )] as string[]

    let fieldDefs: FieldDef[] = []
    if (eqTypes.length > 0) {
      const { data: projDefs } = await supabase
        .from('project_equipment_field_defs')
        .select('equipment_type, section, field_name, unit, sort_order')
        .eq('project_id', instance.project_id)
        .in('equipment_type', eqTypes)
        .order('sort_order')
      fieldDefs = (projDefs ?? []) as FieldDef[]

      // Any type with no per-project defs falls back to the firm-level defaults.
      const covered = new Set(fieldDefs.map(d => d.equipment_type))
      const uncovered = eqTypes.filter(t => !covered.has(t))
      if (uncovered.length > 0) {
        const { data: firmDefs } = await supabase
          .from('equipment_type_field_defs')
          .select('equipment_type, section, field_name, unit, sort_order')
          .in('equipment_type', uncovered)
          .order('sort_order')
        fieldDefs = fieldDefs.concat((firmDefs ?? []) as FieldDef[])
      }
    }

    const { data: sectionsData } = await supabase
      .from('checklist_instance_sections').select('*')
      .eq('instance_id', instance_id).order('sort_order')
    const sections = (sectionsData ?? []) as any[]

    let items: any[] = []
    let grids: any[] = []
    if (sections.length > 0) {
      const sectionIds = sections.map((s: any) => s.id)
      const [iRes, gRes] = await Promise.all([
        supabase.from('checklist_instance_items').select('*')
          .in('section_id', sectionIds).order('sort_order'),
        supabase.from('checklist_instance_grids').select('*')
          .in('section_id', sectionIds).order('sort_order'),
      ])
      items = (iRes.data ?? []) as any[]
      grids = (gRes.data ?? []) as any[]
    }

    const [rRes, grRes, soRes, flRes] = await Promise.all([
      supabase.from('checklist_responses').select('*').eq('instance_id', instance_id),
      supabase.from('checklist_grid_responses').select('*').eq('instance_id', instance_id),
      // sort_order, then id. NOT created_at: an instance's signoffs are bulk-inserted and
      // share an identical created_at, so ordering by it is non-deterministic.
      supabase.from('checklist_instance_signoffs').select('*')
        .eq('instance_id', instance_id).order('sort_order').order('id'),
      supabase.from('checklist_finding_links')
        .select('item_id, target_id, findings(number, title)')
        .eq('instance_id', instance_id),
    ])

    const responseMap: Record<string, any> = {}
    for (const r of (rRes.data ?? []) as any[]) responseMap[rKey(r.item_id, r.target_id)] = r

    const gridRespMap: Record<string, any> = {}
    for (const g of (grRes.data ?? []) as any[]) gridRespMap[gKey(g.grid_id, g.target_id, g.row_key)] = g

    const findingMap: DocData['findingMap'] = {}
    for (const l of (flRes.data ?? []) as any[]) {
      const f = Array.isArray(l.findings) ? l.findings[0] : l.findings
      if (f) findingMap[rKey(l.item_id, l.target_id)] = { number: f.number, title: f.title }
    }

    const signoffs = (soRes.data ?? []) as any[]

    // Blank-mode audience: IVCs are CxA-filled (Field Copy default); PFCs are
    // contractor-facing (Hand-out default). Explicit param always wins.
    const audience: 'field' | 'contractor' =
      audienceParam ?? (instance.type === 'ivc' ? 'field' : 'contractor')

    // Template render flag (check_table = transposed fleet record).
    let renderMode: string | null = null
    if (instance.source_template_id) {
      const { data: tmplRow } = await supabase
        .from('checklist_templates').select('render_mode')
        .eq('id', instance.source_template_id).single()
      renderMode = tmplRow?.render_mode ?? null
    }

    const docData: DocData = {
      instance, project, responseTargets, sections, items, grids, signoffs, fieldDefs,
      responseMap, gridRespMap, findingMap, mode: mode as 'completed' | 'blank',
      audience, renderMode,
    }

    // ── Integrity guard: no dropped nameplate rows (same rule as the site report) ──
    const { rows: npRows, usedFallback } = buildNameplate(
      responseTargets, instance.nameplate_snapshot ?? null, mode as any, fieldDefs,
    )
    const isCheckTable = renderMode === 'check_table'
    const pdfHtml  = isCheckTable ? buildCheckTableHtml(docData)     : buildChecklistHtml(docData)
    const docxHtml = isCheckTable ? buildCheckTableDocxHtml(docData) : buildChecklistDocxHtml(docData)

    // Count the np-row markers actually emitted — the bug this guards against is the
    // nameplate silently collapsing to a bare header row. Check-table mode has no
    // nameplate (fleet unit data lives on the register): the guard is standard-only.
    const expectedNpRows = npRows.length
    const pdfNpRows      = (pdfHtml.match(/class="np-row"/g)  ?? []).length
    const docxNpRows     = (docxHtml.match(/class="np-row"/g) ?? []).length
    const gridRowCount   = grids.reduce((s, g) => s + (g.definition.rows?.length ?? 0), 0)

    if (!isCheckTable) {
      if (expectedNpRows === 0)
        console.error('[checklist] FATAL: nameplate resolved to 0 rows — the table would print empty')
      if (pdfNpRows !== expectedNpRows || docxNpRows !== expectedNpRows)
        console.error(
          `[checklist] NAMEPLATE ROW MISMATCH: expected ${expectedNpRows}, ` +
          `pdf ${pdfNpRows}, docx ${docxNpRows}`,
        )
    }

    console.log(
      `[checklist] instance=${instance_id} mode=${mode} render=${renderMode ?? 'standard'} ` +
      `units=${responseTargets.length} items=${items.length} gridRows=${gridRowCount} ` +
      `npRows=${expectedNpRows} (pdf ${pdfNpRows} / docx ${docxNpRows}) fieldDefs=${fieldDefs.length} ` +
      `fallback=${usedFallback} findings=${Object.keys(findingMap).length}`,
    )

    // DOCX is required in standard mode; attempted-but-optional for check_table
    // (gate verdict): if html-to-docx fights the transposed table, ship PDF-only.
    const pdfBuffer = await toPdf(pdfHtml, isCheckTable)
    let docxBuffer: Buffer | null = null
    try {
      docxBuffer = await toDocx(docxHtml)
    } catch (docxErr: any) {
      if (!isCheckTable) throw docxErr
      console.warn(`[checklist] check_table DOCX failed (shipping PDF-only): ${docxErr.message}`)
    }

    const store = supabase.storage.from('checklists')
    // Blank variants coexist per audience (field copy vs contractor hand-out).
    const base  = `${instance.project_id}/${instance_id}/${mode === 'blank' ? `blank-${audience}` : mode}`
    const pdfUp = await store.upload(`${base}.pdf`, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (pdfUp.error) return res.status(500).json({ error: pdfUp.error.message })
    let signedDocxUrl: string | null = null
    if (docxBuffer) {
      const docxUp = await store.upload(`${base}.docx`, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      })
      if (docxUp.error) return res.status(500).json({ error: docxUp.error.message })
      const { data: dSig, error: dErr } = await store.createSignedUrl(`${base}.docx`, 600)
      if (dErr) return res.status(500).json({ error: dErr.message })
      signedDocxUrl = dSig.signedUrl
    }

    // Checklist outputs are ephemeral (nothing persisted) — the response carries
    // short-lived signed URLs directly (storage privacy pass; 10-minute expiry).
    // Signed URLs are unique per mint, so the old cache-buster is obsolete.
    const { data: pSig, error: pErr } = await store.createSignedUrl(`${base}.pdf`, 600)
    if (pErr) return res.status(500).json({ error: pErr.message })

    return res.status(200).json({
      pdf_url:     pSig.signedUrl,
      storage_url: signedDocxUrl,
      stats: {
        units: responseTargets.length, nameplate_rows: expectedNpRows, fallback: usedFallback,
        render_mode: renderMode ?? 'standard', docx: !!docxBuffer,
      },
    })

  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('generate-checklist error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
