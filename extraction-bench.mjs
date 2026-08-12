// extraction-bench — the extraction target, MEASURED.
//
//   node --env-file=.env extraction-bench.mjs            corpus run, scored + surveyed
//   node --env-file=.env extraction-bench.mjs --json     machine output for RELEASES
//   node --env-file=.env extraction-bench.mjs --survey   the unscored files in detail
//
// WHY THIS EXISTS. Every extraction fix so far has been argued from one file. The
// Avondale incident was found by a user, the region splitter by a gate that ran
// through a harness, the served-vs-is law by reading three sheets by hand. None of
// those told anyone whether extraction as a whole was getting better or worse,
// because there was no number.
//
// THE METRIC (ruled 2026-08-11). A file is CLEAN when all four hold:
//   1. every unit on the sheet is extracted — no shortfall, no phantom
//   2. every unit is correctly typed
//   3. at least 95% of its spec values are correct
//   4. every genuine ambiguity is FLAGGED rather than guessed
// Corpus pass rate is the fraction of SCORED files that are clean. Target >= 90%.
//
// SCORED VERSUS SURVEYED, AND WHY THE SPLIT IS PRINTED. A file is scored only
// against expectations WRITTEN BY HAND from the sheet. Truth recorded by running
// the parser and keeping what came out asserts that the code still does whatever
// it does, and passes just as happily when the behaviour is wrong — this repo has
// paid for that lesson twice. The other files in the corpus are still RUN, and
// their structural signals reported, but they are counted as UNSCORED. A pass
// rate over 4 files must never be mistaken for a pass rate over 37, so both
// numbers print every time.
//
// CLIENT DOCUMENTS ARE NEVER COMMITTED. The corpus lives in gitignored samples/;
// the one committed member is the synthetic hostile fixture, so a fresh clone can
// always measure something. Absent files SKIP LOUDLY BY NAME (FIXTURES.md rule).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('extraction-bench')

const JSON_OUT = process.argv.includes('--json')
const SURVEY   = process.argv.includes('--survey')
// THE MODEL LEG COSTS MONEY, so it is opt-in and scopeable. `--only=` restricts
// the run to files whose name matches, because measuring 37 sheets to check one
// change is spend without information.
const WITH_AI  = process.argv.includes('--with-ai')
const ONLY     = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice(7)
const log = (...a) => { if (!JSON_OUT) console.log(...a) }

// ── the corpus ──────────────────────────────────────────────────────────────
// Directories, not a file list: new projects' schedules join the corpus by being
// dropped in, which is what "the corpus is the curriculum" requires. Each entry
// says what it is and whether its documents are client-confidential.
const CORPUS = [
  { dir: 'fixtures/extraction-bench',            label: 'synthetic',        committed: true  },
  { dir: 'samples/excel&pdf-schedule-samples',   label: 'Avondale (Adam)',  committed: false },
  { dir: 'samples/seneca-import/equ-schedules',  label: 'Seneca (33)',      committed: false },
]

// ── hand-written truth ──────────────────────────────────────────────────────
// Written from the sheets, never from a run. `spec` lists values that MUST be
// captured under some heading; `ambiguities` are questions the sheet does not
// answer and which must be raised rather than resolved.
const EXPECT = {
  'hostile-schedule.xlsx': {
    why: 'the deliberately hostile fixture — merged banner beside a group header, two-tier headers, alien column names, a duty that names a boiler, a bare MBH column the sheet never disambiguates',
    units: { 'HP-1': 'pump', 'HP-2': 'pump', 'SP-1': 'pump', 'SP-2': 'pump' },
    notUnits: ['NOTES'],
    spec: { 'HP-1': ['79', '15', '1760', '115/1/60'], 'SP-1': ['130', '25', '1760', '208/3/60'] },
    ambiguities: ['MBH'],
  },
  'AS.xlsx': {
    why: "Adam's air separator — no DESCRIPTION and no TYPE column, so the title is the only identity evidence",
    units: { 'AS-1': 'air_separator' },
    spec: { 'AS-1': ['TACO', '4904ADR-125', '4', '12', '26', '90'] },
    ambiguities: [],
  },
  'Boilers.xlsx': {
    why: "Adam's boilers — TYPE carries the identity, SERVICE carries the duty",
    units: { 'B-1': 'boiler', 'B-2': 'boiler' },
    spec: { 'B-1': ['800', '787', '4.5', '467'] },
    ambiguities: [],
  },
  'PMPs.xlsx': {
    why: "Adam's pumps — the file the served-vs-is law came from; SERVICE reads BOILER B-1 PRIMARY LOOP",
    units: { 'BP-1': 'pump', 'BP-2': 'pump', 'P-1': 'pump', 'P-2': 'pump' },
    spec: { 'BP-1': ['79', '15', '1760', '115/1/60', '0.8'], 'P-1': ['130', '25', '1760', '208/3/60', '1.5'] },
    ambiguities: [],
  },
}

