// capture-extraction-failures — freeze the five sheets the model could not read.
//
// [KEEL] Ruled 2026-08-12: the five are the NEXT curriculum entry and they are
// fixed OUTSIDE Phase 3. A benchmark that improves because reconciliation landed
// AND shape failures got fixed in the same window cannot attribute the gain — so
// they are captured now, diagnosed now, and patched later as their own measured
// step.
//
//   AHU-Coils1 · DOAS-1 · DOAS-3 · DOAS-coil1   contract-output  (SHAPE)
//   FanCoils                                     truncated        (SIZE)
//
// Two different problems wearing one label. Shape is the model returning something
// the contract refuses; size is a 64-row sheet not fitting the budget. Neither is
// fixed by trying again, and the size one is a chunked-read decision with its own
// cost line, because chunking multiplies calls.
//
// WHAT IS WRITTEN WHERE, and why the split is not optional. The raw model output
// is derived from CLIENT SCHEDULES and carries their content, so it goes to
// gitignored out/. What is committed is the STRUCTURAL DIAGNOSIS — what shape came
// back, which keys were present, where the contract refused — which is the part a
// fix is written against and contains no client data. Same rule as the calibration
// FIXTURES.md: the manifest is the artifact, the documents never are.
//
//   node --env-file=.env capture-extraction-failures.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('capture-extraction-failures')

const DIR = 'samples/seneca-import/equ-schedules'
const TARGETS = [
  { file: 'AHU-Coils1.xlsx', expect: 'contract-output', kind: 'shape' },
  { file: 'DOAS-1.xlsx',     expect: 'contract-output', kind: 'shape' },
  { file: 'DOAS-3.xlsx',     expect: 'contract-output', kind: 'shape' },
  { file: 'DOAS-coil1.xlsx', expect: 'contract-output', kind: 'shape' },
  { file: 'FanCoils.xlsx',   expect: 'truncated',       kind: 'size'  },
]

const missing = TARGETS.filter(t => !existsSync(`${DIR}/${t.file}`)).map(t => t.file)
if (missing.length) {
  console.log('SKIPPED — client schedules absent (gitignored):', missing.join(', '))
  console.log('This is a skip, not a pass. Restore from ShareSync to capture.')
  process.exit(0)
}

await build({
  entryPoints: ['src/lib/intakeExcel.ts'], outfile: 'out/cap-intakeExcel.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file'],
})
await build({
  entryPoints: ['api/_shared/sheet-model-read.ts'], outfile: 'out/cap-model-read.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
  external: ['read-excel-file', 'jszip'],
})
const { readSheetMerges } = await import('./out/cap-intakeExcel.mjs')
const { readSheetWithModel, costCents } = await import('./out/cap-model-read.mjs')
const readXlsxFile = (await import('read-excel-file/node')).default

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: types } = await svc.from('equipment_types').select('key, name').eq('active', true).order('sort_order')
const knownTypes = (types ?? []).map(t => `${t.key} (${t.name})`)

mkdirSync('out/extraction-failures', { recursive: true })

/** What shape came back, WITHOUT quoting the sheet's contents. */
function diagnose(raw) {
  if (!raw) return { parsed: false, note: 'no text was returned at all' }
  let v = null
  try { v = JSON.parse(raw) } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) { try { v = JSON.parse(m[0]) } catch { /* still not JSON */ } }
  }
  if (v === null) {
    return { parsed: false, chars: raw.length, note: 'the response was not JSON, even after fencing was stripped' }
  }
  const topKeys = Object.keys(v)
  const rows = Array.isArray(v.rows) ? v.rows : null
  const rowKeyCounts = {}
  let missingTag = 0, badConf = 0
  for (const r of rows ?? []) {
    for (const k of Object.keys(r ?? {})) rowKeyCounts[k] = (rowKeyCounts[k] ?? 0) + 1
    if (typeof r?.tag !== 'string' || !r.tag.trim()) missingTag++
    if (typeof r?.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) badConf++
  }
  return {
    parsed: true, chars: raw.length, topKeys,
    rowsIsArray: Array.isArray(v.rows), rowCount: rows?.length ?? null,
    rowKeys: Object.keys(rowKeyCounts).sort(),
    rowsMissingTag: missingTag, rowsWithBadConfidence: badConf,
    // The contract's own verdict, restated: this is WHY runAgent refused it.
    verdict: !Array.isArray(v.rows) ? 'no rows array'
      : missingTag ? `${missingTag} row(s) without a usable tag`
      : badConf ? `${badConf} row(s) with confidence outside 0..1`
      : 'rows look shaped — refusal was elsewhere',
  }
}

