// harvest-replay — the Phase 2 gate corpus: Avondale, read by the machine that
// erred. [KEEL] Harvest Phase 1, ruled 2026-08-14.
//
//   node --env-file=.env harvest-replay.mjs            # stage the corpus
//   node --env-file=.env harvest-replay.mjs --status   # what stands
//
// THE TIME MACHINE (Option A as amended: rules leg ONLY, no model leg). The
// Avondale import predates the model leg — the incident's machine was the old
// parser alone, so the faithful replay reads as the machine read then. The
// parser is built FROM GIT at the ruled commit:
//
//     93d2fe9 — the state immediately before e19d1a3, the Avondale Part 1
//     fixes (service→area_served, served-value-never-types, title recovery).
//
// A LESSON HARDENED INTO THE DETERMINISTIC LAYER CAN NO LONGER BE RE-TAUGHT
// THROUGH CAPTURE (ruling 6): today's parser reads these files correctly, so
// the gate corpus must replay the machine that erred. Measured before ruling:
// the old parser lands every SERVICE value in `descriptor` (area_served null,
// all 7 rows), types BP-1/BP-2 `boiler` from what they serve, and leaves
// P-1/P-2 untyped because the title tier missed the sparse group header.
//
// THE ADAPTER TRANSLATES SHAPE ONLY, NEVER CONTENT: claims say exactly what
// the old parser placed and where; a claim it did not make does not appear,
// and one it made is not corrected in translation. Context that is not parser
// output — the sheet's own header labels — is recorded in `reasoning`, read
// straight from the file's header row.
//
// LIFETIME: the corpus project and uploads are KEPT PERMANENTLY — they are the
// gate corpus, and discarding an upload cascades its signals away. Rows rest
// as DISPOSITIONED-NOT-APPROVED: nothing here ever writes equipment.
// Deliberately NO --clean flag exists on this script.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const COMMIT = '93d2fe9'
const PROJECT = 'ZZ-HARVEST — Corpus (Do Not Use)'
const DIR = 'samples/excel&pdf-schedule-samples'
const FILES = ['AS.xlsx', 'Boilers.xlsx', 'PMPs.xlsx']

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

if (process.argv.includes('--status')) {
  const { data: proj } = await svc.from('projects').select('id').eq('name', PROJECT).maybeSingle()
  if (!proj) { console.log('corpus project does not exist'); process.exit(0) }
  const { data: ups } = await svc.from('intake_uploads').select('id, filename, status, parse_note').eq('project_id', proj.id)
  for (const u of ups ?? []) {
    const { count } = await svc.from('intake_rows').select('*', { count: 'exact', head: true }).eq('upload_id', u.id)
    const { count: pend } = await svc.from('intake_rows').select('*', { count: 'exact', head: true }).eq('upload_id', u.id).eq('disposition', 'pending')
    const { count: sigs } = await svc.from('correction_signals').select('*', { count: 'exact', head: true }).eq('upload_id', u.id)
    console.log(`${u.filename.padEnd(14)} rows=${count} pending=${pend} signals=${sigs}  ${u.parse_note}`)
  }
  process.exit(0)
}

// ── refuse to double-stage: the corpus is permanent, not re-runnable over itself
{
  const { data: proj } = await svc.from('projects').select('id').eq('name', PROJECT).maybeSingle()
  if (proj) {
    const { count } = await svc.from('intake_uploads').select('*', { count: 'exact', head: true }).eq('project_id', proj.id)
    if ((count ?? 0) > 0) {
      console.error(`REFUSING: the corpus already stands (${count} upload(s)). It is permanent; there is no --clean.`)
      process.exit(1)
    }
  }
}

// ── build the erring machine from git, at the ruled commit ───────────────────
const WT = `${process.env.TEMP || '/tmp'}/harvest-replay-worktree`
// removing a worktree that does not exist is fine — that is the normal first run
try { execSync(`git worktree remove --force "${WT}"`, { stdio: 'ignore' }) } catch { /* absent */ }
try { execSync(`git worktree add --detach "${WT}" ${COMMIT}`, { stdio: 'pipe' }) } catch (e) {
  if (!String(e.stderr).includes('already exists')) throw e
}
const { build } = await import('esbuild')
await build({
  entryPoints: [`${WT.replace(/\\/g, '/')}/src/lib/intakeExcel.ts`], outfile: 'out/harvest-old-parser.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file', 'jszip'],
})
const { parseSheet } = await import('./out/harvest-old-parser.mjs')
const readXlsxFile = (await import('read-excel-file/node')).default
console.log(`erring machine built from ${COMMIT}`)