// ── the parser under test ───────────────────────────────────────────────────
await build({
  entryPoints: ['src/lib/intakeExcel.ts'], outfile: 'out/bench-intakeExcel.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file'],
})
const { parseSheet, readSheetMerges } = await import('./out/bench-intakeExcel.mjs')
const readXlsxFile = (await import('read-excel-file/node')).default

// THE SAME CODE THE ENDPOINT RUNS. Not a re-implementation: this repo has already
// paid for a gate that "replaced the assembly step with itself" and therefore
// proved the harness. api/_shared/sheet-model-read.ts is the one reading path.
let readSheetWithModel = null, costCents = null, reconcileSheet = null
let readSheetChunked = null, planChunks = null
if (WITH_AI) {
  await build({
    entryPoints: ['api/_shared/sheet-model-read.ts'], outfile: 'out/bench-model-read.mjs',
    format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
    external: ['read-excel-file', 'jszip'],
  })
  const m = await import('./out/bench-model-read.mjs')
  readSheetWithModel = m.readSheetWithModel
  readSheetChunked = m.readSheetChunked
  planChunks = m.planChunks
  costCents = m.costCents
  await build({
    entryPoints: ['src/lib/reconcile.ts'], outfile: 'out/bench-reconcile.mjs',
    format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
  })
  reconcileSheet = (await import('./out/bench-reconcile.mjs')).reconcileSheet
}

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [tRes, aRes] = await Promise.all([
  svc.from('equipment_types').select('key, name').eq('active', true).order('sort_order'),
  svc.from('equipment_type_aliases').select('type_key, alias'),
])
if (tRes.error || aRes.error) {
  console.error('vocabulary read failed:', (tRes.error ?? aRes.error).message); process.exit(1)
}
const byKey = new Map()
for (const a of aRes.data ?? []) byKey.set(a.type_key, [...(byKey.get(a.type_key) ?? []), a.alias])
const VOCAB = tRes.data.map(t => ({ key: t.key, name: t.name, aliases: byKey.get(t.key) ?? [] }))

// ── run one file ────────────────────────────────────────────────────────────
async function readFile(path) {
  const bytes = readFileSync(path)
  const sheets = await readXlsxFile(bytes, { trim: true })
  // Merge extents are read from the same bytes — the reader discards them, and a
  // header fold that cannot see where a group header ends invents quantities that
  // do not exist (`MOTOR MBH`). The benchmark measures the parser as it SHIPS, so
  // it must hand it the same input the app does.
  const merges = await readSheetMerges(bytes)
  return sheets.map(s => ({
    sheet: s.sheet,
    grid: s.data,
    merges: merges[s.sheet] ?? [],
    parsed: parseSheet(s.data, s.sheet, VOCAB, { merges: merges[s.sheet] ?? [] }),
  }))
}

/** Read every sheet of a file with the MODEL, through the shipped path.
 *
 *  A sheet whose answer will not fit in one call is read in BANDS. The plan comes
 *  from the deterministic parser's header row — geometry only, never meaning. */
async function readWithModel(path, sheetsRaw) {
  const knownTypes = VOCAB.map(v => `${v.key} (${v.name})`)
  const out = []
  for (const s of sheetsRaw) {
    const dataStart = s.parsed.header_row ?? 1
    const plan = planChunks(s.grid, dataStart, 7000)
    if (plan.bands > 1) {
      const c = await readSheetChunked({
        grid: s.grid, sheetName: s.sheet, merges: s.merges, knownTypes, dataStart,
      }, 7000)
      out.push({
        sheet: s.sheet, chunked: true, plan, bands: c.bands, overlaps: c.overlaps,
        run: { ok: c.bands.some(b => b.ok), failure: c.bands.every(b => b.ok) ? undefined : 'band-failure',
               usage: null },
        checked: { ok: true, rows: c.rows, problems: [], mappings: [], ambiguities: c.ambiguities },
        _cost: c.cost, _calls: c.calls,
      })
    } else {
      const r = await readSheetWithModel({ grid: s.grid, sheetName: s.sheet, merges: s.merges, knownTypes })
      out.push({ sheet: s.sheet, chunked: false, ...r, _cost: costCents(r.run), _calls: 1 })
    }
  }
  return out
}

