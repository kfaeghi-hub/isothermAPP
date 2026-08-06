// RATIFICATION SITTING SHEET — the flagged defaults of one batch, as a ruling
// table. Format requested 2026-08-05: item text · proposed section · the
// plausible alternative.
//
// The point is that a sitting is RULE-THE-EXCEPTIONS, not read-everything. The
// unflagged items matched a stated rule and are not reproduced here; only the
// items where the mapper had to default appear, each with the one alternative
// worth considering, so most calls are a single keystroke.
//
// THE ALTERNATIVE IS COMPUTED, NOT GUESSED. A column that always said "C" would
// be decoration — it would give the same answer whether or not the item had
// anything running-check about it, which is the shape of a check that cannot
// fail. So the alternative comes from the strongest NON-winning signal in the
// item's own text, and when nothing else registers the column says so.
//
// ── PHASE 2 OBLIGATION, ruled 2026-08-05 and recorded here so it cannot be
// forgotten at the point of use ───────────────────────────────────────────────
// Phase 2 items are DRAFTED against standards, not mined from a master, and an
// item earns its place by CONVERGENCE across independent sources. Every Phase 2
// artifact carries a convergence class — `universal` · `type-common` ·
// `single-source` — and THIS TABLE MUST SHOW IT, so a sitting sees why an item
// exists and not merely what it says. A single-source item with no stated reason
// is cut before it ever reaches a sitting: the template holds consensus, not
// collection. See ARCHITECTURE "Template content law" and
// docs/STARTUP-CAMPAIGN.md § Phase 2.
//
// The column renders for DRAFTED artifacts and is omitted for mined ones. A
// mined item's provenance is a named master / table / row, not a convergence
// class, and a column reading "—" on every row is furniture that teaches
// nothing. `assertConvergence()` below refuses to print a sitting sheet for a
// drafted artifact whose items lack a class, or whose single-source items lack
// a stated reason — those are cut before a sitting, not ruled on.
//
// Run: node ruling-table.mjs [--batch N] [--md]
//      --batch N   1-based batch of 10 forms, in the mine's own order
//      --md        markdown table (default is fixed-width for a terminal)

import { readFileSync, readdirSync, existsSync } from 'node:fs'

// Phase 1 artifacts are mined; Phase 2 artifacts are drafted. Both are
// ratification artifacts, so both are sitting-sheet sources.
const DIR = process.argv.includes('--phase2') ? 'out/startup-mining/phase2' : 'out/startup-mining/artifacts'
if (!existsSync(DIR)) { console.error(`REFUSE: ${DIR} absent — run map-startup.mjs first`); process.exit(1) }

const args = process.argv.slice(2)
const md = args.includes('--md')
const bi = args.indexOf('--batch')
const batch = bi >= 0 ? Number(args[bi + 1]) : null

// Weak signals — deliberately looser than the mapper's rules. The mapper's job
// is to be right; this column's job is to name the argument a human will have.
const HINTS = [
  { s: 'C', re: /\b(verif|check(ed)?|operat|function|run|rotat|noise|vibrat|leak|shutoff|stroke|adequate|free(ly)?|movement|drain(abilit)?y|removal|response|setback)\b/i,
    why: 'reads as behaviour, or as something only testable once running' },
  { s: 'D', re: /\b(valve|freeze|limit|guard|protect|safety|interlock|disconnect|starter|relief|alarm|cutout|cut-?off)\b/i,
    why: 'names a protective device or its disconnect' },
  { s: 'E', re: /\b(pressure|temperature|flow|amp|voltage|reading|gauge|measur|rate|rpm|cfm)\b/i,
    why: 'names a quantity — may belong in Readings rather than a tick box' },
  { s: 'B', re: /\b(sequence|start(-| )?up|energiz|first|initial|purge|ignition)\b/i,
    why: 'reads as a step in the energization sequence' },
]

function alternative(label, proposed) {
  for (const h of HINTS) {
    if (h.s === proposed) continue
    if (h.re.test(label)) return { section: h.s, why: h.why }
  }
  return { section: '—', why: 'no competing signal; the default is probably simply right' }
}

/** A drafted (Phase 2) artifact MUST carry a convergence class on every item.
 *  A mined (Phase 1) artifact must not — its provenance is master/table/row.
 *  Refusing here is the point: the obligation is enforced where the sheet is
 *  produced, not remembered by whoever produces it. */
function assertConvergence(a, file) {
  const drafted = a._phase && /Phase 2/i.test(a._phase)
  if (!drafted) return
  const bad = []
  for (const s of a.sections) for (const i of s.items) {
    if (i.source?.standing_item) continue
    if (!['universal', 'type-common', 'single-source'].includes(i.convergence)) bad.push(i.label)
  }
  if (bad.length) {
    console.error(`REFUSE: ${file} is a Phase 2 artifact and ${bad.length} item(s) carry no convergence class.`)
    console.error(`  first: ${bad.slice(0, 3).join(' | ')}`)
    console.error('  A sitting cannot rule on an item without knowing why it exists.')
    process.exit(1)
  }
  const singles = []
  for (const s of a.sections) for (const i of s.items) {
    if (i.convergence === 'single-source' && !String(i.convergence_reason || '').trim()) singles.push(i.label)
  }
  if (singles.length) {
    console.error(`REFUSE: ${file} carries ${singles.length} single-source item(s) with no stated reason.`)
    console.error(`  first: ${singles.slice(0, 3).join(' | ')}`)
    console.error('  These are cut before a sitting, not ruled on: the template holds consensus, not collection.')
    process.exit(1)
  }
}

