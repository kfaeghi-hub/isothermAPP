// intakeOrchestrator — the browser drives the pipeline, one sheet at a time.
// [KEEL] Phase 5a.
//
// WHY THE BROWSER ORCHESTRATES, stated as the measurement that forced it. A single
// sheet takes 20–105s through the model leg; a chunked 18-band sheet or a
// multi-sheet workbook cannot clear `api/intake.ts`'s 300s ceiling; and the worst
// case for ONE call — the content retry and the transport retry both exhausting
// the 240s backstop — is 1,440s, 4.8× over.
//
// So no server invocation ever carries more than one sheet's (or one band's) retry
// budget. **The 1,440s worst case is dissolved, not mitigated** — nothing here
// loops inside a lambda, so it cannot be reached.
//
// The browser is also the only place that already has the file, so the rules leg
// parses locally, reconciliation runs locally through the shared module, and the
// API holds only what the API key requires.
//
// PREVIEW-BEFORE-DISPOSITION, and the reinterpretation is recorded rather than
// assumed. See the note in IntakeUpload.tsx's header.
//
// PROGRESSIVE STAGING CREATES AN INTERRUPTED RUN, so an interrupted run is a
// first-class state here: `status: 'reading'` on the upload, sheets recorded as
// they complete, and a resume that skips what is already staged.

import { supabase } from './supabase'
import { authedFetch } from './api'
import type { Cell, ParsedSheet, MergeRange } from './intakeExcel'
import { reconcileSheet, type MergedRow, type ReadRow } from './reconcile'
import { planBands, sliceBands, assembleBands } from './sheetBands'
import { runBounded, isBackPressure } from './bounded'

export interface SheetInput {
  name: string
  grid: Cell[][]
  merges: MergeRange[]
  parsed: ParsedSheet
}

export type Phase = 'reading' | 'reconciling' | 'verifying' | 'staging' | 'done' | 'failed' | 'skipped'

export interface Progress {
  sheet: string
  index: number
  total: number
  phase: Phase
  band?: { n: number; of: number }
  rowsStaged: number
  costCents: number
  note?: string
}

export interface OrchestratorResult {
  uploadId: string
  sheetsDone: number
  sheetsTotal: number
  rowsStaged: number
  costCents: number
  calls: number
  failures: { sheet: string; why: string }[]
  resumed: boolean
}

const cap = (n: number) => Math.round(n * 100) / 100

/**
 * Is there a partially-read upload for these exact bytes?
 *
 * THE CONTENT HASH IS THE RESUME KEY, per the ruling. Re-presenting the same file
 * offers to resume rather than starting a second run — which is the same reasoning
 * the idempotency check already used, extended to the state progressive staging
 * created.
 */
export async function findResumable(projectId: string, hash: string) {
  const { data } = await supabase.from('intake_uploads')
    .select('id, filename, uploaded_at, status, row_count')
    .eq('project_id', projectId).eq('content_sha256', hash)
    .order('uploaded_at', { ascending: false }).limit(1)
  const u = data?.[0]
  if (!u) return null
  const { data: done } = await supabase.from('intake_rows')
    .select('source_sheet').eq('upload_id', u.id)
  const sheets = [...new Set((done ?? []).map(r => r.source_sheet).filter(Boolean))] as string[]
  return { upload: u, stagedSheets: sheets, partial: u.status === 'reading' }
}

/**
 * DISCARD A PARTIAL AS A UNIT.
 *
 * Staging may actually delete — these rows are proposals that nothing consumes and
 * no record depends on — but only through an EXPLICIT USER ACT, never a timeout.
 * A half-populated upload that expires on its own is a mystery; one a person threw
 * away is a decision.
 */
export async function discardUpload(uploadId: string): Promise<{ rows: number }> {
  const { data: removed } = await supabase.from('intake_rows')
    .delete().eq('upload_id', uploadId).select('id')
  await supabase.from('intake_uploads').delete().eq('id', uploadId)
  return { rows: (removed ?? []).length }
}

/** The claims worth verifying: identity and the spec values that carry weight. */
function claimsFor(rows: MergedRow[]): { tag: string; field: string; value: string }[] {
  const out: { tag: string; field: string; value: string }[] = []
  for (const r of rows.slice(0, 12)) {
    if (r.proposed_type) out.push({ tag: r.tag, field: 'type', value: r.proposed_type })
    for (const [k, v] of Object.entries(r.nameplate).slice(0, 3)) {
      out.push({ tag: r.tag, field: k, value: String(v) })
    }
  }
  return out.slice(0, 40)
}