/** Score a file against hand-written truth. Returns the verdict and its failure classes. */
function score(name, results, truth, modelAmbiguities = null) {
  const rows = results.flatMap(r => r.parsed.rows)
  const byTag = new Map(rows.map(r => [String(r.tag ?? ''), r]))
  const fails = []

  // 1 · every unit extracted, no phantoms
  for (const tag of Object.keys(truth.units)) {
    if (!byTag.has(tag)) fails.push({ cls: 'unit-missing', detail: `${tag} was not extracted` })
  }
  for (const tag of byTag.keys()) {
    if (!(tag in truth.units)) fails.push({ cls: 'phantom-unit', detail: `${tag} is not on the sheet` })
  }
  for (const bad of truth.notUnits ?? []) {
    if ([...byTag.keys()].some(t => t.includes(bad))) {
      fails.push({ cls: 'prose-as-unit', detail: `"${bad}" was read as equipment` })
    }
  }

  // 2 · correctly typed
  for (const [tag, want] of Object.entries(truth.units)) {
    const got = byTag.get(tag)?.proposed_type ?? null
    if (byTag.has(tag) && got !== want) {
      fails.push({ cls: 'mistyped', detail: `${tag}: expected ${want}, got ${got ?? 'null'}` })
    }
  }

  // 3 · >= 95% of spec values correct. A value is correct when it appears, as
  //     written, under SOME captured heading on that unit — the heading is the
  //     mapper's business; this asks only whether the READ lost the number.
  let want = 0, got = 0
  for (const [tag, values] of Object.entries(truth.spec ?? {})) {
    const np = byTag.get(tag)?.nameplate ?? {}
    const have = new Set(Object.values(np).map(v => String(v)))
    for (const v of values) { want++; if (have.has(String(v))) got++ }
  }
  const specPct = want ? got / want : 1
  if (specPct < 0.95) {
    fails.push({ cls: 'spec-loss', detail: `${got}/${want} spec values captured (${Math.round(specPct * 100)}%)` })
  }

  // 4 · ambiguities FLAGGED, never guessed.
  //     No flag mechanism exists on the deterministic path yet, so an expected
  //     ambiguity is an automatic failure with its own class. That is the honest
  //     baseline: the requirement is real and unmet, and naming it is what makes
  //     the next build measurable rather than felt.
  // WHOEVER READ IT IS WHO MUST HAVE ASKED. With --with-ai the model is the
  // reader, so its questions are what clause 4 is scored against; without it the
  // deterministic path is, and it has no way to raise one — which is the honest
  // baseline that made this clause fail from the start.
  for (const amb of truth.ambiguities ?? []) {
    const flags = modelAmbiguities ?? results.flatMap(r => r.parsed.ambiguities ?? [])
    if (!flags.some(f => String(f.about ?? f).includes(amb))) {
      fails.push({ cls: 'ambiguity-unflagged', detail: `"${amb}" is ambiguous on this sheet and nothing asked about it` })
    }
  }

  return { name, clean: fails.length === 0, fails, units: byTag.size, specPct }
}

/** Structural signals for a file with no hand-written truth. Never a verdict. */
function survey(name, results) {
  const rows = results.flatMap(r => r.parsed.rows)
  const typed = rows.filter(r => r.proposed_type).length
  const noHeader = results.filter(r => r.parsed.header_row === null).length
  const unmapped = [...new Set(results.flatMap(r => r.parsed.coverage?.captured ?? []))]
  return {
    name, sheets: results.length, rows: rows.length, typed,
    typedPct: rows.length ? typed / rows.length : 0,
    noHeaderSheets: noHeader,
    specHeadings: unmapped.length,
    artifactSuspected: results.some(r => r.parsed.artifact?.suspected),
  }
}

