// Apply the delegated section-placement rulings to the stored artifacts.
//
// DELEGATED 2026-08-05: placement ruled by the machine on domain knowledge;
// residue and final approval by the owner. This is the APPLY half — it writes
// rulings into artifacts and writes one summary for approval. It does not draft
// and it does not seed: ratification binds to an artifact, a draft tool cannot
// write, and an apply tool cannot draft.
//
// COVERAGE IS ASSERTED, NOT ASSUMED. Every flagged label must be ruled. An
// unruled label is not silently left at its default — the run REFUSES and names
// it, because a placement pass that quietly skips items reports the same
// "done" whether it ruled 289 labels or 3.
//
// Run: node apply-placement-rulings.mjs [--dry]

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { RULINGS, LOW, NOTE_PLACEMENT } from './startup-placement-rulings.mjs'

const DIR = 'out/startup-mining/artifacts'
const OUT = 'out/startup-mining'
const dry = process.argv.includes('--dry')
if (!existsSync(DIR)) { console.error(`REFUSE: ${DIR} absent`); process.exit(1) }
mkdirSync(OUT, { recursive: true })

const key = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const SECTION_TITLES = {
  A: 'Pre-Start Verification', B: 'Energization & First-Start Sequence',
  C: 'Running Checks', D: 'Safety Device Verification',
  E: 'Readings to Record', F: 'Sign-Off',
}

const files = readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
if (!files.length) { console.error('REFUSE: no artifacts'); process.exit(1) }

// NOT IDEMPOTENT — AND IT SAYS SO RATHER THAN PRETENDING.
// This pass clears the `flagged` bit on everything it rules, so a second run
// sees only the low-confidence residue and writes a summary reading "67 ruled,
// 0 cut" for work that ruled 678 and cut 13. The artifact the owner approves
// must describe the whole ruling, not the delta of a re-run. Re-map first.
const already = files.filter(f => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))._placement)
if (already.length && !dry) {
  console.error(`REFUSE: ${already.length} artifact(s) already carry placement rulings.`)
  console.error('Re-running would summarise the delta, not the ruling. Regenerate first:')
  console.error('  node map-startup.mjs && node apply-placement-rulings.mjs')
  process.exit(1)
}

// ── RECONCILE THE RESIDUE ────────────────────────────────────────────────────
// LOW is the single source of truth for what the owner rules by hand. A first
// run reported "low confidence: 0" while LOW listed 35 items, because the
// confidence lived in RULINGS and nothing joined the two. A residue list that
// does not reach the summary is a residue list nobody sees.
for (const k of Object.keys(LOW)) {
  if (!RULINGS[k]) {
    console.error(`REFUSE: LOW names ${JSON.stringify(k)} but RULINGS has no entry for it.`)
    process.exit(1)
  }
  RULINGS[k][1] = 'low'
}
// Unused rulings are dead weight and usually a typo in a key that silently did
// nothing. Report them; they are not fatal, but they are never intentional.
const usedKeys = new Set()

// ── PASS 1: coverage. Refuse before writing anything. ────────────────────────
const unruled = new Map()
for (const f of files) {
  const a = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  for (const s of a.sections) for (const i of s.items) {
    if (!i.flagged || i.source?.standing_item) continue
    const k = key(i.label)
    if (!RULINGS[k]) unruled.set(k, i.label); else usedKeys.add(k)
  }
}
if (unruled.size) {
  console.error(`REFUSE: ${unruled.size} flagged label(s) have no ruling. A placement pass that`)
  console.error('skips items reports the same "done" whether it ruled everything or nothing.\n')
  for (const [k, label] of [...unruled].slice(0, 25)) console.error(`  ${JSON.stringify(k)}  — ${label}`)
  if (unruled.size > 25) console.error(`  … and ${unruled.size - 25} more`)
  process.exit(1)
}

const unusedKeys = Object.keys(RULINGS).filter(k => !usedKeys.has(k))
if (unusedKeys.length) {
  console.log(`NOTE: ${unusedKeys.length} ruling(s) matched nothing — probably a mistyped key:`)
  for (const k of unusedKeys) console.log(`  ${JSON.stringify(k)}`)
  console.log()
}

// ── PASS 2: apply ────────────────────────────────────────────────────────────
const perForm = []
const lowItems = []
const cutItems = []
const noteItems = []
let moved = 0, kept = 0, cutCount = 0, totalRuled = 0