const { data: types } = await svc.from('equipment_types').select('key, name').eq('active', true)

// ── the corpus project ───────────────────────────────────────────────────────
let { data: proj } = await svc.from('projects').select('id').eq('name', PROJECT).maybeSingle()
if (!proj) {
  const ins = await svc.from('projects').insert({
    name: PROJECT, com_number: 'ZZ-HARVEST', status: 'active',
    notes: 'Harvest gate corpus — Avondale replayed through the pre-fix parser (93d2fe9). ' +
      'Permanent: uploads are the Phase 2 gate evidence; signals cascade with them. ' +
      'Rows rest dispositioned-not-approved; nothing here writes equipment.',
    background_description: 'Not a client project. Created by harvest-replay.mjs, 2026-08-14.',
  }).select('id').single()
  if (ins.error) { console.error('project insert refused:', ins.error.message); process.exit(1) }
  proj = ins.data
  console.log(`corpus project created: ${proj.id}`)
}

// ── read, adapt shape, stage ─────────────────────────────────────────────────
const claim = (v) => ({ rules: v ?? null, model: null, from: 'rules', agreed: false })
let staged = 0
for (const f of FILES) {
  const bytes = readFileSync(`${DIR}/${f}`)
  const sheets = await readXlsxFile(bytes, { trim: true })
  const sh = sheets[0]
  const p = parseSheet(sh.data, sh.sheet, types)
  const headerLabels = (sh.data[p.header_row - 1] ?? []).map(c => String(c ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)

  const { data: up, error: upErr } = await svc.from('intake_uploads').insert({
    project_id: proj.id, filename: `replay-${f}`, storage_path: `${proj.id}/replay-${f}`,
    kind: 'excel', content_sha256: `harvest-replay-${f}`, status: 'parsed',
    row_count: p.rows.length,
    parse_note: `replay — rules leg @ ${COMMIT} · ${p.rows.length} rows · 0 model calls · 0.0c`,
  }).select('id').single()
  if (upErr) { console.error(`${f}: upload refused: ${upErr.message}`); process.exit(1) }

  const payload = p.rows.map(r => ({
    upload_id: up.id, project_id: proj.id, source_sheet: sh.sheet,
    source_row: r.source_row ?? null,
    tag: r.tag ?? null, descriptor: r.descriptor ?? null,
    proposed_category: 'mechanical',
    proposed_type: r.proposed_type ?? null,
    observed_type_name: r.observed_type_name ?? null,
    location: r.location ?? null, area_served: r.area_served ?? null,
    nameplate: r.nameplate && Object.keys(r.nameplate).length ? r.nameplate : null,
    confidence: r.confidence ?? 0.8,
    match_equipment_id: null,
    read_via: 'rules',
    claims: {
      descriptor: claim(r.descriptor), location: claim(r.location), area_served: claim(r.area_served),
    },
    disagreements: null, questions: null, verification: null,
    // Context the parser did not output, read from the sheet itself — never a
    // correction of parser content: the header labels, so the librarian can
    // connect a moved value to the COLUMN the machine mis-landed.
    reasoning: `replay@${COMMIT} · header: ${headerLabels.join(' | ')}`,
  }))
  const { error } = await svc.from('intake_rows').insert(payload)
  if (error) { console.error(`${f}: rows refused: ${error.message}`); process.exit(1) }
  staged += payload.length
  console.log(`staged ${f}: ${payload.length} rows`)
}
execSync(`git worktree remove --force "${WT}"`, { stdio: 'ignore' })
console.log(`\nCORPUS STAGED: ${staged} rows across ${FILES.length} uploads on "${PROJECT}"`)
console.log('cost: 0.0c over 0 model calls (rules leg only, as ruled)')
console.log('next: disposition through the review surface, sighted — then the librarian.')
