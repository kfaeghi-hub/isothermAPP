import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx'

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
  if (s === 'y' || s === 'pass') return 'color:#1E8449;font-weight:bold;'
  if (s === 'n' || s === 'fail') return 'color:#C0392B;font-weight:bold;'
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
  return mode === 'completed' ? '<span style="color:#9AA3AE;">—</span>' : ''
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
  .firm h1 { color: #1F3A5F; font-size: 18pt; font-weight: 700; letter-spacing: 0.5px; }
  .firm .addr { font-size: 8pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: #1F3A5F; margin: 8px 0 0; border-radius: 2px; }

  .title-legend { display: table; width: 100%; margin-top: 10px; }
  .tl-title { display: table-cell; vertical-align: middle; }
  .tl-legend { display: table-cell; vertical-align: top; border: 1px solid #C9D2DD; border-radius: 4px; padding: 6px 10px; background: #F6F8FB; font-size: 7.5pt; color: #333; white-space: nowrap; }
  .cl-name { font-size: 11pt; font-weight: 700; color: #1F3A5F; }
  .cl-sub { font-size: 8pt; color: #666; margin-top: 1px; }
  .lg-hdr { font-weight: 700; color: #1F3A5F; margin-bottom: 3px; }

  .blank-notice { background: #FFF9C4; border: 1px solid #F59E0B; padding: 5px 10px; margin: 8px 0; font-size: 8pt; font-weight: 700; color: #92400E; border-radius: 4px; }

  h2.sec { color: #1F3A5F; font-size: 10.5pt; font-weight: 700; margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 2px solid #1F3A5F; page-break-after: avoid; break-after: avoid; }

  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 4px; font-size: 8.5pt; }
  thead { display: table-header-group; }
  thead th { background: #1F3A5F; color: #fff; font-weight: 600; text-align: center; padding: 5px 6px; font-size: 8pt; border: 1px solid #1F3A5F; word-wrap: break-word; }
  thead th.lh { text-align: left; }
  tbody td { padding: 5px 6px; border: 1px solid #DDE3EA; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  tbody tr:nth-child(even) td { background: #F6F8FB; }
  tr { page-break-inside: avoid; break-inside: avoid; }

  /* Header block — bordered, two columns, matching the real form */
  .hdr-tbl td { padding: 7px 10px; border: 1px solid #C9D2DD; vertical-align: top; font-size: 8.5pt; background: #fff !important; }
  .hdr-lbl { color: #6B7280; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  .hdr-val { font-weight: 600; color: #1F3A5F; }
  .hdr-line { border-bottom: 1px solid #B8C2CE; display: inline-block; min-width: 55%; height: 11px; }

  .th-unit { background: #2C5282 !important; font-size: 8pt; }
  .th-sub  { background: #3D6A9F !important; font-size: 7pt; }
  .np-label { text-align: left !important; font-size: 7.5pt; }
  .np-val  { text-align: center; font-size: 8pt; }
  /* Not-applicable cell (field not defined for this section): shaded, NO text —
     on the blank hand-out the contractor instantly sees which cells to skip. */
  .np-blocked { background: #E8EBEF !important; }
  .empty-dash { color: #9AA3AE; }
  /* Blank mode: fillable cells must be CLEAN WHITE for handwriting — zebra striping
     would read as almost the same grey as the not-applicable shade on paper. */
  body.mode-blank tbody tr:nth-child(even) td { background: #fff; }
  body.mode-blank tbody tr:nth-child(even) td.np-blocked,
  body.mode-blank .np-blocked { background: #E8EBEF !important; }

  .sec-row td { background: #DDE3EA !important; font-weight: 700; font-size: 7.5pt; color: #1F3A5F; text-transform: uppercase; padding: 4px 8px; border-color: #C9D2DD; }

  .st-cell { text-align: center; font-weight: 600; }
  .st-y  { color: #1E8449; }
  .st-n  { color: #C0392B; }
  .st-nr { color: #888; }
  .fnd   { display: block; font-size: 6.5pt; color: #C0392B; font-weight: 700; margin-top: 1px; }
  .hint  { font-style: italic; font-size: 7.5pt; color: #888; margin-top: 2px; }

  .so-role { font-weight: 600; font-size: 8.5pt; }
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
}

/** Legend wording depends on the checklist type. */
function legendLines(instance: any): string[] {
  if (instance.type === 'fpt') {
    return ['PASS — Verified / Acceptable', 'FAIL — Not Verified / Deficient']
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

// ── HTML builder (PDF path) ────────────────────────────────────────────────────

function buildChecklistHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, grids, signoffs, fieldDefs,
          responseMap, gridRespMap, findingMap, mode } = d
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
      checksBody += `<tr class="sec-row"><td colspan="${2 + nUnits}">${esc(section.title)}</td></tr>\n`
      for (const item of sItems) {
        const stCells = responseTargets.map(t => {
          const st = mode === 'blank' ? null : (responseMap[rKey(item.id, t.id)]?.status ?? null)
          const fnd = mode === 'blank' ? null : findingMap[rKey(item.id, t.id)]
          const label = st ? `<span class="${stClass(st)}">${esc(stLabel(st))}</span>` : dashOr(mode, '')
          return `<td class="st-cell">${label}` +
                 `${fnd ? `<span class="fnd">→ #${esc(fnd.number ?? '?')}</span>` : ''}</td>`
        }).join('')
        const comment = mode === 'blank' ? '' : responseTargets
          .map(t => responseMap[rKey(item.id, t.id)]?.comment).filter(Boolean).join(' / ')
        checksBody += `<tr>
          <td>${esc(item.label)}${item.hint ? `<div class="hint">${esc(item.hint)}</div>` : ''}</td>
          ${stCells}
          <td>${dashOr(mode, comment)}</td>
        </tr>\n`
      }
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
      `<tr><td style="font-weight:700;color:#C0392B;">#${esc(f.number ?? '?')}</td><td>${esc(f.title ?? '')}</td></tr>`
    ).join('\n')}</tbody>
  </table>`

  // ── Signoffs ────────────────────────────────────────────────────────────────
  const signoffRows = signoffs.map(s => {
    const nameCompany = mode === 'blank' ? '' : [s.signer_name, s.signer_company].filter(Boolean).join(' / ')
    const date = mode === 'blank' ? '' : isoShort(s.signed_at)
    return `<tr>
      <td class="so-role">${esc(s.role_label_snapshot)}</td>
      <td>${dashOr(mode, nameCompany)}</td>
      <td></td>
      <td style="font-family:monospace;font-size:8pt;">${dashOr(mode, date)}</td>
    </tr>`
  }).join('\n')

  // ── Header block ────────────────────────────────────────────────────────────
  // Blank mode: the CONTRACTOR identifies themselves — no Isotherm name on the form.
  const blankLine = `<span class="hdr-line"></span>`
  const rightRows = mode === 'blank'
    ? [['Name', blankLine], ['Company', blankLine], ['Email', blankLine], ['Phone', blankLine], ['Date', blankLine]]
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
    ? 'BLANK FORM — FOR CONTRACTOR USE'
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

  ${mode === 'blank' ? `<div class="blank-notice">BLANK FORM — FOR CONTRACTOR USE — Complete on site and return to Isotherm Engineering Ltd.</div>` : ''}

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

  <h2 class="sec">Equipment Nameplate Data</h2>
  <table>
    ${colgroup(npWidths)}
    <thead>
      <tr><th class="lh" rowspan="2"></th>${npUnitThs}</tr>
      <tr>${npSubThs}</tr>
    </thead>
    <tbody>${npBodyRows}</tbody>
  </table>

  ${checksBody.trim() ? `
  <h2 class="sec">Installation Checks</h2>
  <table>
    ${colgroup(itemWidths)}
    <thead>
      <tr><th class="lh">Item</th>${unitThs}<th class="lh">Comments</th></tr>
    </thead>
    <tbody>${checksBody}</tbody>
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
          responseMap, gridRespMap, findingMap, mode } = d
  const snapshot = instance.nameplate_snapshot ?? null
  const nUnits = responseTargets.length

  const T    = 'style="width:100%;border-collapse:collapse;font-size:8.5pt;"'
  const TH   = 'style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;text-align:center;padding:5px 6px;border:1px solid #1F3A5F;font-size:8pt;"'
  const THL  = 'style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;text-align:left;padding:5px 6px;border:1px solid #1F3A5F;font-size:8pt;"'
  const THUN = 'style="background-color:#2C5282;color:#ffffff;font-weight:bold;text-align:center;padding:5px 6px;border:1px solid #2C5282;font-size:8pt;"'
  const THSB = 'style="background-color:#3D6A9F;color:#ffffff;font-weight:bold;text-align:center;padding:5px 6px;border:1px solid #3D6A9F;font-size:7pt;"'
  // Blank mode drops zebra striping: fillable cells must be clean white so the
  // only grey on the page is the not-applicable shade.
  const zebra = mode === 'completed'
  const td   = (i: number, extra = '') =>
    `style="padding:5px 6px;border:1px solid #DDE3EA;vertical-align:top;font-size:8pt;${zebra && i % 2 === 1 ? 'background-color:#F6F8FB;' : ''}${extra}"`
  const tdBlocked = 'style="padding:5px 6px;border:1px solid #DDE3EA;background-color:#E8EBEF;font-size:8pt;"'
  const tdSec = 'style="background-color:#DDE3EA;font-weight:bold;font-size:7.5pt;color:#1F3A5F;text-transform:uppercase;padding:4px 8px;border:1px solid #C9D2DD;"'

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
            ? `<br><span style="font-size:6.5pt;color:#C0392B;font-weight:bold;">&rarr; #${esc(fnd.number ?? '?')}</span>`
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
    `<tr><td ${td(i, 'font-weight:bold;color:#C0392B;')}>#${esc(f.number ?? '?')}</td><td ${td(i)}>${esc(f.title ?? '')}</td></tr>`
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
  const line = '<span style="color:#B8C2CE;">__________________________</span>'
  const rightRows = mode === 'blank'
    ? [['Name', line], ['Company', line], ['Email', line], ['Phone', line], ['Date', line]]
    : [
        ['Name',    `<strong>${esc(instance.completed_by ?? instance.authored_by ?? '')}</strong>`],
        ['Company', `<strong>Isotherm Engineering Ltd.</strong>`],
        ['Email',   `<strong>${FIRM_EMAIL}</strong>`],
        ['Phone',   `<strong>${FIRM_PHONE}</strong>`],
        ['Date',    `<strong>${esc(isoShort(instance.completed_at ?? instance.date_performed))}</strong>`],
      ]
  const hdrLbl = 'style="color:#6B7280;font-size:7.5pt;"'
  const leftHtml = [
    ['Customer',        esc(project?.companies?.name ?? project?.companies?.abbreviation ?? '—')],
    ['Project',         esc(project?.name ?? '—')],
    ['Project Address', esc(project?.address ?? '—')],
    ['Project #',       esc(project?.com_number ?? '—')],
  ].map(([l, v]) => `<p style="margin:3px 0;"><span ${hdrLbl}>${l}:</span> <strong>${v}</strong></p>`).join('')
  const rightHtml = rightRows
    .map(([l, v]) => `<p style="margin:3px 0;"><span ${hdrLbl}>${l}:</span> ${v}</p>`).join('')

  const modeSubtitle = mode === 'blank' ? 'BLANK FORM — FOR CONTRACTOR USE' :
    `COMPLETED${instance.completed_at ? ' · ' + isoShort(instance.completed_at) : ''}`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; }
  h1 { color: #1F3A5F; font-size: 18pt; font-weight: bold; text-align: center; margin: 0; }
  h2 { color: #1F3A5F; font-size: 10.5pt; font-weight: bold; margin: 14px 0 5px; }
  p { margin: 3px 0; }
</style>
</head>
<body>

<h1>${FIRM_NAME}</h1>
<p style="text-align:center;font-size:8pt;color:#555;margin:2px 0;">${FIRM_ADDR} &nbsp;&bull;&nbsp; ${FIRM_PHONE} &nbsp;&bull;&nbsp; ${FIRM_EMAIL}</p>

${mode === 'blank' ? `<p style="background-color:#FFF9C4;border:1px solid #F59E0B;padding:5px 10px;font-size:8pt;font-weight:bold;color:#92400E;margin:8px 0;">BLANK FORM — FOR CONTRACTOR USE — Complete on site and return to Isotherm Engineering Ltd.</p>` : ''}

<p style="font-size:12pt;font-weight:bold;color:#1F3A5F;margin-top:10px;">${esc(instance.source_template_name_snapshot)}</p>
<p style="font-size:8pt;color:#666;">${esc(instance.source_template_type_snapshot?.toUpperCase())} &nbsp;&bull;&nbsp; ${esc(modeSubtitle)}</p>

<p style="font-size:8pt;color:#333;border:1px solid #C9D2DD;background-color:#F6F8FB;padding:5px 8px;margin:8px 0;">
  <strong style="color:#1F3A5F;">LEGEND:</strong> ${legendLines(instance).map(esc).join(' &nbsp;·&nbsp; ')}
</p>

<table ${T} style="width:100%;border-collapse:collapse;margin-top:10px;">
  <tbody><tr>
    <td style="padding:7px 10px;border:1px solid #C9D2DD;vertical-align:top;">${leftHtml}</td>
    <td style="padding:7px 10px;border:1px solid #C9D2DD;vertical-align:top;">${rightHtml}</td>
  </tr></tbody>
</table>

<h2>Unit Identity</h2>
<table ${T}>
  <thead><tr><th ${THL}></th>${responseTargets.map(t => `<th ${TH}>${unitTag(t)}</th>`).join('')}</tr></thead>
  <tbody>${unitIdRows}</tbody>
</table>

<h2>Equipment Nameplate Data</h2>
<table ${T}>
  <thead>
    <tr><th ${THL} rowspan="2"></th>${npUnitThs}</tr>
    <tr>${npSubThs}</tr>
  </thead>
  <tbody>${npBodyRows}</tbody>
</table>

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

async function toPdf(html: string): Promise<Buffer> {
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

// ── Vercel serverless handler ──────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { instance_id, mode = 'completed' } = req.body ?? {}
    if (!instance_id) return res.status(400).json({ error: 'instance_id required' })
    if (mode !== 'completed' && mode !== 'blank')
      return res.status(400).json({ error: 'mode must be completed or blank' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: instance, error: instErr } = await supabase
      .from('checklist_instances').select('*').eq('id', instance_id).single()
    if (instErr || !instance)
      return res.status(404).json({ error: instErr?.message ?? 'instance not found' })

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

    const docData: DocData = {
      instance, project, responseTargets, sections, items, grids, signoffs, fieldDefs,
      responseMap, gridRespMap, findingMap, mode: mode as 'completed' | 'blank',
    }

    // ── Integrity guard: no dropped nameplate rows (same rule as the site report) ──
    const { rows: npRows, usedFallback } = buildNameplate(
      responseTargets, instance.nameplate_snapshot ?? null, mode as any, fieldDefs,
    )
    const pdfHtml  = buildChecklistHtml(docData)
    const docxHtml = buildChecklistDocxHtml(docData)

    // Count the np-row markers actually emitted — the bug this guards against is the
    // nameplate silently collapsing to a bare header row.
    const expectedNpRows = npRows.length
    const pdfNpRows      = (pdfHtml.match(/class="np-row"/g)  ?? []).length
    const docxNpRows     = (docxHtml.match(/class="np-row"/g) ?? []).length
    const gridRowCount   = grids.reduce((s, g) => s + (g.definition.rows?.length ?? 0), 0)

    if (expectedNpRows === 0)
      console.error('[checklist] FATAL: nameplate resolved to 0 rows — the table would print empty')
    if (pdfNpRows !== expectedNpRows || docxNpRows !== expectedNpRows)
      console.error(
        `[checklist] NAMEPLATE ROW MISMATCH: expected ${expectedNpRows}, ` +
        `pdf ${pdfNpRows}, docx ${docxNpRows}`,
      )

    console.log(
      `[checklist] instance=${instance_id} mode=${mode} units=${responseTargets.length} ` +
      `items=${items.length} gridRows=${gridRowCount} npRows=${expectedNpRows} ` +
      `(pdf ${pdfNpRows} / docx ${docxNpRows}) fieldDefs=${fieldDefs.length} ` +
      `fallback=${usedFallback} findings=${Object.keys(findingMap).length}`,
    )

    const [pdfBuffer, docxBuffer] = await Promise.all([toPdf(pdfHtml), toDocx(docxHtml)])

    const store = supabase.storage.from('checklists')
    const base  = `${instance.project_id}/${instance_id}/${mode}`
    const [docxUp, pdfUp] = await Promise.all([
      store.upload(`${base}.docx`, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      }),
      store.upload(`${base}.pdf`, pdfBuffer, { contentType: 'application/pdf', upsert: true }),
    ])
    if (docxUp.error ?? pdfUp.error)
      return res.status(500).json({ error: (docxUp.error ?? pdfUp.error)?.message })

    const ts = Date.now()
    const { data: { publicUrl: rawDocxUrl } } = store.getPublicUrl(`${base}.docx`)
    const { data: { publicUrl: rawPdfUrl  } } = store.getPublicUrl(`${base}.pdf`)

    return res.status(200).json({
      pdf_url:     `${rawPdfUrl}?t=${ts}`,
      storage_url: `${rawDocxUrl}?t=${ts}`,
      stats: { units: responseTargets.length, nameplate_rows: expectedNpRows, fallback: usedFallback },
    })

  } catch (err: any) {
    console.error('generate-checklist error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
