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

// ── Nameplate row builder ──────────────────────────────────────────────────────
// For each target, resolves equipment data from snapshot (completed) or live (blank).
// Returns array of rows ready for the nameplate table.

interface NpRow {
  label: string
  isSubHeader?: boolean
  values: { spec: string; shopDwg: string; installed: string }[]
}

function buildNameplateRows(
  responseTargets: any[],
  snapshot: Record<string, any> | null,
  mode: 'completed' | 'blank',
): NpRow[] {
  const rows: NpRow[] = []

  function getEq(target: any): any {
    if (mode === 'completed' && snapshot?.[target.equipment_id]) {
      return snapshot[target.equipment_id]
    }
    return target.equipment ?? {}
  }

  // Standard fields
  const std: { label: string; specFn: (e: any) => string; installedFn: (e: any) => string }[] = [
    { label: 'MANUFACTURER',  specFn: e => e.manufacturer ?? '',  installedFn: _ => '' },
    { label: 'MODEL',         specFn: e => e.model ?? '',         installedFn: _ => '' },
    { label: 'SERIAL NUMBER', specFn: _ => '',                    installedFn: e => e.serial_number ?? '' },
    {
      label: 'V / Ø / HZ / A',
      specFn: e => [e.voltage, e.phase, e.hz, e.amperage].filter(Boolean).join('/'),
      installedFn: _ => '',
    },
    { label: 'FLOW',     specFn: e => e.flow ?? '',     installedFn: _ => '' },
    { label: 'CAPACITY', specFn: e => e.capacity ?? '', installedFn: _ => '' },
  ]

  for (const f of std) {
    const vals = responseTargets.map(t => {
      const e = getEq(t)
      return {
        spec:      f.specFn(e),
        shopDwg:   '',
        installed: mode === 'blank' ? '' : f.installedFn(e),
      }
    })
    if (vals.some(v => v.spec || (mode === 'completed' && v.installed))) {
      rows.push({ label: f.label, values: vals })
    }
  }

  // nameplate_extra — collect union of all keys across all sections × all targets
  const allKeys = new Set<string>()
  for (const t of responseTargets) {
    const extra = getEq(t).nameplate_extra ?? {}
    for (const sec of ['spec', 'shop_drawing', 'installed'] as const) {
      for (const k of Object.keys(extra[sec] ?? {})) allKeys.add(k)
    }
  }

  if (allKeys.size > 0) {
    for (const key of allKeys) {
      const vals = responseTargets.map(t => {
        const extra = getEq(t).nameplate_extra ?? {}
        return {
          spec:      extra.spec?.[key]         ?? '',
          shopDwg:   extra.shop_drawing?.[key] ?? '',
          installed: mode === 'blank' ? '' : (extra.installed?.[key] ?? ''),
        }
      })
      rows.push({ label: key.replace(/_/g, ' ').toUpperCase(), values: vals })
    }
  }

  return rows
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

  .phead { display: table; width: 100%; margin-top: 10px; border: 1px solid #C9D2DD; border-radius: 4px; overflow: hidden; }
  .ph-cell { display: table-cell; padding: 8px 12px; vertical-align: middle; font-size: 9pt; }
  .ph-left { width: 50%; }
  .ph-right { width: 50%; border-left: 1px solid #C9D2DD; }
  .lbl { color: #777; font-size: 8pt; }
  .val { font-weight: 600; }

  .blank-notice { background: #FFF9C4; border: 1px solid #F59E0B; padding: 5px 10px; margin: 8px 0; font-size: 8pt; font-weight: 700; color: #92400E; border-radius: 4px; }

  h2.sec { color: #1F3A5F; font-size: 10.5pt; font-weight: 700; margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 2px solid #1F3A5F; page-break-after: avoid; break-after: avoid; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 8.5pt; }
  thead { display: table-header-group; }
  thead th { background: #1F3A5F; color: #fff; font-weight: 600; text-align: center; padding: 5px 8px; font-size: 8pt; border: 1px solid #1F3A5F; }
  thead th.lh { text-align: left; }
  tbody td { padding: 5px 8px; border: 1px solid #DDE3EA; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F6F8FB; }
  tr { page-break-inside: avoid; break-inside: avoid; }

  .th-unit { background: #2C5282 !important; font-size: 8pt; }
  .th-sub  { background: #3D6A9F !important; font-size: 7.5pt; }
  .np-label { text-align: left !important; }
  .np-val  { text-align: center; }

  .sec-row td { background: #DDE3EA !important; font-weight: 700; font-size: 7.5pt; color: #1F3A5F; text-transform: uppercase; padding: 4px 8px; border-color: #C9D2DD; }

  .st-cell { text-align: center; font-weight: 600; }
  .st-y  { color: #1E8449; }
  .st-n  { color: #C0392B; }
  .st-nr { color: #888; }
  .hint  { font-style: italic; font-size: 7.5pt; color: #888; margin-top: 2px; }

  .so-role { font-weight: 600; font-size: 8.5pt; }
`

// ── HTML builder (PDF path) ────────────────────────────────────────────────────

interface DocData {
  instance:       any
  project:        any
  responseTargets: any[]   // targets with role !== 'related', equipment joined
  sections:       any[]
  items:          any[]
  grids:          any[]
  signoffs:       any[]
  responseMap:    Record<string, any>   // rKey → ChecklistResponse
  gridRespMap:    Record<string, any>   // gKey → ChecklistGridResponse
  mode:           'completed' | 'blank'
}

function buildChecklistHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, grids, signoffs, responseMap, gridRespMap, mode } = d
  const snapshot = instance.nameplate_snapshot ?? null
  const nUnits = responseTargets.length

  // Unit tags for column headers
  const unitTag = (t: any) => esc(t.equipment?.tag ?? t.equipment?.descriptor ?? '?')

  // ── Unit identity block ─────────────────────────────────────────────────────
  const idFields = ['tag', 'descriptor', 'location', 'area_served'] as const
  const idLabels = ['UNIT TAG', 'DESCRIPTOR', 'LOCATION', 'AREA SERVED']
  const unitIdRows = idFields.map((field, i) => {
    const cells = responseTargets.map(t => `<td class="np-val">${esc(t.equipment?.[field] ?? '')}</td>`).join('')
    return `<tr><td class="np-label">${esc(idLabels[i])}</td>${cells}</tr>`
  }).join('\n')

  // ── Nameplate table ──────────────────────────────────────────────────────────
  const npRows = buildNameplateRows(responseTargets, snapshot, mode)
  const npUnitThs = responseTargets.map(t => `<th class="th-unit" colspan="3">${unitTag(t)}</th>`).join('')
  const npSubThs  = responseTargets.map(() => `<th class="th-sub">Specified</th><th class="th-sub">Shop Drawing</th><th class="th-sub">Installed</th>`).join('')
  const npBodyRows = npRows.map(row =>
    row.isSubHeader ? '' :
    `<tr><td class="np-label">${esc(row.label)}</td>${row.values.map(v =>
      `<td class="np-val">${esc(v.spec)}</td><td class="np-val">${esc(v.shopDwg)}</td><td class="np-val">${esc(v.installed)}</td>`
    ).join('')}</tr>`
  ).join('\n')

  // ── Checks + grids ───────────────────────────────────────────────────────────
  const unitThs = responseTargets.map(t => `<th>${unitTag(t)}</th>`).join('')
  let checksBody = ''
  for (const section of sections) {
    const sItems = items.filter(i => i.section_id === section.id)
    const sGrids = grids.filter(g => g.section_id === section.id)
    if (sItems.length === 0 && sGrids.length === 0) continue

    checksBody += `<tr class="sec-row"><td colspan="${2 + nUnits}">${esc(section.title)}</td></tr>\n`

    for (const item of sItems) {
      const stCells = responseTargets.map(t => {
        const st = mode === 'blank' ? null : (responseMap[rKey(item.id, t.id)]?.status ?? null)
        const lbl = stLabel(st)
        return `<td class="st-cell"><span class="${stClass(st)}">${esc(lbl)}</span></td>`
      }).join('')
      const comment = mode === 'blank' ? '' : responseTargets
        .map(t => responseMap[rKey(item.id, t.id)]?.comment).filter(Boolean).join(' / ')
      checksBody += `<tr>
        <td>${esc(item.label)}${item.hint ? `<div class="hint">${esc(item.hint)}</div>` : ''}</td>
        ${stCells}
        <td>${esc(comment)}</td>
      </tr>\n`
    }

    for (const grid of sGrids) {
      const cols = grid.definition.columns as any[]
      const rows = grid.definition.rows   as any[]
      const nc = cols.length
      const totalCols = 1 + nUnits * nc

      const gridUnitThs = responseTargets.map(t => `<th colspan="${nc}">${unitTag(t)}</th>`).join('')
      const gridColThs  = responseTargets.map(() =>
        cols.map(c => `<th>${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}</th>`).join('')
      ).join('')
      const gridRows = rows.map(row => {
        const cells = responseTargets.map(t =>
          cols.map(col => {
            const val = mode === 'blank' ? '' : (gridRespMap[gKey(grid.id, t.id, row.key)]?.data?.[col.key] ?? '')
            return `<td class="st-cell">${esc(val)}</td>`
          }).join('')
        ).join('')
        return `<tr><td>${esc(row.label)}</td>${cells}</tr>`
      }).join('\n')

      checksBody += `<tr class="sec-row"><td colspan="${totalCols}" style="font-style:italic;">${esc(grid.title)}</td></tr>
      <tr>
        <th class="lh" rowspan="2" style="background:#1F3A5F;"></th>
        ${gridUnitThs}
      </tr>
      <tr>${gridColThs}</tr>
      ${gridRows}\n`
    }
  }

  // ── Signoffs ─────────────────────────────────────────────────────────────────
  const signoffRows = signoffs.map((s, i) => {
    const nameCompany = mode === 'blank' ? '' : [s.signer_name, s.signer_company].filter(Boolean).join(' / ')
    const date = mode === 'blank' ? '' : isoShort(s.signed_at)
    const even = i % 2 === 0
    return `<tr>
      <td class="so-role">${esc(s.role_label_snapshot)}</td>
      <td>${esc(nameCompany)}</td>
      <td></td>
      <td style="font-family:monospace;font-size:8pt;">${esc(date)}</td>
    </tr>`
  }).join('\n')

  const modeSubtitle = mode === 'blank'
    ? 'BLANK FORM — FOR CONTRACTOR USE'
    : `COMPLETED${instance.completed_at ? ' · ' + isoShort(instance.completed_at) : ''}`

  const clientName = project?.companies?.name ?? project?.companies?.abbreviation ?? '—'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${CSS}</style>
</head>
<body>
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
      Y — Installed / Acceptable<br>
      N — Missing and Required<br>
      NR — Not Required<br>
      NA — Not Applicable<br>
      PASS / FAIL — Verified or Not
    </div>
  </div>

  <div class="phead">
    <div class="ph-cell ph-left">
      <div><span class="lbl">Customer:</span> <span class="val">${esc(clientName)}</span></div>
      <div><span class="lbl">Project:</span> <span class="val">${esc(project?.name ?? '—')}</span></div>
      <div><span class="lbl">Project Address:</span> <span class="val">${esc(project?.address ?? '—')}</span></div>
    </div>
    <div class="ph-cell ph-right">
      <div><span class="lbl">Project Number:</span> <span class="val">${esc(project?.com_number ?? '—')}</span></div>
      <div><span class="lbl">Date:</span> <span class="val">${esc(isoShort(instance.date_performed))}</span></div>
      <div><span class="lbl">By:</span> <span class="val">${esc(instance.authored_by ?? '')}</span></div>
    </div>
  </div>

  <h2 class="sec">Equipment Nameplate Data</h2>

  <table style="margin-bottom:4px;">
    <thead>
      <tr>
        <th class="lh" style="background:#1F3A5F;"></th>
        ${responseTargets.map(t => `<th>${unitTag(t)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${unitIdRows}</tbody>
  </table>

  <table>
    <thead>
      <tr>
        <th class="lh" rowspan="2" style="background:#1F3A5F;"></th>
        ${npUnitThs}
      </tr>
      <tr>${npSubThs}</tr>
    </thead>
    <tbody>${npBodyRows}</tbody>
  </table>

  ${checksBody.trim() ? `
  <h2 class="sec">Installation Checks</h2>
  <table>
    <thead>
      <tr>
        <th class="lh">Item</th>
        ${unitThs}
        <th class="lh">Comments</th>
      </tr>
    </thead>
    <tbody>${checksBody}</tbody>
  </table>
  ` : ''}

  ${signoffs.length > 0 ? `
  <h2 class="sec">Sign-offs</h2>
  <table>
    <thead>
      <tr>
        <th class="lh">Position / Title</th>
        <th class="lh">Name / Company</th>
        <th class="lh">Signature</th>
        <th class="lh">Date</th>
      </tr>
    </thead>
    <tbody>${signoffRows}</tbody>
  </table>
  ` : ''}

</div>
</body>
</html>`
}

// ── DOCX HTML builder ──────────────────────────────────────────────────────────
// Inline styles only; never write width: on th/td (html-to-docx crashes on those).

function buildChecklistDocxHtml(d: DocData): string {
  const { instance, project, responseTargets, sections, items, grids, signoffs, responseMap, gridRespMap, mode } = d
  const snapshot = instance.nameplate_snapshot ?? null
  const nUnits = responseTargets.length

  const TH   = 'style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;text-align:center;padding:5px 8px;border:1px solid #1F3A5F;font-size:8pt;"'
  const THL  = 'style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;text-align:left;padding:5px 8px;border:1px solid #1F3A5F;font-size:8pt;"'
  const THUN = 'style="background-color:#2C5282;color:#ffffff;font-weight:bold;text-align:center;padding:5px 8px;border:1px solid #2C5282;font-size:8pt;"'
  const THSB = 'style="background-color:#3D6A9F;color:#ffffff;font-weight:bold;text-align:center;padding:5px 8px;border:1px solid #3D6A9F;font-size:7.5pt;"'
  const td  = (i: number, extra = '') =>
    `style="padding:5px 8px;border:1px solid #DDE3EA;vertical-align:top;font-size:8.5pt;${i % 2 === 1 ? 'background-color:#F6F8FB;' : ''}${extra}"`
  const tdSec = 'style="background-color:#DDE3EA;font-weight:bold;font-size:7.5pt;color:#1F3A5F;text-transform:uppercase;padding:4px 8px;border:1px solid #C9D2DD;"'

  const unitTag = (t: any) => esc(t.equipment?.tag ?? t.equipment?.descriptor ?? '?')

  // Unit identity
  const idFields = ['tag', 'descriptor', 'location', 'area_served'] as const
  const idLabels = ['UNIT TAG', 'DESCRIPTOR', 'LOCATION', 'AREA SERVED']
  const unitIdRows = idFields.map((field, i) => {
    const cells = responseTargets.map((t, ci) =>
      `<td ${td(ci + 1, 'text-align:center;')}>${esc(t.equipment?.[field] ?? '')}</td>`
    ).join('')
    return `<tr>
      <td ${td(i, 'font-size:8pt;')}>${esc(idLabels[i])}</td>
      ${cells}
    </tr>`
  }).join('\n')

  // Nameplate
  const npRows = buildNameplateRows(responseTargets, snapshot, mode)
  const npUnitThs = responseTargets.map(t => `<th ${THUN} colspan="3">${unitTag(t)}</th>`).join('')
  const npSubThs  = responseTargets.map(() =>
    `<th ${THSB}>Specified</th><th ${THSB}>Shop Drawing</th><th ${THSB}>Installed</th>`
  ).join('')
  const npBodyRows = npRows.map((row, ri) =>
    row.isSubHeader ? '' :
    `<tr>
      <td ${td(ri, 'font-size:8pt;')}>${esc(row.label)}</td>
      ${row.values.map((v, ci) =>
        `<td ${td(ri, 'text-align:center;font-size:8pt;')}>${esc(v.spec)}</td><td ${td(ri, 'text-align:center;font-size:8pt;')}>${esc(v.shopDwg)}</td><td ${td(ri, 'text-align:center;font-size:8pt;')}>${esc(v.installed)}</td>`
      ).join('')}
    </tr>`
  ).join('\n')

  // Checks + grids
  const unitThs = responseTargets.map(t => `<th ${TH}>${unitTag(t)}</th>`).join('')
  let checksBody = ''
  let rowIdx = 0
  for (const section of sections) {
    const sItems = items.filter(i => i.section_id === section.id)
    const sGrids = grids.filter(g => g.section_id === section.id)
    if (sItems.length === 0 && sGrids.length === 0) continue

    checksBody += `<tr><td ${tdSec} colspan="${2 + nUnits}">${esc(section.title)}</td></tr>\n`

    for (const item of sItems) {
      const stCells = responseTargets.map(t => {
        const st = mode === 'blank' ? null : (responseMap[rKey(item.id, t.id)]?.status ?? null)
        const lbl = stLabel(st)
        return `<td ${td(rowIdx, 'text-align:center;font-weight:bold;' + stInline(st))}>${esc(lbl)}</td>`
      }).join('')
      const comment = mode === 'blank' ? '' : responseTargets
        .map(t => responseMap[rKey(item.id, t.id)]?.comment).filter(Boolean).join(' / ')
      checksBody += `<tr>
        <td ${td(rowIdx)}>${esc(item.label)}${item.hint ? `<br><em style="font-size:7.5pt;color:#888;">${esc(item.hint)}</em>` : ''}</td>
        ${stCells}
        <td ${td(rowIdx)}>${esc(comment)}</td>
      </tr>\n`
      rowIdx++
    }

    for (const grid of sGrids) {
      const cols = grid.definition.columns as any[]
      const rows = grid.definition.rows   as any[]
      const nc   = cols.length

      const gUnitThs = responseTargets.map(t => `<th ${THUN} colspan="${nc}">${unitTag(t)}</th>`).join('')
      const gColThs  = responseTargets.map(() =>
        cols.map(c => `<th ${THSB}>${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}</th>`).join('')
      ).join('')

      checksBody += `<tr><td ${tdSec} colspan="${1 + nUnits * nc}" style="background-color:#DDE3EA;font-weight:bold;font-size:7.5pt;color:#1F3A5F;padding:4px 8px;border:1px solid #C9D2DD;font-style:italic;">${esc(grid.title)}</td></tr>
      <tr>
        <th ${THL} rowspan="2" style="background-color:#1F3A5F;"></th>
        ${gUnitThs}
      </tr>
      <tr>${gColThs}</tr>\n`

      for (const row of rows) {
        const cells = responseTargets.map(t =>
          cols.map(col => {
            const val = mode === 'blank' ? '' : (gridRespMap[gKey(grid.id, t.id, row.key)]?.data?.[col.key] ?? '')
            return `<td ${td(rowIdx, 'text-align:center;')}>${esc(val)}</td>`
          }).join('')
        ).join('')
        checksBody += `<tr><td ${td(rowIdx)}>${esc(row.label)}</td>${cells}</tr>\n`
        rowIdx++
      }
    }
  }

  // Signoffs
  const signoffRows = signoffs.map((s, i) => {
    const nameCompany = mode === 'blank' ? '' : [s.signer_name, s.signer_company].filter(Boolean).join(' / ')
    const date = mode === 'blank' ? '' : isoShort(s.signed_at)
    return `<tr>
      <td ${td(i, 'font-weight:600;')}>${esc(s.role_label_snapshot)}</td>
      <td ${td(i)}>${esc(nameCompany)}</td>
      <td ${td(i)}></td>
      <td ${td(i, 'font-family:monospace;font-size:8pt;')}>${esc(date)}</td>
    </tr>`
  }).join('\n')

  const modeSubtitle = mode === 'blank' ? 'BLANK FORM — FOR CONTRACTOR USE' :
    `COMPLETED${instance.completed_at ? ' · ' + isoShort(instance.completed_at) : ''}`

  const clientName = project?.companies?.name ?? '—'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; }
  h1 { color: #1F3A5F; font-size: 18pt; font-weight: bold; text-align: center; margin: 0; }
  h2 { color: #1F3A5F; font-size: 10.5pt; font-weight: bold; margin: 14px 0 5px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  p { margin: 3px 0; }
</style>
</head>
<body>

<h1>${FIRM_NAME}</h1>
<p style="text-align:center;font-size:8pt;color:#555;margin:2px 0;">${FIRM_ADDR} &nbsp;&bull;&nbsp; ${FIRM_PHONE} &nbsp;&bull;&nbsp; ${FIRM_EMAIL}</p>

${mode === 'blank' ? `<p style="background-color:#FFF9C4;border:1px solid #F59E0B;padding:5px 10px;font-size:8pt;font-weight:bold;color:#92400E;margin:8px 0;">BLANK FORM — FOR CONTRACTOR USE — Complete on site and return to Isotherm Engineering Ltd.</p>` : ''}

<p style="font-size:12pt;font-weight:bold;color:#1F3A5F;margin-top:10px;">${esc(instance.source_template_name_snapshot)}</p>
<p style="font-size:8pt;color:#666;">${esc(instance.source_template_type_snapshot?.toUpperCase())} &nbsp;&bull;&nbsp; ${esc(modeSubtitle)}</p>

<table style="margin-top:10px;border:1px solid #C9D2DD;border-collapse:collapse;">
  <tr>
    <td style="padding:8px 12px;border:1px solid #C9D2DD;vertical-align:top;">
      <p><span style="color:#777;font-size:8pt;">Customer:</span> <strong>${esc(clientName)}</strong></p>
      <p><span style="color:#777;font-size:8pt;">Project:</span> <strong>${esc(project?.name ?? '—')}</strong></p>
      <p><span style="color:#777;font-size:8pt;">Address:</span> <strong>${esc(project?.address ?? '—')}</strong></p>
    </td>
    <td style="padding:8px 12px;border:1px solid #C9D2DD;vertical-align:top;">
      <p><span style="color:#777;font-size:8pt;">Project #:</span> <strong>${esc(project?.com_number ?? '—')}</strong></p>
      <p><span style="color:#777;font-size:8pt;">Date:</span> <strong>${esc(isoShort(instance.date_performed))}</strong></p>
      <p><span style="color:#777;font-size:8pt;">By:</span> <strong>${esc(instance.authored_by ?? '')}</strong></p>
    </td>
  </tr>
</table>

<h2>Equipment Nameplate Data</h2>
<table style="margin-bottom:4px;">
  <thead>
    <tr>
      <th ${THL}></th>
      ${responseTargets.map(t => `<th ${TH}>${unitTag(t)}</th>`).join('')}
    </tr>
  </thead>
  <tbody>${unitIdRows}</tbody>
</table>

<table>
  <thead>
    <tr>
      <th ${THL} rowspan="2" style="background-color:#1F3A5F;"></th>
      ${npUnitThs}
    </tr>
    <tr>${npSubThs}</tr>
  </thead>
  <tbody>${npBodyRows}</tbody>
</table>

${checksBody.trim() ? `
<h2>Installation Checks</h2>
<table>
  <thead>
    <tr>
      <th ${THL}>Item</th>
      ${unitThs}
      <th ${THL}>Comments</th>
    </tr>
  </thead>
  <tbody>${checksBody}</tbody>
</table>` : ''}

${signoffs.length > 0 ? `
<h2>Sign-offs</h2>
<table>
  <thead>
    <tr>
      <th ${THL}>Position / Title</th>
      <th ${THL}>Name / Company</th>
      <th ${THL}>Signature</th>
      <th ${THL}>Date</th>
    </tr>
  </thead>
  <tbody>${signoffRows}</tbody>
</table>` : ''}

</body>
</html>`
}

// ── PDF via Puppeteer + @sparticuz/chromium-min ────────────────────────────────
// Identical configuration to generate-report.ts — do not change margins/footer
// format without testing both generators.

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
// Strip width: from th/td styles — html-to-docx crashes on those.
// All other margins must be explicit integers — undefined margins become the
// string "undefined" in the DOCX XML, which Word rejects.

async function toDocx(html: string): Promise<Buffer> {
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

    // Fetch instance
    const { data: instance, error: instErr } = await supabase
      .from('checklist_instances').select('*').eq('id', instance_id).single()
    if (instErr || !instance)
      return res.status(404).json({ error: instErr?.message ?? 'instance not found' })

    // Fetch project (with client company name)
    const { data: project } = await supabase
      .from('projects').select('*, companies(id, name, abbreviation)')
      .eq('id', instance.project_id).single()

    // Fetch targets with FULL equipment data
    const { data: targetsData } = await supabase
      .from('checklist_instance_targets')
      .select('*, equipment(*)')
      .eq('instance_id', instance_id)
      .order('sort_order')

    const allTargets = (targetsData ?? []) as any[]
    const responseTargets = allTargets.filter((t: any) => t.role !== 'related')

    // Fetch sections (two-step to match ChecklistsPage.tsx pattern)
    const { data: sectionsData } = await supabase
      .from('checklist_instance_sections').select('*')
      .eq('instance_id', instance_id).order('sort_order')
    const sections = (sectionsData ?? []) as any[]

    let items:    any[] = []
    let grids:    any[] = []
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

    const [rRes, grRes, soRes] = await Promise.all([
      supabase.from('checklist_responses').select('*').eq('instance_id', instance_id),
      supabase.from('checklist_grid_responses').select('*').eq('instance_id', instance_id),
      supabase.from('checklist_instance_signoffs').select('*')
        .eq('instance_id', instance_id).order('created_at'),
    ])

    // Build response maps
    const responseMap: Record<string, any> = {}
    for (const r of (rRes.data ?? []) as any[]) responseMap[rKey(r.item_id, r.target_id)] = r

    const gridRespMap: Record<string, any> = {}
    for (const g of (grRes.data ?? []) as any[]) gridRespMap[gKey(g.grid_id, g.target_id, g.row_key)] = g

    const signoffs = (soRes.data ?? []) as any[]

    // Row counts sanity check (mirrors generate-report.ts pattern)
    const totalItems = items.length
    const totalGridRows = grids.reduce((sum: number, g: any) => sum + (g.definition.rows?.length ?? 0), 0)
    console.log(`[checklist] instance=${instance_id} mode=${mode} items=${totalItems} gridRows=${totalGridRows} targets=${responseTargets.length}`)

    const docData: DocData = {
      instance, project, responseTargets, sections, items, grids, signoffs,
      responseMap, gridRespMap, mode: mode as 'completed' | 'blank',
    }

    const pdfHtml  = buildChecklistHtml(docData)
    const docxHtml = buildChecklistDocxHtml(docData)

    // Run PDF + DOCX in parallel
    const [pdfBuffer, docxBuffer] = await Promise.all([
      toPdf(pdfHtml),
      toDocx(docxHtml),
    ])

    // Upload to Supabase Storage
    const store = supabase.storage.from('checklists')
    const base  = `${instance.project_id}/${instance_id}/${mode}`
    const [docxUp, pdfUp] = await Promise.all([
      store.upload(`${base}.docx`, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      }),
      store.upload(`${base}.pdf`, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      }),
    ])
    if (docxUp.error ?? pdfUp.error)
      return res.status(500).json({ error: (docxUp.error ?? pdfUp.error)?.message })

    const ts = Date.now()
    const { data: { publicUrl: rawDocxUrl } } = store.getPublicUrl(`${base}.docx`)
    const { data: { publicUrl: rawPdfUrl  } } = store.getPublicUrl(`${base}.pdf`)
    const pdf_url     = `${rawPdfUrl}?t=${ts}`
    const storage_url = `${rawDocxUrl}?t=${ts}`

    return res.status(200).json({ pdf_url, storage_url })

  } catch (err: any) {
    console.error('generate-checklist error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