// ── walk the corpus ─────────────────────────────────────────────────────────
const scored = [], surveyed = [], skipped = [], broke = []
const modelRuns = []   // --with-ai only
const mergedRows = [], allDisagreements = [], holes = []
let chunkedSheets = 0, chunkBands = 0
const overlaps = []

for (const src of CORPUS) {
  if (!existsSync(src.dir)) {
    skipped.push({ dir: src.dir, label: src.label, why: 'directory absent' })
    continue
  }
  const files = readdirSync(src.dir).filter(f => /\.xlsx?$/i.test(f)).sort()
  if (!files.length) { skipped.push({ dir: src.dir, label: src.label, why: 'no spreadsheets in it' }); continue }

  for (const f of files) {
    if (ONLY && !f.toLowerCase().includes(ONLY.toLowerCase())) continue
    const path = `${src.dir}/${f}`
    let results
    try {
      results = await readFile(path)
    } catch (e) {
      // A file that cannot be READ is a failure class of its own, not an absence.
      broke.push({ name: f, label: src.label, error: String(e.message ?? e).split('\n')[0] })
      continue
    }
    let modelAmb = null

    if (WITH_AI) {
      const rulesRows  = results.flatMap(r => r.parsed.rows)
      const rulesTyped = rulesRows.filter(r => r.proposed_type).length
      let mRows = [], cost = 0, failures = [], flags = 0, ambiguities = 0, calls = 0
      const ambList = []
      const perSheetModel = new Map()
      try {
        for (const r of await readWithModel(path, results)) {
          cost += r._cost ?? costCents(r.run)
          calls += r._calls ?? 1
          if (r.chunked) { chunkedSheets++; chunkBands += r._calls; if (r.overlaps?.length) overlaps.push(...r.overlaps) }
          if (!r.run.ok)      { failures.push(`run:${r.run.failure}`); continue }
          if (!r.checked?.ok) { failures.push(`boundary:${(r.checked?.problems ?? []).filter(p => p.severity === 'fatal').map(p => p.where).join(',') || 'refused'}`); continue }
          mRows.push(...r.checked.rows)
          perSheetModel.set(r.sheet, r.checked.rows)
          flags += r.checked.problems.filter(p => p.severity === 'flag').length
          ambiguities += r.checked.ambiguities.length
          ambList.push(...r.checked.ambiguities)
        }
      } catch (e) { failures.push('threw:' + String(e.message ?? e).split(String.fromCharCode(10))[0]) }
      const mTyped = mRows.filter(r => r.proposed_type).length
      modelRuns.push({
        name: f, label: src.label, cost, calls,
        rulesRows: rulesRows.length, rulesTyped,
        modelRows: mRows.length, modelTyped: mTyped,
        flags, ambiguities, failures,
      })
      // ── PHASE 3: reconcile, per sheet, and keep the argument ──────────────
      // THE DENOMINATOR IS 298 AND DOES NOT MOVE. A sheet the model could not read
      // is a NAMED HOLE filled by the rules leg, never a file that quietly leaves
      // the divisor.
      for (const rSheet of results) {
        const mSheet = perSheetModel.get(rSheet.sheet) ?? null
        const merged = reconcileSheet(
          rSheet.parsed.rows.map(r => ({
            tag: r.tag, descriptor: r.descriptor, location: r.location,
            area_served: r.area_served, proposed_type: r.proposed_type,
            nameplate: r.nameplate, confidence: r.confidence,
          })),
          mSheet, mSheet ? [] : [],
        )
        mergedRows.push(...merged.rows)
        allDisagreements.push(...merged.disagreements)
        if (!mSheet) holes.push(`${f}:${rSheet.sheet}`)
      }

      modelAmb = ambList
      log(`  · ${f.padEnd(22)} rules ${rulesTyped}/${rulesRows.length} typed → ` +
          `model ${mTyped}/${mRows.length} typed   ${cost.toFixed(1)}c` +
          `${ambiguities ? `  ${ambiguities} question(s)` : ''}` +
          `${failures.length ? `  FAILED: ${failures.join('; ')}` : ''}`)
    }

    // Scored AFTER the model leg, so clause 4 can be judged against whoever
    // actually did the reading: the model's questions under --with-ai, the
    // deterministic path's (which has none) otherwise.
    if (EXPECT[f]) scored.push({ ...score(f, results, EXPECT[f], modelAmb), label: src.label, why: EXPECT[f].why })
    else surveyed.push({ ...survey(f, results), label: src.label })
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const clean = scored.filter(s => s.clean).length
const rate  = scored.length ? clean / scored.length : 0

if (JSON_OUT) {
  console.log(JSON.stringify({
    scored: scored.length, clean, rate, surveyed: surveyed.length,
    unreadable: broke.length, skippedDirs: skipped.length,
    failures: scored.filter(s => !s.clean).map(s => ({ name: s.name, classes: s.fails.map(f => f.cls) })),
  }, null, 2))
} else {
  log('\n' + '='.repeat(78))
  log('EXTRACTION BENCHMARK')
  log('='.repeat(78))

  for (const s of skipped) {
    log(`\nSKIPPED — ${s.label}: ${s.dir} (${s.why})`)
    log('  Not a pass. Client documents are gitignored; restore them from ShareSync to measure.')
  }
  if (broke.length) {
    log(`\nUNREADABLE (${broke.length}) — these did not parse at all:`)
    for (const b of broke) log(`  ${b.name.padEnd(24)} ${b.label.padEnd(18)} ${b.error}`)
  }

  log(`\n── SCORED (${scored.length}) — against hand-written truth ──`)
  for (const s of scored) {
    log(`\n  ${s.clean ? 'CLEAN' : 'FAIL '}  ${s.name}   [${s.label}]  ${s.units} units, spec ${Math.round(s.specPct * 100)}%`)
    log(`         ${s.why}`)
    for (const f of s.fails) log(`         ! ${f.cls}: ${f.detail}`)
  }

  log(`\n── SURVEYED (${surveyed.length}) — run, not scored: no hand-written truth yet ──`)
  if (SURVEY) {
    for (const s of surveyed) {
      log(`  ${s.name.padEnd(20)} sheets=${s.sheets} rows=${String(s.rows).padStart(3)} ` +
          `typed=${Math.round(s.typedPct * 100)}% specHeadings=${s.specHeadings}` +
          `${s.noHeaderSheets ? ` NO-HEADER×${s.noHeaderSheets}` : ''}${s.artifactSuspected ? ' CONVERSION?' : ''}`)
    }
  } else {
    const rows = surveyed.reduce((n, s) => n + s.rows, 0)
    const typed = surveyed.reduce((n, s) => n + s.typed, 0)
    const noHead = surveyed.filter(s => s.noHeaderSheets > 0)
    log(`  ${rows} rows across ${surveyed.length} files · ${Math.round((typed / (rows || 1)) * 100)}% typed`)
    if (noHead.length) log(`  ${noHead.length} file(s) have a sheet with NO HEADER FOUND: ${noHead.map(s => s.name).join(', ')}`)
    log('  (--survey for the per-file table)')
  }

  // THE RUN WRITES ITS OWN RESULTS DOWN. The first full model-leg run cost $3.92
  // and most of its per-file lines were lost to a `tail` in the invoking command —
  // a measurement that exists only in a terminal buffer is a measurement you will
  // pay for twice. `out/` is gitignored; the numbers that matter go to RELEASES.
  if (WITH_AI && modelRuns.length) {
    try {
      writeFileSync('out/extraction-bench-model.json', JSON.stringify(modelRuns, null, 2))
      log('\n  (per-file model results written to out/extraction-bench-model.json)')
    } catch { /* reporting must never fail the run */ }
  }

  if (WITH_AI && modelRuns.length) {
    const rt = modelRuns.reduce((n, m) => n + m.rulesTyped, 0)
    const rr = modelRuns.reduce((n, m) => n + m.rulesRows, 0)
    const mt = modelRuns.reduce((n, m) => n + m.modelTyped, 0)
    const mr = modelRuns.reduce((n, m) => n + m.modelRows, 0)
    const c  = modelRuns.reduce((n, m) => n + m.cost, 0)
    const failed = modelRuns.filter(m => m.failures.length)
    log(`\n── MODEL LEG (${modelRuns.length} file(s)) ──`)
    log(`  rules: ${rt}/${rr} typed (${Math.round((rt / (rr || 1)) * 100)}%)`)
    log(`  model: ${mt}/${mr} typed (${Math.round((mt / (mr || 1)) * 100)}%)`)
    log(`  questions raised: ${modelRuns.reduce((n, m) => n + m.ambiguities, 0)} · ` +
        `boundary flags: ${modelRuns.reduce((n, m) => n + m.flags, 0)}`)
    // COST PER SHEET READ vs COST PER USABLE SHEET. The five failed files were
    // paid for at full price and produced nothing; a single "cost per sheet" hides
    // that, and keeps hiding it as the failures get fixed. Two numbers converge
    // only when nothing is being paid for twice.
    const usable = modelRuns.length - failed.length
    const totalCalls = modelRuns.reduce((n, m) => n + (m.calls ?? 1), 0)
    log(`  COST: ${c.toFixed(1)}c total · ${(c / modelRuns.length).toFixed(1)}c per sheet READ · ` +
        `${usable ? (c / usable).toFixed(1) : '—'}c per USABLE sheet (${usable}/${modelRuns.length})`)
    // CHUNKING MULTIPLIES CALLS AND THE MULTIPLIER IS ITS OWN LINE, not folded into
    // an average where it disappears.
    if (chunkedSheets) {
      log(`  CHUNKED: ${chunkedSheets} sheet(s) read in ${chunkBands} bands ` +
          `(x${(chunkBands / chunkedSheets).toFixed(1)} calls each) · ` +
          `${totalCalls} model calls across ${modelRuns.length} sheets` +
          `${overlaps.length ? ` · OVERLAPS: ${overlaps.join(', ')}` : ' · no tag appeared in two bands'}`)
    }
    if (failed.length) log(`  FAILED: ${failed.map(m => `${m.name} (${m.failures.join('; ')})`).join(' · ')}`)

    // ── THE THREE LEGS, ALL AGAINST 298 ───────────────────────────────────
    // Ruled permanent: a leg may exclude files in its own diagnostics, but the
    // climb chart has ONE denominator or it stops being a climb chart.
    const DEN = rr
    const mergedTyped = mergedRows.filter(r => r.proposed_type).length
    log(`\n── THREE LEGS, one denominator (${DEN} rows) ──`)
    log(`  rules  ${String(rt).padStart(4)} typed  ${(rt / DEN * 100).toFixed(0)}%`)
    log(`  model  ${String(mt).padStart(4)} typed  ${(mt / DEN * 100).toFixed(0)}%   ` +
        `(read ${mr} rows; ${DEN - mr} it never saw)`)
    log(`  MERGED ${String(mergedTyped).padStart(4)} typed  ${(mergedTyped / DEN * 100).toFixed(0)}%   ` +
        `of ${mergedRows.length} rows`)
    if (holes.length) {
      log(`  named holes carried by the rules leg (${holes.length}): ${holes.join(', ')}`)
    }

    const byKind = {}
    for (const d of allDisagreements) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1
    log(`\n── DISAGREEMENT (${allDisagreements.length}) — recorded, never resolved away ──`)
    for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      log(`  ${String(n).padStart(5)}  ${k}`)
    }
    const conflicts = allDisagreements.filter(d => d.kind === 'type-conflict')
    if (conflicts.length) {
      log(`  the ${conflicts.length} type-conflicts (the ones that matter most):`)
      for (const d of conflicts.slice(0, 12)) log(`     ${d.tag}: rules ${d.rules} vs model ${d.model}`)
      if (conflicts.length > 12) log(`     … ${conflicts.length - 12} more`)
    }
    try {
      writeFileSync('out/extraction-bench-disagreements.json', JSON.stringify(allDisagreements, null, 2))
    } catch { /* reporting must never fail the run */ }
  }

  log('\n' + '='.repeat(78))
  log(`CORPUS PASS RATE: ${clean}/${scored.length} scored files clean` +
      `${scored.length ? ` (${Math.round(rate * 100)}%)` : ''}   target >= 90%`)
  log(`COVERAGE: ${scored.length} scored · ${surveyed.length} surveyed-not-scored · ` +
      `${broke.length} unreadable · ${skipped.length} directories absent`)
  log('A rate over the scored set is not a rate over the corpus. Both numbers are printed')
  log('so the first can never be read as the second.')
  log('='.repeat(78))
}

// The bench REPORTS; it does not gate. A regression shows as a falling rate and a
// named failure class, which is more useful than a red suite that says only "no".
process.exit(0)