const files = readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
const chosen = batch ? files.slice((batch - 1) * 10, batch * 10) : files
if (!chosen.length) { console.error(`REFUSE: batch ${batch} is empty — ${files.length} forms mined`); process.exit(1) }

let total = 0, totalFlagged = 0, totalDistinct = 0
const out = []
for (const f of chosen) {
  const a = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  assertConvergence(a, f)
  const flagged = []
  for (const s of a.sections) for (const i of s.items) {
    if (i.source?.standing_item) continue
    total++
    if (!i.flagged) continue
    totalFlagged++
    flagged.push({ label: i.label, proposed: i.section, alt: alternative(i.label, i.section), src: i.source })
  }
  // GROUPED FOR THE SITTING, NOT DEDUPED IN THE ARTIFACT. The same check often
  // recurs within one master — "Air & Water Flow in Correct Direction" appears
  // under COOLING COIL and again under HEATING COIL — and every occurrence keeps
  // its own source note on disk. Showing it twice would cost two rulings for one
  // decision, which is the opposite of rule-the-exceptions. The count is printed
  // so a grouping can never be mistaken for a lost row.
  const byLabel = new Map()
  for (const r of flagged) {
    const k = r.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (byLabel.has(k)) { byLabel.get(k).n++; byLabel.get(k).where.push(r.src) }
    else byLabel.set(k, { ...r, n: 1, where: [r.src] })
  }
  const grouped = [...byLabel.values()]
  totalDistinct += grouped.length
  if (grouped.length) out.push({ subject: a.subject, master: a.source_master, flagged: grouped, occurrences: flagged.length, ratified: a._ratified })
}

// ── drafted artifacts: the convergence sheet ────────────────────────────────
const drafted = []
for (const f of chosen) {
  const a = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  if (!(a._phase && /Phase 2/i.test(a._phase))) continue
  drafted.push({ file: f, a })
}
if (drafted.length) {
  for (const { file, a } of drafted) {
    console.log(`\nDRAFTED — ${a.subject}  [${file}]`)
    console.log(`${a._batch ?? ''}`)
    console.log(`anchors: ${Object.keys(a._anchors ?? {}).join(' · ')}\n`)
    for (const sec of a.sections) {
      if (!sec.items?.length) continue
      console.log(`  ${sec.key} · ${sec.title}`)
      for (const i of sec.items) {
        const cls = String(i.convergence ?? '—').padEnd(14)
        console.log(`    ${cls} ${i.label}`)
        console.log(`    ${''.padEnd(14)} anchor: ${i.anchor ?? '—'}`)
        if (i.convergence === 'single-source') console.log(`    ${''.padEnd(14)} KEPT BECAUSE: ${i.convergence_reason}`)
      }
      console.log()
    }
    const cut = a._cut_before_the_sitting ?? []
    if (cut.length) {
      console.log(`  CUT BEFORE THIS SHEET (${cut.length}) — the template holds consensus, not collection:`)
      for (const c of cut) console.log(`    · ${c.label}\n        ${c.why_cut}`)
    }
    const counts = {}
    for (const sec of a.sections) for (const i of sec.items) counts[i.convergence] = (counts[i.convergence] ?? 0) + 1
    console.log(`\n  convergence: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  }
  process.exit(0)
}

const label = batch ? `BATCH ${batch}` : 'ALL MINED FORMS'
if (md) {
  console.log(`# Start-Up ratification sitting — ${label}\n`)
  console.log(`${chosen.length} forms · ${total} items · ${totalFlagged} flagged, grouped to ` +
              `**${totalDistinct} distinct rulings** (${pct(totalDistinct, total)} of items). ` +
              `Everything not listed matched a stated rule.\n`)
  console.log(`A = Pre-Start · B = Sequence · C = Running · D = Safety device · E = Readings\n`)
  for (const g of out) {
    console.log(`\n## ${g.subject}\n\n*${g.master}* — **${g.flagged.length} rulings** ` +
                `across ${g.occurrences} occurrence${g.occurrences === 1 ? '' : 's'}\n`)
    console.log('| # | Item | Proposed | Alternative | Why the alternative |')
    console.log('|---|---|---|---|---|')
    g.flagged.forEach((r, i) => console.log(
      `| ${i + 1} | ${r.label.replace(/\|/g, '\\|')}${r.n > 1 ? ` **×${r.n}**` : ''} | **${r.proposed}** | ${r.alt.section} | ${r.alt.why} |`))
  }
  console.log(`\n---\n\n**Ruling shorthand:** keep the proposal — no mark. Move it — write the letter.`)
  console.log(`Cut it — strike. Nothing here is seeded until this sheet comes back.`)
} else {
  console.log(`Start-Up ratification sitting — ${label}`)
  console.log(`${chosen.length} forms · ${total} items · ${totalFlagged} flagged → ${totalDistinct} DISTINCT RULINGS (${pct(totalDistinct, total)} of items)`)
  console.log(`A Pre-Start · B Sequence · C Running · D Safety · E Readings\n`)
  for (const g of out) {
    console.log(`\n── ${g.subject}  (${g.flagged.length} rulings / ${g.occurrences} occurrences)`)
    g.flagged.forEach((r, i) => console.log(
      `  ${String(i + 1).padStart(3)}. ${(r.label.slice(0, 48) + (r.n > 1 ? ` x${r.n}` : '')).padEnd(53)} ${r.proposed} → ${r.alt.section}   ${r.alt.why}`))
  }
}

const nothing = out.every(g => g.ratified === false)
if (!nothing) console.log('\nWARNING: an artifact in this batch is already marked ratified — check before re-ruling.')

function pct(a, b) { return b ? `${(a / b * 100).toFixed(0)}%` : '—' }
