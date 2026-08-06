// PHASE 1 — Start-Up content mining. PILOT MODE by default.
//
// Content mining, NOT format conversion. The banked sheets supply WHAT to check;
// the Phase 0 template (approved 2026-08-05) supplies how it is presented. A
// sheet that is thin or absent flows to Phase 2 rather than being padded — so
// this harness's first job is to COUNT honestly, not to produce output.
//
// Source: the "Start-Up" sheet inside each CSA Z320/Z318 Excel workbook. These
// are SEPARATE sheets, not start-up content embedded on a Static Verification
// sheet, so EXTRACTION-PLAYBOOK R10/R11 does not route them to `ivc`.
//
// Reads xlsx with the campaign's own dependency-free reader (audit-template.mjs's
// zip + sharedStrings walk), so the pilot measures the same bytes the IVC
// campaign measured rather than a second library's opinion of them.
//
// SHARESYNC IS NEVER TOUCHED — it reads only working copies already in
// gitignored samples/.
//
// Run: node mine-startup.mjs --pilot          (10 workbooks + metrics)
//      node mine-startup.mjs --all            (census over the whole corpus)
//      node mine-startup.mjs --dump <file>    (print one sheet, to look at it)

import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { join } from 'node:path'

// All three Excel roots. The first pilot run named only two and reported a
// corpus of 53 against a manifest of 122 — a projection over the wrong
// denominator is worse than no projection, because it looks like a measurement.
const ROOTS = [
  'samples/forms/csa-ivc/1.1 CSA Z320 - Mech - Excel',
  'samples/forms/csa-ivc/1.2 CSA Z320 - Elec - Excel',
  'samples/forms/csa-ivc/1.3 CSA Z320 - Arch - Excel',
]
const SHEET = 'Start-Up'
const OUT = 'out/startup-mining'

// ── xlsx reader — lifted verbatim from audit-template.mjs ─────────────────────
function readSheet(path, sheetName) {
  const buf = readFileSync(path)
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
  if (!wb || !rels) return { error: 'not a readable xlsx' }
  const metas = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].map(m => ({ name: un(m[1]), rid: m[2] }))
  const meta = metas.find(s => s.name === sheetName)
           ?? metas.find(s => s.name.trim().toLowerCase() === sheetName.trim().toLowerCase())
           ?? metas.find(s => /start.?up/i.test(s.name))
  if (!meta) return { error: `no "${sheetName}" sheet`, sheets: metas.map(m => m.name) }
  const target = [...rels.matchAll(/<Relationship [^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g)].find(m => m[1] === meta.rid)?.[2]
  if (!target) return { error: 'sheet rel missing' }
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
    if (Object.keys(cells).length) rows.push({ r: Number(rowM[1]), cells, name: meta.name })
  }
  return { rows, sheetName: meta.name }
}

// ── corpus ────────────────────────────────────────────────────────────────────
function corpus() {
  const files = []
  for (const root of ROOTS) {
    let names = []
    try { names = readdirSync(root) } catch { continue }
    for (const n of names) {
      if (!/\.xlsx?$/i.test(n)) continue
      const p = join(root, n)
      if (!statSync(p).isFile()) continue
      files.push(p)
    }
  }
  return files.sort()
}

// ── classification of a row, before any mapping ───────────────────────────────
// Deliberately CONSERVATIVE. Everything that is not confidently furniture counts
// as content, so the census cannot flatter itself by discarding rows it did not
// understand. Over-counting content is the safe direction here: it makes a thin
// sheet look thicker, and a sheet that still reads thin under a generous rule is
// unambiguously thin.
const FURNITURE = [
  /^(project|building|location|date|equipment|unit|tag|contractor|technician|witness|signature|company|sheet|page|rev(ision)?)\b.{0,40}:?$/i,
  /^(yes|no|n\/?a|nr|pass|fail|y|n)$/i,
  /^(comments?|remarks?|notes?|initials?|checked by|verified by)\.?:?$/i,
  /csa|z320|z318|bcxa|bca\b/i,
]
const isFurniture = t => FURNITURE.some(re => re.test(t.trim()))
const looksHeader = t => /^[A-Z0-9 ,.\-/&()]+$/.test(t.trim()) && t.trim().length > 3 && !/[a-z]/.test(t)