/**
 * Run one sheet: model read (banded where needed) → reconcile → verify → stage.
 *
 * Returns the rows it staged. Every model call is ONE request carrying ONE grid.
 */
async function runSheet(
  s: SheetInput, ctx: { uploadId: string; projectId: string; matches: Map<string, string> },
  emit: (p: Partial<Progress>) => void,
): Promise<{ rows: number; cost: number; calls: number; failure?: string }> {
  const plan = planBands(s.grid, s.parsed.header_row ?? 1)
  const bands = sliceBands(s.grid, plan)
  let cost = 0, calls = 0
  const readBands: { rows: ReadRow[] }[] = []
  const ambiguities: { about: string; question: string; where?: string }[] = []

  // BOUNDED PARALLELISM — three bands in flight, and the FIRST 429 collapses the
  // rest of the sheet to sequential. The transport retry handles a transient; a
  // 429 is not a transient, it is the service saying the rate is wrong, and
  // retrying into it is arguing. Ruled 2026-08-12.
  let done = 0
  const bandResult = await runBounded(bands.map((b, i) => async () => {
    emit({ phase: 'reading', band: { n: ++done, of: bands.length } })
    const res = await authedFetch('/api/intake', {
      action: 'read-sheet', project_id: ctx.projectId,
      sheet: bands.length > 1 ? `${s.name} (rows ${b.from}-${b.to})` : s.name,
      grid: b.rows, merges: i === 0 ? s.merges : [],
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(body?.error ?? `HTTP ${res.status}`)
      // Back-pressure must REACH runBounded to trip the throttle; every other
      // failure is a hole in this band and nothing more.
      if (isBackPressure(err) || res.status === 429 || res.status === 503) throw err
      return { rows: [] as ReadRow[], ambiguities: [], cost: Number(body?.cost ?? 0) }
    }
    return {
      rows: (body.rows ?? []) as ReadRow[],
      ambiguities: (body.ambiguities ?? []) as { about: string; question: string; where?: string }[],
      cost: Number(body?.cost ?? 0),
    }
  }), bands.length > 1 ? 3 : 1, () => emit({ phase: 'reading', note: 'rate limited — the rest of this sheet reads one at a time' }))

  calls += bands.length
  for (const r of bandResult.results) {
    // A BAND THAT FAILED IS A HOLE, NAMED BY THE ASSEMBLY COUNT. Losing one band
    // of eighteen is a shortfall; abandoning the sheet loses seventeen good bands
    // to one bad one.
    readBands.push({ rows: r?.rows ?? [] })
    if (r) { ambiguities.push(...r.ambiguities); cost += r.cost }
  }
  if (bands.length > 1) {
    const seq = bandResult.durations.reduce((a, b) => a + b, 0)
    emit({ phase: 'reading', note: `${bands.length} bands · ${(seq / 1000).toFixed(0)}s of work` +
      (bandResult.throttledAt !== null ? ` · throttled at band ${bandResult.throttledAt + 1}` : '') })
  }

  const assembled = assembleBands(readBands)

  emit({ phase: 'reconciling' })
  const merged = reconcileSheet(
    s.parsed.rows.map(r => ({
      tag: r.tag, descriptor: r.descriptor, location: r.location,
      area_served: r.area_served, proposed_type: r.proposed_type,
      nameplate: r.nameplate, confidence: r.confidence,
    })),
    assembled.rows.length ? assembled.rows : null,
    ambiguities,
  )

  // ── verification, one call, fail-closed ───────────────────────────────────
  emit({ phase: 'verifying' })
  let verification: unknown = null
  const claims = claimsFor(merged.rows)
  if (claims.length) {
    const vres = await authedFetch('/api/intake', {
      action: 'verify-sheet', sheet: s.name, grid: s.grid, merges: s.merges,
      claims, claimed_units: merged.rows.length,
    })
    calls++
    const v = await vres.json().catch(() => null)
    // `ran: false` is a verification that DID NOT RUN. It is stored as such —
    // never as an empty pass.
    verification = vres.ok ? v : { ran: false, failure: `http-${vres.status}` }
  }

  // ── stage, with all six provenance columns ────────────────────────────────
  emit({ phase: 'staging' })
  const payload = merged.rows.map(r => ({
    upload_id: ctx.uploadId, project_id: ctx.projectId,
    source_sheet: s.name,
    tag: r.tag || null, descriptor: r.descriptor,
    proposed_category: s.parsed.proposed_category,
    proposed_type: r.proposed_type,
    observed_type_name: r.proposed_type ? null : (r.descriptor ?? null),
    location: r.location, area_served: r.area_served,
    nameplate: Object.keys(r.nameplate).length ? r.nameplate : null,
    confidence: r.confidence,
    match_equipment_id: r.tag ? ctx.matches.get(r.tag.toUpperCase()) ?? null : null,
    read_via: r.seenBy,
    claims: r.claims,
    disagreements: r.disagreements.length ? r.disagreements : null,
    questions: merged.ambiguities.length ? merged.ambiguities : null,
    verification,
    reasoning: null,
  }))

  if (!payload.length) return { rows: 0, cost, calls }

  const { data: inserted, error } = await supabase.from('intake_rows')
    .insert(payload).select('id, tag')
  if (error) return { rows: 0, cost, calls, failure: error.message }

  // DUPLICATE_OF, PER SHEET, keyed tag + occurrence per the merge-key law. It runs
  // against the rows just staged for THIS sheet rather than the whole upload,
  // because a tag repeating across two sheets is two schedules naming a unit, not
  // one schedule repeating itself.
  const firstByTag = new Map<string, string>()
  for (const row of inserted ?? []) {
    const key = (row.tag ?? '').toUpperCase()
    if (!key) continue
    const first = firstByTag.get(key)
    if (first) await supabase.from('intake_rows').update({ duplicate_of: first }).eq('id', row.id)
    else firstByTag.set(key, row.id)
  }

  return { rows: (inserted ?? []).length, cost, calls }
}

/**
 * The whole run. Sheets are staged AS THEY COMPLETE, so a closed tab resumes from
 * staged state rather than restarting.
 */
export async function runIntake(input: {
  projectId: string
  uploadId: string
  sheets: SheetInput[]
  matches: Map<string, string>
  skipSheets?: string[]
}, onProgress: (p: Progress) => void): Promise<OrchestratorResult> {
  const skip = new Set(input.skipSheets ?? [])
  let rowsStaged = 0, costCents = 0, calls = 0, sheetsDone = 0
  const failures: { sheet: string; why: string }[] = []

  for (let i = 0; i < input.sheets.length; i++) {
    const s = input.sheets[i]
    const emit = (p: Partial<Progress>) => onProgress({
      sheet: s.name, index: i + 1, total: input.sheets.length,
      phase: 'reading', rowsStaged, costCents: cap(costCents), ...p,
    })

    if (skip.has(s.name)) { sheetsDone++; emit({ phase: 'skipped', note: 'already staged' }); continue }

    try {
      const r = await runSheet(s, { uploadId: input.uploadId, projectId: input.projectId, matches: input.matches }, emit)
      rowsStaged += r.rows; costCents += r.cost; calls += r.calls
      if (r.failure) failures.push({ sheet: s.name, why: r.failure })
      sheetsDone++
      emit({ phase: 'done', rowsStaged, costCents: cap(costCents) })
    } catch (e) {
      failures.push({ sheet: s.name, why: e instanceof Error ? e.message : String(e) })
      emit({ phase: 'failed', note: e instanceof Error ? e.message : String(e) })
    }
  }

  // The upload closes as `parsed` only when every sheet was accounted for. A run
  // that lost sheets stays visibly incomplete rather than reporting success.
  await supabase.from('intake_uploads').update({
    status: failures.length ? 'reading' : 'parsed',
    row_count: rowsStaged,
    parse_note: `${sheetsDone}/${input.sheets.length} sheets · ${rowsStaged} rows · ` +
      `${cap(costCents)}c over ${calls} model call(s)` +
      (failures.length ? ` · INCOMPLETE: ${failures.map(f => f.sheet).join(', ')}` : ''),
  }).eq('id', input.uploadId)

  return {
    uploadId: input.uploadId, sheetsDone, sheetsTotal: input.sheets.length,
    rowsStaged, costCents: cap(costCents), calls, failures, resumed: skip.size > 0,
  }
}
