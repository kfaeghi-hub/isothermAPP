// PHASE 1 — map dumped CSP masters into the approved Phase 0 structure.
//
// Produces RATIFICATION ARTIFACTS. It writes JSON to out/, never to the
// database: ratification binds to an artifact, and a tool that can draft cannot
// apply. Seeding is a separate step against a stored artifact.
//
// ── THE CLASSIFICATION RULE, AND WHY IT DOES NOT READ THE BANNER ──────────────
// The CSP masters band their content by COMPONENT (COOLING COIL, FILTERS,
// MOTORIZED DAMPERS), not by phase. Worse, the few phase-named banners lie: the
// Air Dryer's "STARTUP CHECKS" table is entirely pre-start content — Mounting,
// Piping Connections, Filters Installed. Classifying on the banner would be the
// Law 8 error in a new costume: a tag string deciding a type.
//
// So the rule reads the ITEM. It is deliberately small and stated in one place
// so it can be argued with:
//   · an item asserting a STATIC fact about installation      -> A  Pre-Start
//   · an item asserting BEHAVIOUR under power                 -> C  Running
//   · an item naming a SAFETY DEVICE and its test             -> D  Safety
//   · anything else                                           -> A, FLAGGED
//
// A is the default and every default is flagged. That is a real trade and it is
// made in the open: a pre-start item mis-filed as a running check gets verified
// AFTER the appliance is live, which is the failure section A exists to prevent.
// A running check mis-filed into pre-start is a false blocker — annoying, and
// visible in the field the moment somebody reaches for HOLD. The smaller error
// is the visible one. But a default that is not flagged is a guess wearing a
// decision's clothes, so every one of them is counted and listed.
//
// Sections B (sequence) and E (readings) get NOTHING from this corpus, and D
// gets very little. That is not a bug in the mapper — it is the finding, and it
// is what Phase 2 fills.
//
// Run: node map-startup.mjs            (map everything dumped so far)
//      node map-startup.mjs --metrics  (metrics only, no artifacts written)

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const DUMPS = 'out/startup-mining/csp'
const OUT = 'out/startup-mining/artifacts'
const metricsOnly = process.argv.includes('--metrics')

if (!existsSync(DUMPS)) { console.error(`REFUSE: ${DUMPS} absent — run dump-csp.ps1 first`); process.exit(1) }
mkdirSync(OUT, { recursive: true })

// ── the rule ──────────────────────────────────────────────────────────────────
// BEHAVIOUR: something that can only be true while the machine is running.
const RUNNING = [
  /\b(verified\?|operation|operating|response|sequence[sd]?\b|functional|running|rotat\w+|amp\s*draw|reading|balanc\w+ report|setback|trend|alarm\w* (?:test|prove)|prove[sd]?\b)/i,
  /\b(stroking|stroke)\b/i,
]
// SAFETY DEVICE: a named protective device, which the approved structure tests
// rather than observes.
const SAFETY = [
  /\b(freeze\s*stat|firestat|smoke detector|high limit|low water cut|flame|pressure switch|relief valve|safety (?:valve|device|switch)|e-?stop|emergency (?:stop|shutoff)|overload|interlock)\b/i,
]
// STATIC: installed / complete / correct / present — the pre-start vocabulary.
const STATIC = [
  /\b(installed|install\w*|complete[d]?|correct|secure\w*|mounted|mounting|clean|clear|labell?ed|labels?|tags?|access|connections?|piping|insulation|guards?|gauges?|fittings?|bolted|pitched|combed|vacuumed|present|provided|in place|as specified|per (?:spec|manufact))/i,
]
const hit = (res, t) => res.some(re => re.test(t))

function classify(text) {
  if (hit(SAFETY, text))  return { section: 'D', flagged: false, why: 'names a protective device' }
  if (hit(RUNNING, text)) return { section: 'C', flagged: false, why: 'asserts behaviour under power' }
  if (hit(STATIC, text))  return { section: 'A', flagged: false, why: 'asserts a static installation fact' }
  return { section: 'A', flagged: true, why: 'DEFAULT — no rule matched; read before ratifying' }
}

const SECTIONS = {
  A: 'Pre-Start Verification',
  B: 'Energization & First-Start Sequence',
  C: 'Running Checks',
  D: 'Safety Device Verification',
  E: 'Readings to Record',
  F: 'Sign-Off',
}
// The standing line item, ruled: first in Pre-Start on EVERY type. It is what
// prevents per-manufacturer template forks, so it is added by the mapper rather
// than hoped for in a source.
const STANDING = "Manufacturer's IOM start-up steps reviewed, completed & attached"