const manifest = []
let spend = 0

for (const t of TARGETS) {
  const bytes = readFileSync(`${DIR}/${t.file}`)
  const sheets = await readXlsxFile(bytes, { trim: true })
  const merges = await readSheetMerges(bytes)
  const s = sheets[0]

  const r = await readSheetWithModel({
    grid: s.data, sheetName: s.sheet, merges: merges[s.sheet] ?? [], knownTypes,
  })
  spend += costCents(r.run)

  const raw = r.run.raw ?? ''
  // CLIENT CONTENT — gitignored, never committed.
  writeFileSync(`out/extraction-failures/${t.file}.raw.txt`, raw)

  const d = r.run.ok ? { parsed: true, note: 'this run SUCCEEDED — the failure did not reproduce' } : diagnose(raw)
  manifest.push({
    file: t.file, expectedFailure: t.expect, kind: t.kind,
    reproduced: !r.run.ok,
    failure: r.run.failure ?? null,
    sheet: s.sheet, gridRows: s.data.length,
    gridCols: Math.max(...s.data.map(x => x.length)),
    outputTokens: r.run.usage?.outputTokens ?? null,
    budget: r.run.budget ?? null,
    diagnosis: d,
  })
  console.log(`  ${t.file.padEnd(20)} ${r.run.ok ? 'SUCCEEDED (did not reproduce)' : `failed: ${r.run.failure}`}` +
    `  ${costCents(r.run).toFixed(1)}c  — ${d.verdict ?? d.note ?? ''}`)
}

writeFileSync('fixtures/extraction-bench/FAILURES.md', [
  '# The five sheets the model leg could not read — 2026-08-12',
  '',
  '**Captured, not fixed.** Ruled: these are repaired OUTSIDE Phase 3, because a',
  'benchmark that improves from reconciliation AND from shape fixes in the same',
  'window cannot attribute the gain.',
  '',
  '**The raw model outputs are NOT here.** They derive from client schedules and',
  'live in gitignored `out/extraction-failures/`. What is committed is the',
  'structural diagnosis — the shape that came back and where the contract refused —',
  'which is what a fix is written against and carries no client content.',
  '',
  'Regenerate: `node --env-file=.env capture-extraction-failures.mjs`',
  '',
  '| file | class | reproduced | failure | grid | out tok / budget | diagnosis |',
  '|---|---|---|---|---|---|---|',
  ...manifest.map(m =>
    `| \`${m.file}\` | ${m.kind} | ${m.reproduced ? 'yes' : '**no**'} | ${m.failure ?? '—'} | ` +
    `${m.gridRows}×${m.gridCols} | ${m.outputTokens ?? '—'} / ${m.budget ?? '—'} | ` +
    `${(m.diagnosis.verdict ?? m.diagnosis.note ?? '').replace(/\|/g, '/')} |`),
  '',
  '## Row keys the model returned',
  '',
  ...manifest.filter(m => m.diagnosis.rowKeys?.length).map(m =>
    `- \`${m.file}\` → ${m.diagnosis.rowKeys.map(k => `\`${k}\``).join(', ')}`),
  '',
  `Captured at a cost of ${spend.toFixed(1)}c.`,
].join('\n'))

console.log(`\ncaptured ${manifest.length} failures · ${spend.toFixed(1)}c`)
console.log('  raw output  → out/extraction-failures/   (gitignored, client-derived)')
console.log('  diagnosis   → fixtures/extraction-bench/FAILURES.md   (committed)')
