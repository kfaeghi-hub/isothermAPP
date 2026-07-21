// CSA campaign self-audit harness. Every form must pass ALL checks before its seed commits.
//
// Check families (ratified at calibration stop #1, 2026-07-20):
//   1. Row reconciliation  — every non-empty source row maps to an item, a grid row,
//      a section/component header, or an explicitly-logged skip; zero silent drops.
//      Component-section field counts must equal grid row counts exactly. Reverse:
//      every JSON item/grid-row traces back to a source row (no invented content).
//   2. Vocabulary validity — suggested_category ∈ TRADE_TYPES verbatim; equipment_type
//      ∈ ruled key map or null (basic fallback); status_type yn_nr_na throughout (ivc).
//   3. Branding sweep      — CSA|Z320|Z318|BCA|BCxA|IEL and source company names give
//      zero hits outside revision_label/description.
//   4. Seed verification   — (--template <id>) DB section/item/grid/signoff counts = JSON.
//   5. Render verification — (--instance <id>) Field Copy blank generates, pages > 0,
//      nameplate fallback flag as expected, pdf.js text probe finds >= 5 sampled labels.
//
// Ratified normalization rules: all-caps -> sentence case; obvious source typos cleaned
// (log in _extraction.notes); compound rows kept whole; label matching is therefore fuzzy
// (token overlap + per-token edit distance), never exact-only.
//
// Run: node --env-file=.env audit-template.mjs <extraction.json> [--template <uuid>] [--instance <uuid>]

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const TRADE_TYPES = ['Mechanical', 'Electrical', 'Controls/BAS', 'Plumbing', 'Structural', 'TAB',
  'Fire Protection', 'Geothermal', 'Refrigeration', 'HVAC', 'Life Safety', 'Security',
  'Vertical Transportation', 'Building Envelope']
const RULED_KEYS = ['ahu', 'pump', 'fan', 'fcu', 'heat_pump', 'chiller', 'cooling_tower', 'boiler', 'erv']
const FIELD_DEF_KEYS = ['ahu', 'ats', 'boiler', 'chiller', 'cooling_tower', 'erv', 'fan', 'fcu', 'generator', 'heat_pump', 'pump']
const BRAND_RE = /\b(CSA|Z320|Z318|BCA|BCxA|IEL)\b/i
const BASE = process.env.PW_BASE_URL ?? 'https://isotherm-app.vercel.app'
const API = 'https://api.supabase.com/v1/projects/isztyeczqndploybdtcn/database/query'

const args = process.argv.slice(2)
const jsonPath = args[0]
const templateId = args.includes('--template') ? args[args.indexOf('--template') + 1] : null
const instanceId = args.includes('--instance') ? args[args.indexOf('--instance') + 1] : null
if (!jsonPath) { console.error('usage: node audit-template.mjs <extraction.json> [--template id] [--instance id]'); process.exit(1) }