function census(rows) {
  const texts = []
  for (const row of rows) {
    // The longest cell in a row is the line item; the rest are response columns.
    const vals = Object.values(row.cells)
    const longest = vals.reduce((a, b) => (b.length > a.length ? b : a), '')
    if (longest.length >= 3) texts.push(longest)
  }
  const furniture = texts.filter(isFurniture)
  const headers = texts.filter(t => !isFurniture(t) && looksHeader(t))
  const items = texts.filter(t => !isFurniture(t) && !looksHeader(t))
  return { rows: rows.length, textRows: texts.length, furniture: furniture.length,
           headers: headers.length, items: items.length, itemTexts: items }
}

// ── run ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const mode = args.includes('--all') ? 'all' : args.includes('--dump') ? 'dump' : 'pilot'
mkdirSync(OUT, { recursive: true })

if (mode === 'dump') {
  const f = args[args.indexOf('--dump') + 1]
  const res = readSheet(f, SHEET)
  if (res.error) { console.error(`${f}: ${res.error}`, res.sheets ?? ''); process.exit(1) }
  console.log(`${f} — sheet "${res.sheetName}", ${res.rows.length} non-empty rows\n`)
  for (const r of res.rows) console.log(String(r.r).padStart(4), JSON.stringify(r.cells))
  process.exit(0)
}

const files = corpus()
if (!files.length) { console.error('REFUSE: no workbooks found — corpus absent, nothing measured'); process.exit(1) }

// THIN is a Phase 2 referral, not a failure. The threshold is stated here so the
// number is arguable rather than buried: fewer than 8 real line items cannot
// carry the approved six-section structure without invention.
const THIN = 8

const batch = mode === 'all' ? files : files.slice(0, 10)
console.log(`corpus: ${files.length} workbooks · this run: ${batch.length} (${mode})\n`)

const results = []
for (const f of batch) {
  const res = readSheet(f, SHEET)
  const name = f.split(/[\\/]/).pop()
  if (res.error) { results.push({ file: name, error: res.error }); continue }
  results.push({ file: name, sheet: res.sheetName, ...census(res.rows) })
}

const ok = results.filter(r => !r.error)
const missing = results.filter(r => r.error)
const thin = ok.filter(r => r.items < THIN)
const usable = ok.filter(r => r.items >= THIN)

console.log('file'.padEnd(44) + 'rows  text  furn  hdr  ITEMS')
for (const r of results) {
  if (r.error) { console.log(`${r.file.slice(0, 43).padEnd(44)}— ${r.error}`); continue }
  const flag = r.items < THIN ? '  ← THIN, to Phase 2' : ''
  console.log(r.file.slice(0, 43).padEnd(44) +
    String(r.rows).padStart(4) + String(r.textRows).padStart(6) +
    String(r.furniture).padStart(6) + String(r.headers).padStart(5) +
    String(r.items).padStart(7) + flag)
}

const totalItems = ok.reduce((a, r) => a + r.items, 0)
console.log(`\n── PILOT METRICS ──`)
console.log(`workbooks read      : ${ok.length}/${batch.length}`)
console.log(`no Start-Up sheet   : ${missing.length}${missing.length ? ' — ' + missing.map(m => m.file).join(', ') : ''}`)
console.log(`usable (>= ${THIN} items): ${usable.length}`)
console.log(`thin (< ${THIN} items)   : ${thin.length}${thin.length ? ' — TO PHASE 2: ' + thin.map(t => `${t.file}(${t.items})`).join(', ') : ''}`)
console.log(`line items harvested: ${totalItems}  (median ${median(ok.map(r => r.items))}/sheet)`)
console.log(`\nPROJECTION over ${files.length} workbooks at this rate: ~${Math.round(totalItems / (ok.length || 1) * files.length)} line items,`)
console.log(`~${Math.round(thin.length / (ok.length || 1) * files.length)} sheets to Phase 2.`)
console.log(`\nNOTHING SEEDED. This run measures; it does not write templates.`)

writeFileSync(`${OUT}/pilot-census.json`, JSON.stringify({ mode, corpus: files.length, THIN, results }, null, 2))
console.log(`census → ${OUT}/pilot-census.json`)

function median(xs) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
}
