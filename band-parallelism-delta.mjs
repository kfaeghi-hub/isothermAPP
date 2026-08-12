// band-parallelism-delta — what bounded parallelism bought on the 199×52 sheet.
// [KEEL] Phase 5a close.
//
//   node --env-file=.env band-parallelism-delta.mjs
//
// ONE RUN MEASURES BOTH NUMBERS, deliberately. Bands run one after another with no
// other work between them, so the SUM of the per-band durations IS the sequential
// wall clock — measured, not estimated. Running the sheet twice to compare would
// cost a second $1.40 to learn something arithmetic already knows, and would
// compare two different model runs, which vary.
//
// The expectation stated before the run, so it can be wrong: cost UNCHANGED (the
// same bands, the same tokens) and wall clock down roughly 3× at a concurrency of
// three. This buys time, not money.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('band-parallelism-delta')

const FILE = 'samples/seneca-import/equ-schedules/FanCoils.xlsx'
if (!existsSync(FILE)) {
  console.log(`SKIPPED — ${FILE} is absent (gitignored client schedule). Not a pass.`)
  process.exit(0)
}

await build({ entryPoints: ['src/lib/intakeExcel.ts'], outfile: 'out/bpd-x.mjs', format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file', 'jszip'] })
await build({ entryPoints: ['src/lib/sheetBands.ts'], outfile: 'out/bpd-b.mjs', format: 'esm', bundle: true, platform: 'node', logLevel: 'error' })
await build({ entryPoints: ['src/lib/bounded.ts'], outfile: 'out/bpd-c.mjs', format: 'esm', bundle: true, platform: 'node', logLevel: 'error' })
await build({ entryPoints: ['api/_shared/sheet-model-read.ts'], outfile: 'out/bpd-r.mjs', format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file', 'jszip'] })

const { parseSheet, readSheetMerges } = await import('./out/bpd-x.mjs')
const { planBands, sliceBands, assembleBands } = await import('./out/bpd-b.mjs')
const { runBounded } = await import('./out/bpd-c.mjs')
const { readSheetWithModel, costCents } = await import('./out/bpd-r.mjs')

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: types } = await svc.from('equipment_types').select('key, name').eq('active', true)
const knownTypes = types.map(t => `${t.key} (${t.name})`)

const readXlsxFile = (await import('read-excel-file/node')).default
const bytes = readFileSync(FILE)
const sheets = await readXlsxFile(bytes, { trim: true })
const merges = await readSheetMerges(bytes)
const sheet = sheets[0]
const rules = parseSheet(sheet.data, sheet.sheet, types, { merges: merges[sheet.sheet] ?? [] })

const plan = planBands(sheet.data, rules.header_row ?? 1, 7000)
const bands = sliceBands(sheet.data, plan)
console.log(`${FILE.split('/').pop()} — ${sheet.data.length}×${Math.max(...sheet.data.map(r => r.length))}`)
console.log(`ground truth (rules leg): ${rules.rows.length} units · plan: ${bands.length} bands\n`)

const LIMIT = 3
const t0 = Date.now()
const res = await runBounded(bands.map((b, i) => async () => {
  const r = await readSheetWithModel({
    grid: b.rows, sheetName: `${sheet.sheet} (rows ${b.from}-${b.to})`,
    merges: i === 0 ? merges[sheet.sheet] ?? [] : [], knownTypes,
  })
  return { rows: r.run.ok && r.checked?.ok ? r.checked.rows : [], cost: costCents(r.run), ok: r.run.ok }
}), LIMIT, at => console.log(`  ! rate limited at band ${at + 1} — the rest runs one at a time`))
const wall = (Date.now() - t0) / 1000

const seq = res.durations.reduce((a, b) => a + b, 0) / 1000
const cost = res.results.reduce((a, r) => a + (r?.cost ?? 0), 0)
const asm = assembleBands(res.results.map(r => ({ rows: r?.rows ?? [] })))
const failed = res.results.filter(r => !r || !r.ok).length

console.log(`bands            : ${bands.length} (concurrency ${LIMIT}${res.throttledAt !== null ? `, throttled at ${res.throttledAt + 1}` : ''})`)
console.log(`assembled        : ${asm.rows.length} rows vs ground truth ${rules.rows.length}`)
console.log(`overlaps         : ${asm.overlaps.length ? asm.overlaps.join(', ') : 'none — no tag in two bands'}`)
console.log(`failed bands     : ${failed}`)
console.log('')
console.log(`SEQUENTIAL       : ${seq.toFixed(0)}s   [MEASURED — the sum of per-band wall clock]`)
console.log(`BOUNDED (×${LIMIT})    : ${wall.toFixed(0)}s   [MEASURED — actual elapsed]`)
console.log(`DELTA            : ${(seq - wall).toFixed(0)}s saved · ${(seq / wall).toFixed(1)}× faster`)
console.log(`COST             : ${cost.toFixed(1)}c   [SAMPLE — one run; the same bands either way]`)

writeFileSync('out/band-parallelism-delta.json', JSON.stringify({
  file: FILE, bands: bands.length, limit: LIMIT, throttledAt: res.throttledAt,
  sequentialSeconds: Number(seq.toFixed(1)), boundedSeconds: Number(wall.toFixed(1)),
  speedup: Number((seq / wall).toFixed(2)), costCents: Number(cost.toFixed(1)),
  assembled: asm.rows.length, groundTruth: rules.rows.length, overlaps: asm.overlaps, failedBands: failed,
}, null, 2) + '\n')
console.log('\nwritten to out/band-parallelism-delta.json')