// ── map one dump ──────────────────────────────────────────────────────────────
function mapForm(file) {
  const j = JSON.parse(readFileSync(`${DUMPS}/${file}`, 'utf8'))
  const src = j.source.split(/[\\/]/).slice(-2).join('/')
  const items = []
  let subject = null
  const skipped = { signature: 0, remarks: 0, headerTable: 0, unexplained: 0, unexplainedText: [] }

  for (const t of j.tables) {
    const head = t.rows[0]?.cells ?? []
    // Header table — carries the equipment SUBJECT and nothing else.
    //
    // MATCHED ON STRUCTURE, NOT ON THE TITLE. The first version keyed off
    // "CONTRACTORS START-UP PROGRAM" and missed three of ten masters, because
    // the corpus spells it "CONTRACTORS STARTUP", "CONTRACTORS START UP
    // PROGRAM", and — in one master — "CONTRACORS START UP PROGRAM". Widening
    // the pattern would have been chasing typos forever. A SUBJECT: row is what
    // actually makes this a header table; the banner is decoration. Law 8: a tag
    // string never decides a type.
    const subjectRow = t.rows.find(r => (r.cells[0] || '').trim().toUpperCase().replace(/:$/, '') === 'SUBJECT')
    if (subjectRow) {
      if (!subject) subject = (subjectRow.cells[1] || '').trim()
      continue
    }
    const banner = (head[0] || '').trim()
    const isSection = banner && head.slice(1).some(c => (c || '').trim().toUpperCase() === 'STATUS')
    if (!isSection) {
      // A skip count that does not say WHAT was skipped is noise, and noise is
      // where a real drop hides. Every skipped row is attributed; anything that
      // matches no known furniture shape is UNEXPLAINED and is the only number
      // here worth being alarmed by.
      for (const r of t.rows) {
        const v = (r.cells[0] || '').trim()
        if (v.length < 3) continue
        // SIX parties, not five — "Commissioning Representative" is the sixth,
        // and it was in the UNEXPLAINED list until it was read.
        if (/representative\s*$/i.test(v)) skipped.signature++
        else if (/^remarks?:?$/i.test(v)) skipped.remarks++
        else if (/^(subject|service|location|equipment no)\b/i.test(v)) skipped.headerTable++
        else { skipped.unexplained++; skipped.unexplainedText.push(`${src} t${t.t}r${r.r}: ${v}`) }
      }
      continue
    }
    for (const r of t.rows.slice(1)) {
      const label = (r.cells[0] || '').trim()
      if (label.length < 3) continue
      // Furniture is furniture wherever it sits. A "REMARKS:" row inside a
      // section table was arriving as a flagged line item — noise in the one
      // list a ratification sitting actually reads.
      if (/^remarks?:?$/i.test(label) || /representative\s*$/i.test(label)) { skipped.remarks++; continue }
      const c = classify(label)
      items.push({
        label,
        section: c.section,
        flagged: c.flagged,
        rule: c.why,
        source_banner: banner,
        // SOURCE NOTE, ruled: which master, which rows. A note that cannot name
        // its rows is not a source note.
        source: { master: src, table: t.t, row: r.r },
      })
    }
  }
  return { file, subject, src, items, skipped }
}

// ── the named Excel exception ────────────────────────────────────────────────
// Ruled 2026-08-05: Air_Handling_Unit.xlsx mines WITH the Word batch. It is the
// one Excel `Start-Up` sheet in 123 that holds real items (30 rows); sending
// usable source to the gap-fill phase for tidiness would be format prejudice.
// The rule is content, not file format.
//
// It contributes INTO the AHU artifact, and its overlap with the Word master is
// REPORTED, never silently deduped. A shortfall is visible; a duplicate looks
// like data.
function excelAhuItems() {
  const censusPath = 'out/startup-mining/pilot-census.json'
  if (!existsSync(censusPath)) return null
  const c = JSON.parse(readFileSync(censusPath, 'utf8'))
  const row = c.results.find(r => /^Air_Handling_Unit/i.test(r.file || ''))
  if (!row || !row.itemTexts?.length) return null
  return row.itemTexts.map((label, i) => {
    const k = classify(label)
    return {
      label, section: k.section, flagged: k.flagged, rule: k.why,
      source_banner: 'EXCEL Start-Up sheet',
      source: { master: `1.1 CSA Z320 - Mech - Excel/${row.file}`, sheet: 'Start-Up', item_index: i + 1 },
    }
  })
}

// ── run ───────────────────────────────────────────────────────────────────────
const files = readdirSync(DUMPS).filter(f => f.endsWith('.json')).sort()
if (!files.length) { console.error('REFUSE: no dumps to map'); process.exit(1) }

const forms = files.map(mapForm)

const xlAhu = excelAhuItems()
let xlOverlap = []
if (xlAhu) {
  const ahu = forms.find(f => /AIR HANDLING UNIT/i.test(f.subject || ''))
  if (!ahu) {
    console.log('NOTE: Excel AHU exception has no Word AHU form in this batch — carried as its own artifact.')
    forms.push({ file: 'EXCEL__Air_Handling_Unit.json', subject: 'AIR HANDLING UNIT (Excel)', src: xlAhu[0].source.master, items: xlAhu, skipped: { signature: 0, remarks: 0, headerTable: 0, unexplained: 0, unexplainedText: [] } })
  } else {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const seen = new Set(ahu.items.map(i => norm(i.label)))
    xlOverlap = xlAhu.filter(i => seen.has(norm(i.label))).map(i => i.label)
    ahu.items.push(...xlAhu)
    ahu.excelException = { count: xlAhu.length, overlap: xlOverlap.length }
  }
}
const rows = []
let totalItems = 0, totalFlagged = 0
const skipTotals = { signature: 0, remarks: 0, headerTable: 0, unexplained: 0 }
const unexplained = []
const bySection = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }

for (const f of forms) {
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
  for (const it of f.items) { counts[it.section]++; bySection[it.section]++ }
  const flagged = f.items.filter(i => i.flagged).length
  totalItems += f.items.length; totalFlagged += flagged
  for (const k of ['signature', 'remarks', 'headerTable', 'unexplained']) skipTotals[k] += f.skipped[k]
  unexplained.push(...f.skipped.unexplainedText)
  rows.push({ name: f.subject || f.file.replace('.json', ''), n: f.items.length, ...counts, flagged, skipped: f.skipped.unexplained })

  if (!metricsOnly) {
    const artifact = {
      _kind: 'startup-extraction',
      _phase: 'Phase 1 — content mining',
      _ratified: false,
      _note: 'DRAFT. Nothing seeds unratified. Section B and E are expected to be empty from this corpus; Phase 2 fills them.',
      subject: f.subject,
      source_master: f.src,
      type: 'startup',
      status_type: 'yn_nr_na_hold',
      sections: Object.entries(SECTIONS).map(([k, title]) => ({
        key: k,
        title,
        items: k === 'A'
          ? [{ label: STANDING, source: { standing_item: true, ruled: '2026-08-05' } },
             ...f.items.filter(i => i.section === k)]
          : f.items.filter(i => i.section === k),
      })),
      flagged_count: flagged,
      skipped_rows: f.skipped,
    }
    writeFileSync(`${OUT}/${f.file}`, JSON.stringify(artifact, null, 2))
  }
}

console.log(`BATCH 1 — ${forms.length} CSP masters\n`)
console.log('equipment'.padEnd(34) + 'items    A    B    C    D    E  flagged  unexpl')
for (const r of rows) {
  console.log(r.name.slice(0, 33).padEnd(34) +
    String(r.n).padStart(5) + String(r.A).padStart(5) + String(r.B).padStart(5) +
    String(r.C).padStart(5) + String(r.D).padStart(5) + String(r.E).padStart(5) +
    String(r.flagged).padStart(9) + String(r.skipped).padStart(9))
}
console.log('\n── PILOT METRICS, BATCH 1 ──')
console.log(`forms mapped        : ${forms.length}`)
console.log(`line items harvested: ${totalItems}  (median ${median(rows.map(r => r.n))}/form)`)
console.log(`by section          : A ${bySection.A} · B ${bySection.B} · C ${bySection.C} · D ${bySection.D} · E ${bySection.E}`)
console.log(`flagged defaults    : ${totalFlagged} (${pct(totalFlagged, totalItems)}) — no rule matched; must be read before ratifying`)
if (xlAhu) {
  console.log(`excel exception     : Air_Handling_Unit.xlsx — ${xlAhu.length} items merged into AIR HANDLING UNIT`)
  console.log(`  label overlap with the Word master: ${xlOverlap.length}` +
    (xlOverlap.length ? ` — REPORTED, NOT DEDUPED: ${xlOverlap.slice(0, 5).join(' | ')}` : ' (none)'))
}
console.log(`rows skipped, attributed:`)
console.log(`  six-party signature block  : ${skipTotals.signature}  — the source's own sign-off, DELIBERATELY REPLACED`)
console.log(`  REMARKS: headers           : ${skipTotals.remarks}`)
console.log(`  header-table furniture     : ${skipTotals.headerTable}`)
console.log(`  UNEXPLAINED                : ${skipTotals.unexplained}${skipTotals.unexplained ? '  <-- the only alarming number here' : '  (nothing dropped that is not accounted for)'}`)
for (const u of unexplained.slice(0, 12)) console.log(`      ${u}`)
if (unexplained.length > 12) console.log(`      … and ${unexplained.length - 12} more`)
console.log(`
The CSP masters carry a SIX-party signature block — Owner, Architect, Mechanical`)
console.log(`Consultant, GC, Mechanical Contractor, Commissioning. The approved Phase 0`)
console.log(`design replaces it with TWO parties making two different claims. That is a`)
console.log(`deliberate departure, ruled 2026-08-05, not a dropped row.`)
console.log(`\nB and E are EMPTY and D is thin. That is the finding, not a defect:`)
console.log(`the CSP corpus is installation-completeness knowledge. The energization`)
console.log(`SEQUENCE, the readings table, and most safety-device TESTS are what`)
console.log(`Phase 2 anchors to CSA B149 / NFPA / NETA / the manufacturer's IOM.`)
console.log(metricsOnly ? '\nMETRICS ONLY — no artifacts written.' : `\nartifacts → ${OUT}/  (_ratified: false — nothing seeds unratified)`)

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }
function pct(a, b) { return b ? `${(a / b * 100).toFixed(0)}%` : '—' }