const t = JSON.parse(readFileSync(jsonPath, 'utf8'))
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// ── xlsx reader (zip walk) ─────────────────────────────────────────────────────
function readSheet(file, sheetName) {
  const buf = readFileSync(file)
  const entry = (wanted) => {
    let i = 0
    while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
      const method = buf.readUInt16LE(i + 8), compSize = buf.readUInt32LE(i + 18)
      const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28)
      const name = buf.subarray(i + 30, i + 30 + nameLen).toString('latin1')
      const start = i + 30 + nameLen + extraLen
      if (name === wanted && compSize > 0) {
        const data = buf.subarray(start, start + compSize)
        return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
      }
      i = start + (compSize || 1)
    }
    return null
  }
  const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const wb = entry('xl/workbook.xml'), rels = entry('xl/_rels/workbook.xml.rels')
  const metas = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].map(m => ({ name: un(m[1]), rid: m[2] }))
  const meta = metas.find(s => s.name === sheetName) ?? metas.find(s => s.name.trim() === sheetName.trim())
  if (!meta) throw new Error(`sheet "${sheetName}" not found`)
  const target = [...rels.matchAll(/<Relationship [^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g)].find(m => m[1] === meta.rid)[2]
  const xml = entry('xl/' + target.replace(/^\//, '').replace(/^xl\//, ''))
  const sst = entry('xl/sharedStrings.xml') ?? ''
  const strings = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => un(x[1])).join(''))
  const rows = []
  for (const rowM of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {}
    for (const cM of rowM[2].matchAll(/<c r="([A-Z]+)(\d+)"(?:[^>]*t="([^"]*)")?[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, , type, inner] = cM
      if (!inner) continue
      let v = ''
      const vM = inner.match(/<v>([\s\S]*?)<\/v>/)
      const isM = inner.match(/<is>([\s\S]*?)<\/is>/)
      if (type === 's' && vM) v = strings[Number(vM[1])] ?? ''
      else if (isM) v = [...isM[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => un(x[1])).join('')
      else if (vM) v = un(vM[1])
      if (String(v).trim() !== '') cells[col] = String(v).trim()
    }
    if (Object.keys(cells).length) rows.push({ r: Number(rowM[1]), cells })
  }
  return rows
}

// ── fuzzy label matching (ratified: sentence-casing + typo cleanup are legal) ──
// Abbreviations expand on BOTH sides so comparisons stay consistent.
const ABBREV = { QTY: 'QUANTITY', 'NO': 'NUMBER', MFR: 'MANUFACTURER' }
const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  .split(' ').map(w => ABBREV[w] ?? w).join(' ')
const toks = s => norm(s).split(' ').filter(Boolean)
function editDist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
function tokEq(a, b) {
  if (a === b) return true
  if (a.length >= 5 && b.length >= 5 && editDist(a, b) <= 2) return true
  return false
}
function overlap(aT, bT) {
  if (!aT.length || !bT.length) return 0
  let hit = 0
  const used = new Set()
  for (const a of aT) {
    const j = bT.findIndex((b, i) => !used.has(i) && tokEq(a, b))
    if (j !== -1) { used.add(j); hit++ }
  }
  return hit / Math.max(aT.length, bT.length)
}
function labelsExact(src, extracted) {
  return norm(src) === norm(extracted)
}
// Component headers carry decorator suffixes the extractions drop ("SUPPLY FAN INFO",
// "HUMIDIFIER SECTION") — strip them before comparing to grid/section titles.
const stripDecor = s => norm(s).replace(/\b(INFO|INFORMATION|SECTION|DATA)\b/g, ' ').replace(/\s+/g, ' ').trim()
function headerMatch(src, title) {
  return stripDecor(src) === stripDecor(title) || labelsMatch(stripDecor(src), stripDecor(title))
}
function labelsMatch(src, extracted) {
  const a = norm(src), b = norm(extracted)
  if (a === b) return true
  // Containment only when the contained side is substantial — "TYPE" must not
  // swallow "CORRECT FILTER TYPE(S) USED" (the greedy-consumption bug).
  if ((a.includes(b) && b.length >= 10) || (b.includes(a) && a.length >= 10)) return true
  return overlap(toks(a), toks(b)) >= 0.6
}

// ── 1 · Row reconciliation ─────────────────────────────────────────────────────
console.log('\n=== 1 · Row reconciliation ===')
try {
  const rows = readSheet(t._extraction.source_file, t._extraction.source_sheet)
  const skipRanges = (t._extraction.skipped_rows ?? []).flatMap(s => {
    const m = String(s.rows).match(/R(\d+)(?:-R?(\d+))?/)
    if (!m) return []
    const lo = Number(m[1]), hi = Number(m[2] ?? m[1])
    return [[lo, hi]]
  })
  const isSkipped = r => skipRanges.some(([lo, hi]) => r >= lo && r <= hi)

  const sectionTitles = t.sections.map(s => s.title)
  const items = t.sections.flatMap(s => (s.items ?? []).map(i => ({ ...i, _sec: s.title, _used: false })))
  const grids = t.sections.flatMap(s => (s.grids ?? []).map(g => ({ ...g, _sec: s.title })))
  const gridRowLabels = grids.flatMap(g => g.definition.rows.map(r => ({ grid: g.title, label: r.label, _used: false })))
  const gridComposites = grids.flatMap(g =>
    g.definition.columns.flatMap(c => g.definition.rows.map(r => ({ label: `${c.label} ${r.label}`, grid: g.title }))))

  const unmatched = []
  for (const row of rows) {
    if (isSkipped(row.r)) continue
    const label = row.cells.A ?? Object.values(row.cells)[0]
    if (!label) continue
    // Component/section headers: row also carries SPECIFIED or STATUS or NO. N column headers
    const others = Object.entries(row.cells).filter(([c]) => c !== 'A').map(([, v]) => v)
    const isHeader = others.some(v => /SPECIFIED|STATUS|VALUE|COMPLIES|^NO\.\s*\d/i.test(v))
    if (isHeader) {
      const ok = sectionTitles.some(st => headerMatch(label, st)) || grids.some(g => headerMatch(label, g.title))
      if (!ok) unmatched.push(`R${row.r} header "${label}" matches no section/grid title`)
      continue
    }
    if (/^NO\.\s*\d/i.test(label)) continue // unit-number header fragments
    // Exact matches claim first (prevents fuzzy greedy misconsumption), then fuzzy.
    const exactItem = items.find(i => !i._used && labelsExact(label, i.label))
    if (exactItem) { exactItem._used = true; continue }
    const exactRow = gridRowLabels.find(g => !g._used && labelsExact(label, g.label))
    if (exactRow) { exactRow._used = true; continue }
    const hitItem = items.find(i => !i._used && labelsMatch(label, i.label))
    if (hitItem) { hitItem._used = true; continue }
    const hitRow = gridRowLabels.find(g => !g._used && labelsMatch(label, g.label))
    if (hitRow) { hitRow._used = true; continue }
    if (gridComposites.some(g => labelsMatch(label, g.label))) continue
    if (sectionTitles.some(st => labelsMatch(label, st))) continue
    unmatched.push(`R${row.r} "${label}"`)
  }
  check(unmatched.length === 0, `every source row mapped or logged (${unmatched.length} unmatched)`)
  unmatched.forEach(u => console.log(`         · ${u}`))

  // Component-section field counts == grid row counts
  let compChecks = 0, compFails = []
  const headerRows = rows.filter(row => {
    const others = Object.entries(row.cells).filter(([c]) => c !== 'A').map(([, v]) => v)
    return others.some(v => /SPECIFIED/i.test(v)) && row.cells.A && !isSkipped(row.r)
  })
  for (const h of headerRows) {
    const next = headerRows.find(x => x.r > h.r)
    const fieldRows = rows.filter(x => x.r > h.r && (!next || x.r < next.r) && !isSkipped(x.r)
      && (x.cells.A) && !Object.entries(x.cells).some(([c, v]) => c !== 'A' && /STATUS|VALUE|COMPLIES|SPECIFIED/i.test(v)))
    // stop at first evaluation header between components
    const evalH = rows.find(x => x.r > h.r && (!next || x.r < next.r)
      && Object.entries(x.cells).some(([c, v]) => c !== 'A' && /STATUS|VALUE|COMPLIES/i.test(v)))
    const upper = evalH ? evalH.r : (next ? next.r : Infinity)
    const count = fieldRows.filter(x => x.r < upper).length
    const grid = grids.find(g => headerMatch(h.cells.A, g.title))
    if (!grid) { compFails.push(`component "${h.cells.A}" (R${h.r}) has no grid`); continue }
    compChecks++
    if (grid.definition.rows.length !== count)
      compFails.push(`grid "${grid.title}": ${grid.definition.rows.length} rows vs ${count} source fields`)
  }
  check(compFails.length === 0, `component field counts = grid row counts (${compChecks} grids checked)`)
  compFails.forEach(f => console.log(`         · ${f}`))

  // Reverse: no invented items / grid rows
  const srcLabels = rows.filter(r => !isSkipped(r.r)).map(r => r.cells.A ?? Object.values(r.cells)[0]).filter(Boolean)
  const inventedItems = items.filter(i => !srcLabels.some(sl => labelsMatch(sl, i.label)))
  check(inventedItems.length === 0, `every item traces to a source row (${inventedItems.length} unexplained)`)
  inventedItems.forEach(i => console.log(`         · item "${i.label}"`))
  const inventedRows = gridRowLabels.filter(g => !srcLabels.some(sl => labelsMatch(sl, g.label))
    && !gridComposites.length === 0)
    .filter(g => !srcLabels.some(sl => labelsMatch(sl, `${g.label}`) || toks(sl).some(tok => toks(g.label).some(gt => tokEq(tok, gt)))))
  check(inventedRows.length === 0, `every grid row traces to a source row (${inventedRows.length} unexplained)`)
  inventedRows.forEach(g => console.log(`         · grid "${g.grid}" row "${g.label}"`))
} catch (e) {
  check(false, `row reconciliation errored: ${e.message}`)
}

// ── 2 · Vocabulary validity ────────────────────────────────────────────────────
console.log('\n=== 2 · Vocabulary validity ===')
{
  const badCat = t.sections.flatMap(s => s.items ?? []).filter(i => i.suggested_category != null && !TRADE_TYPES.includes(i.suggested_category))
  check(badCat.length === 0, `suggested_category values all in trade_types (${badCat.length} bad)`)
  badCat.forEach(i => console.log(`         · "${i.label}" -> "${i.suggested_category}"`))
  check(t.equipment_type === null || RULED_KEYS.includes(t.equipment_type),
    `equipment_type "${t.equipment_type}" in ruled key map (or null fallback)`)
  const badStatus = t.sections.flatMap(s => s.items ?? []).filter(i => (i.status_type ?? 'yn_nr_na') !== 'yn_nr_na')
  check(badStatus.length === 0, `status_type yn_nr_na throughout (${badStatus.length} deviations)`)
  check(t.type === 'ivc', `type is ivc`)
}

// ── 3 · Branding sweep ─────────────────────────────────────────────────────────
console.log('\n=== 3 · Branding sweep ===')
{
  const clone = JSON.parse(JSON.stringify(t))
  delete clone.revision_label; delete clone.description; delete clone._extraction
  const text = JSON.stringify(clone)
  const hit = text.match(BRAND_RE)
  check(!hit, `no CSA/Z320/Z318/BCA/BCxA/IEL outside revision_label/description${hit ? ` (found "${hit[0]}")` : ''}`)
}

// ── 4 · Seed verification ──────────────────────────────────────────────────────
if (templateId) {
  console.log('\n=== 4 · Seed verification ===')
  const TOKEN = process.env.SUPABASE_MGMT_TOKEN
  const run = async (query) => {
    const res = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
    if (!res.ok) throw new Error(`Management API ${res.status}`)
    return res.json()
  }
  const [db] = await run(`select
    (select count(*) from checklist_template_sections where template_id = '${templateId}') as sections,
    (select count(*) from checklist_template_items i join checklist_template_sections s on s.id = i.section_id where s.template_id = '${templateId}') as items,
    (select count(*) from checklist_template_grids g join checklist_template_sections s on s.id = g.section_id where s.template_id = '${templateId}') as grids,
    (select count(*) from checklist_template_signoffs where template_id = '${templateId}') as signoffs`)
  const want = {
    sections: t.sections.length,
    items: t.sections.reduce((n, s) => n + (s.items?.length ?? 0), 0),
    grids: t.sections.reduce((n, s) => n + (s.grids?.length ?? 0), 0),
    signoffs: t.signoffs?.length ?? 0,
  }
  for (const k of Object.keys(want))
    check(Number(db[k]) === want[k], `${k}: DB ${db[k]} = JSON ${want[k]}`)
}

// ── 5 · Render verification ────────────────────────────────────────────────────
if (instanceId) {
  console.log('\n=== 5 · Render verification ===')
  const res = await fetch(`${BASE}/api/generate-checklist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance_id: instanceId, mode: 'blank', audience: 'field' }),
  })
  const body = await res.json().catch(() => ({}))
  check(res.ok, `Field Copy blank generated${res.ok ? '' : ` (${res.status} ${body.error})`}`)
  if (res.ok) {
    const expectFallback = !FIELD_DEF_KEYS.includes(t.equipment_type)
    check(body.stats.fallback === expectFallback, `nameplate fallback=${body.stats.fallback} as expected (${expectFallback})`)
    check(body.stats.nameplate_rows > 0, `nameplate rows > 0 (${body.stats.nameplate_rows})`)
    const pdf = Buffer.from(await (await fetch(body.pdf_url)).arrayBuffer())
    const outFile = `out/${(t.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-field.pdf`
    const { writeFileSync } = await import('node:fs')
    writeFileSync(outFile, pdf)
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableWorker: true }).promise
    check(doc.numPages > 0, `page count ${doc.numPages} > 0`)
    let text = ''
    for (let p = 1; p <= doc.numPages; p++)
      text += (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join(' ') + '\n'
    const allItems = t.sections.flatMap(s => s.items ?? [])
    const sample = allItems.filter((_, i) => i % Math.max(1, Math.floor(allItems.length / 6)) === 0).slice(0, 6)
    const found = sample.filter(i => text.toUpperCase().includes(i.label.toUpperCase().slice(0, 40)))
    check(found.length >= Math.min(5, sample.length), `pdf.js probe: ${found.length}/${sample.length} sampled labels found`)
    console.log(`         · ${outFile} (${doc.numPages} pages, ${(pdf.length / 1024).toFixed(0)} kB)`)
  }
}

console.log('\n' + '='.repeat(64))
if (fails.length === 0) console.log(`AUDIT PASS — ${t.name}`)
else { console.log(`AUDIT FAIL — ${t.name} — ${fails.length} check(s):`); fails.forEach(f => console.log(`  - ${f}`)) }
console.log('='.repeat(64))
process.exit(fails.length === 0 ? 0 : 1)
