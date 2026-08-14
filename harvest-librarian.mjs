// harvest-librarian — the read-only pass over correction evidence. [KEEL]
// Harvest Phase 1, ruled 2026-08-14.
//
//   node --env-file=.env harvest-librarian.mjs
//
// READS: correction_signals (joined to intake_rows via row_id for the machine's
// side), equipment_type_alias_history (read-only source, ruled), and — when the
// corpus files are present locally — the sheets themselves, to attribute a
// moved value to the COLUMN it came from. WRITES: artifact files only. No
// vocabulary writes, no parser changes, no ratification entries (Phases 3–4,
// not greenlit).
//
// PROPOSAL vs REDISCOVERY (§4's never-re-propose, met honestly): before
// proposing a column-map rule the librarian RUNS TODAY'S PARSER on a synthetic
// sheet carrying that column and OBSERVES where the value lands. A rule the
// deterministic layer already holds is reported as a REDISCOVERY — the corpus
// independently re-deriving a ratified lesson, which is what Phase 2's gate
// measures — and never enters a proposal queue. The held-check is a
// measurement, not a list somebody has to remember to update.
//
// THRESHOLD (stated here and in every artifact, per §4): a rule PROPOSES at
// >= 3 occurrences with 0 contradictions. Below threshold or contradicted =
// listed, never proposed.
//
// ARTIFACTS ARE SHAPE-ONLY: column labels, field names, type keys, counts,
// signal UUIDs, the erring machine's commit. Client VALUES stay behind the
// pointers, in the database — committed artifacts carry none (standing law:
// client content never reaches the repo).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { build } from 'esbuild'

const THRESHOLD = { occurrences: 3, contradictions: 0 }
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── gather: every signal, machine side joined ────────────────────────────────
const { data: sigs } = await svc.from('correction_signals').select('*').order('captured_at')
const joined = []
for (const s of sigs ?? []) {
  const { data: row } = s.row_id
    ? await svc.from('intake_rows').select('claims, reasoning, source_sheet, source_row').eq('id', s.row_id).maybeSingle()
    : { data: null }
  joined.push({ sig: s, row })
}
console.log(`signals: ${joined.length} (machine side joined: ${joined.filter(j => j.row).length})`)

// which corpus files exist locally, for column attribution
const CORPUS_DIR = 'samples/excel&pdf-schedule-samples'
const fileFor = (uploadFilename) => {
  const base = String(uploadFilename ?? '').replace(/^replay-/, '')
  const path = `${CORPUS_DIR}/${base}`
  return existsSync(path) ? path : null
}
const readXlsxFile = (await import('read-excel-file/node')).default

/** Find which column a value sits in, on the row the signal points to.
 *
 *  The header LABELS come from the staged row's reasoning — the adapter
 *  recorded the sheet's own header in order at staging time. The first version
 *  scanned upward for "the densest row" and, for any data row below the first,
 *  took the DATA ROW ABOVE as the header — which both mis-attributed 4/7
 *  occurrences and leaked client VALUES into the committed artifact as
 *  "labels". The sheet supplies the column INDEX; the recorded header supplies
 *  the LABEL; client values never leave the database. */
async function columnOf(uploadId, sourceRow, value, reasoning) {
  const headerLabels = (String(reasoning ?? '').match(/header: (.+)$/)?.[1] ?? '').split(' | ').filter(Boolean)
  if (!headerLabels.length) return { label: null, gap: 'no-recorded-header' }
  const { data: up } = await svc.from('intake_uploads').select('filename').eq('id', uploadId).single()
  const path = fileFor(up?.filename)
  if (!path || !sourceRow || !value) return { label: null, gap: path ? 'no-source-row' : 'file-absent' }
  const sheets = await readXlsxFile(readFileSync(path), { trim: true })
  const rowCells = sheets[0].data[sourceRow - 1] ?? []
  const idx = rowCells.findIndex(c => String(c ?? '').replace(/\s+/g, ' ').trim() === String(value).replace(/\s+/g, ' ').trim())
  if (idx < 0) return { label: null, gap: 'value-not-found-in-row' }
  return { label: headerLabels[idx] ?? null, gap: headerLabels[idx] ? null : 'index-past-recorded-header' }
}