for (const f of files) {
  const a = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  const pool = []
  for (const s of a.sections) for (const i of s.items) pool.push({ item: i, from: s.key })

  const cutHere = []
  for (const { item, from } of pool) {
    if (!item.flagged || item.source?.standing_item) continue
    const k = key(item.label)
    const [section, confidence, reason] = RULINGS[k]
    totalRuled++
    item.ruling = { section, confidence, reason, by: 'machine', delegated: '2026-08-05' }
    if (section === 'cut') {
      cutHere.push(item); cutCount++
      cutItems.push({ form: a.subject, label: item.label, reason })
      continue
    }
    if (section !== from) moved++; else kept++
    item.section = section
    item.flagged = confidence === 'low'          // only the residue still needs an eye
    if (confidence === 'low') lowItems.push({ form: a.subject, label: item.label, section, why: LOW[k] ?? reason })
  }

  // rebuild sections from the ruled placement
  const survivors = pool.map(p => p.item).filter(i => !cutHere.includes(i))
  a.sections = Object.entries(SECTION_TITLES).map(([k, title]) => ({
    key: k, title, items: survivors.filter(i => (i.section ?? 'A') === k),
  }))
  a._placement = {
    ruled_by: 'machine, on domain knowledge',
    delegated: '2026-08-05',
    approval: 'owner, on the summary artifact',
    cut: cutHere.length,
  }
  for (const n of a.form_notes ?? []) { n.placement = NOTE_PLACEMENT; noteItems.push({ form: a.subject, ...n }) }
  a.note_placement = (a.form_notes ?? []).length ? NOTE_PLACEMENT : undefined

  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 }
  for (const s of a.sections) if (counts[s.key] !== undefined) counts[s.key] = s.items.length
  perForm.push({ form: a.subject ?? f, ...counts, cut: cutHere.length,
                 low: a.sections.flatMap(s => s.items).filter(i => i.ruling?.confidence === 'low').length })

  if (!dry) writeFileSync(`${DIR}/${f}`, JSON.stringify(a, null, 2))
}

// ── the summary artifact — ONE thing to approve ──────────────────────────────
const totals = perForm.reduce((t, r) => {
  for (const k of ['A', 'B', 'C', 'D', 'E', 'cut', 'low']) t[k] = (t[k] || 0) + r[k]
  return t
}, {})

const summary = {
  _kind: 'startup-placement-summary',
  _for: 'owner approval — one artifact, not 678 rows',
  _delegation: {
    ruled_by: 'machine, on engineering domain knowledge',
    residue_and_approval: 'owner',
    delegated: '2026-08-05',
    anchors_web_verified: [
      'NETA ATS separates Visual and Mechanical Inspection from Electrical Tests, both pre-energization — inspection rows are A, recorded test data is E',
      'NFPA 13 dry-pipe air-pressure tests are acceptance tests completed before service — a pressure-loss row is A, the pressure is E',
    ],
  },
  distinct_labels_ruled: Object.keys(RULINGS).length,
  occurrences_ruled: totalRuled,
  moved_from_default: moved,
  kept_at_default: kept,
  totals,
  per_form: perForm,
  low_confidence: lowItems,
  cut: cutItems,
  form_notes: noteItems,
  note_placement: NOTE_PLACEMENT,
}
if (!dry) writeFileSync(`${OUT}/placement-summary.json`, JSON.stringify(summary, null, 2))

// ── report ───────────────────────────────────────────────────────────────────
console.log(`PLACEMENT RULINGS APPLIED${dry ? ' (DRY RUN — nothing written)' : ''}\n`)
console.log(`distinct labels ruled : ${Object.keys(RULINGS).length}`)
console.log(`occurrences ruled     : ${totalRuled}  (moved ${moved} · kept ${kept} · cut ${cutCount})`)
console.log(`section totals        : A ${totals.A} · B ${totals.B} · C ${totals.C} · D ${totals.D} · E ${totals.E}`)
console.log(`low confidence        : ${totals.low}  — owner rules these`)
console.log(`cut                   : ${totals.cut}  — not checkable things`)
console.log(`form notes            : ${noteItems.length}  — proposed as ${NOTE_PLACEMENT.section}`)
if (!dry) console.log(`\nsummary → ${OUT}/placement-summary.json`)