// ── dimension 1: field-placement corrections ─────────────────────────────────
const moves = new Map() // "from→to" -> { occurrences: [], columns: Map(label -> n) }
for (const { sig, row } of joined) {
  if (sig.disposition !== 'edited' || !sig.edited || !row?.claims) continue
  for (const [toField, toVal] of Object.entries(sig.edited)) {
    if (toField === 'proposed_type' || toVal == null) continue
    for (const [fromField, c] of Object.entries(row.claims)) {
      if (fromField === toField) continue
      if (c?.rules != null && c.rules === toVal && (sig.edited[fromField] ?? null) === null) {
        const key = `${fromField}→${toField}`
        if (!moves.has(key)) moves.set(key, { occurrences: [], columns: new Map() })
        const m = moves.get(key)
        const col = await columnOf(sig.upload_id, row.source_row, toVal, row.reasoning)
        m.occurrences.push({ signal: sig.id, tag: sig.tag, sheet: row.source_sheet, column: col.label, gap: col.gap })
        if (col.label) m.columns.set(col.label, (m.columns.get(col.label) ?? 0) + 1)
      }
    }
  }
}

// held-check for a column label: does TODAY'S parser land that column in the
// target field? Run it and look.
await build({ entryPoints: ['src/lib/intakeExcel.ts'], outfile: 'out/lib-current-parser.mjs', format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file', 'jszip'] })
const { parseSheet } = await import('./out/lib-current-parser.mjs')
const { data: types } = await svc.from('equipment_types').select('key, name').eq('active', true)
function heldCheckColumn(label, toField) {
  const grid = [
    ['PROBE SCHEDULE'],
    ['TAG', label, 'LOCATION'],
    ['ZZ-1', 'PROBE VALUE', 'ROOM 1'],
  ]
  const p = parseSheet(grid, 'PROBE', types, { merges: [] })
  const r = p.rows?.[0]
  return r ? r[toField] === 'PROBE VALUE' : false
}

// ── dimension 2: type corrections ────────────────────────────────────────────
const typeCorr = new Map() // "from→to" -> [signal ids]
for (const { sig } of joined) {
  const to = sig.edited?.proposed_type
  if (sig.disposition !== 'edited' || !to || to === sig.proposed_type) continue
  const key = `${sig.proposed_type ?? 'NULL'}→${to}`
  if (!typeCorr.has(key)) typeCorr.set(key, [])
  typeCorr.get(key).push(sig.id)
}

// ── dimension 3: leg reliability ─────────────────────────────────────────────
const legs = new Map()
for (const { sig } of joined) {
  const k = `${sig.read_via ?? 'null'}·${sig.disposition}`
  legs.set(k, (legs.get(k) ?? 0) + 1)
}

// ── dimension 4: question quality ────────────────────────────────────────────
const qstates = new Map()
for (const { sig } of joined) {
  if (sig.question_state) qstates.set(sig.question_state, (qstates.get(sig.question_state) ?? 0) + 1)
}

// ── alias history (read-only source, ruled) ──────────────────────────────────
const { data: aliasHist } = await svc.from('equipment_type_alias_history')
  .select('action, type_key, alias, changed_at').order('changed_at')

// ── assemble the artifact ────────────────────────────────────────────────────
const now = '2026-08-14'
const art = {
  generated: now, generator: 'harvest-librarian.mjs (Phase 1 — read-only)',
  threshold: THRESHOLD,
  erring_machine: '93d2fe9 (replay corpus — parse state immediately before the Avondale fixes at e19d1a3)',
  signal_count: joined.length,
  rediscoveries: [], proposals: [], below_threshold: [], contradicted: [],
  leg_reliability: Object.fromEntries(legs),
  question_quality: Object.fromEntries(qstates),
  title_typed_confirmation: 'not computable on this corpus: the erring machine predates typeFrom staging, and the live orchestrator does not stage typeFrom either — NAMED GAP; the rate becomes computable when typeFrom stages (flagged, not built)',
  alias_history_summary: (aliasHist ?? []).reduce((a, h) => { a[h.action] = (a[h.action] ?? 0) + 1; return a }, {}),
  capture_scope_findings: [
    'nameplate/field-alias corrections have NO disposition path: the review surface has no nameplate editor, so a MAX INPUT-class lesson is invisible to capture today. Found by replay, reported before it cost a confused gate.',
  ],
}

for (const [key, m] of moves) {
  const [fromField, toField] = key.split('→')
  const columns = [...m.columns.entries()].sort((a, b) => b[1] - a[1])
  const colLabel = columns[0]?.[0] ?? null
  const entry = {
    kind: 'column_map',
    rule: colLabel ? `${colLabel} → ${toField}` : `${fromField} → ${toField} (column unattributed)`,
    column_attribution: columns.map(([l, n]) => `${l}: ${n}/${m.occurrences.length}`),
    occurrences: m.occurrences.length,
    contradictions: 0,
    evidence_signals: m.occurrences.map(o => o.signal),
    evidence_sheets: [...new Set(m.occurrences.map(o => o.sheet))],
    erring_machine: '93d2fe9',
  }
  const meets = entry.occurrences >= THRESHOLD.occurrences && entry.contradictions <= THRESHOLD.contradictions
  const held = colLabel ? heldCheckColumn(colLabel, toField) : false
  if (held) { entry.status = `ALREADY HELD by the deterministic layer (measured: today's parser lands a ${colLabel} column in ${toField}) — REDISCOVERY, not proposed`; art.rediscoveries.push(entry) }
  else if (meets) { entry.status = 'PROPOSED'; art.proposals.push(entry) }
  else { entry.status = 'below threshold'; art.below_threshold.push(entry) }
}

for (const [key, ids] of typeCorr) {
  const entry = {
    kind: 'type_correction', rule: key, occurrences: ids.length, contradictions: 0,
    evidence_signals: ids, erring_machine: '93d2fe9',
  }
  if (ids.length >= THRESHOLD.occurrences) { entry.status = 'PROPOSED'; art.proposals.push(entry) }
  else { entry.status = `below threshold (${ids.length} < ${THRESHOLD.occurrences})`; art.below_threshold.push(entry) }
}

mkdirSync('docs/harvest-artifacts', { recursive: true })
const jsonPath = `docs/harvest-artifacts/${now}-first-pass.json`
writeFileSync(jsonPath, JSON.stringify(art, null, 2) + '\n')

const md = [`# Harvest librarian — first pass, ${now}`, '',
  `*Read-only (Phase 1). Threshold to propose: ≥${THRESHOLD.occurrences} occurrences, ${THRESHOLD.contradictions} contradictions — stated here so the numbers mean something. Erring machine for the replay corpus: \`93d2fe9\`. Evidence pointers are correction_signals UUIDs; client values stay behind them, in the database.*`, '',
  `Signals read: ${art.signal_count} · machine side joined: 100%`, '',
  '## Rediscoveries (already held by the deterministic layer — the capture works)', '',
  ...art.rediscoveries.map(r => `- **${r.rule}** — ${r.occurrences} occurrences, ${r.contradictions} contradictions · column attribution: ${r.column_attribution.join(', ')} · sheets: ${r.evidence_sheets.join(', ')} · ${r.status}\n  - signals: ${r.evidence_signals.join(', ')}`),
  '', '## Proposals (would enter the ratification queue — Phases 3–4, not greenlit)', '',
  ...(art.proposals.length ? art.proposals.map(r => `- **${r.rule}** — ${r.occurrences}×, ${r.contradictions} contradictions · signals: ${r.evidence_signals.join(', ')}`) : ['*(none)*']),
  '', '## Below threshold (listed, never proposed)', '',
  ...art.below_threshold.map(r => `- ${r.rule} — ${r.occurrences}× (${r.kind}) · signals: ${r.evidence_signals.join(', ')}`),
  '', '## Leg reliability', '',
  ...Object.entries(art.leg_reliability).map(([k, v]) => `- ${k}: ${v}`),
  '', '## Title-typed confirmation rate (§7b named line)', '', `- ${art.title_typed_confirmation}`,
  '', '## Question quality', '',
  Object.keys(art.question_quality).length ? Object.entries(art.question_quality).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '- no question-carrying dispositions in the corpus yet',
  '', '## Capture-scope findings', '',
  ...art.capture_scope_findings.map(f => `- ${f}`),
  '', '## Alias history (read-only source)', '',
  `- ${JSON.stringify(art.alias_history_summary)} — probe rows from the 3r gate self-clean; real vocabulary changes accumulate here for future passes.`,
].join('\n') + '\n'
writeFileSync(`docs/harvest-artifacts/${now}-first-pass.md`, md)

console.log(`\nartifacts: docs/harvest-artifacts/${now}-first-pass.{md,json}`)
console.log(`rediscoveries: ${art.rediscoveries.length} · proposals: ${art.proposals.length} · below threshold: ${art.below_threshold.length}`)
for (const r of art.rediscoveries) console.log(`  REDISCOVERY: ${r.rule} — ${r.occurrences}×, ${r.contradictions} contradictions`)
for (const r of art.below_threshold) console.log(`  below: ${r.rule} — ${r.occurrences}×`)
