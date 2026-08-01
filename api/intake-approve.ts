// api/intake-approve — B3: the ONE place intake writes to the record.
//
//   POST { upload_id } → { created, enriched, queued_types, rules_applied, batch_id }
//
// Everything before this proposed. This disposes. It runs through the API path
// with the service role because it writes provenance (`import_batches`) and
// touches `equipment`, and it carries the resolve-and-refuse guard every importer
// in this repo carries.
//
// IDEMPOTENT BY CONSTRUCTION, not by care. A row that has already produced
// equipment carries `created_equipment_id`, and this only ever reads rows where
// that is null. Running it twice creates nothing the second time; so does
// re-uploading the same file, which is refused earlier by content hash.
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, AuthError } from './_shared/auth-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** The fields an ENRICH may fill. A row can only change what the reviewer ticked,
 *  and only these columns exist to be ticked. */
const ENRICH_COLS = ['descriptor', 'equipment_type', 'location', 'area_served'] as const

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const uploadId = String(req.body?.upload_id ?? '')
    if (!uploadId) return res.status(400).json({ error: 'upload_id is required' })

    const { data: up } = await service.from('intake_uploads')
      .select('id, project_id, filename, status, import_batch_id').eq('id', uploadId).maybeSingle()
    if (!up) return res.status(404).json({ error: 'No such upload.' })

    // RESOLVE AND REFUSE. The project comes from the upload row, never from the
    // request body — a caller cannot name a different project to write into.
    const { data: proj } = await service.from('projects')
      .select('id, name, com_number').eq('id', up.project_id).maybeSingle()
    if (!proj) return res.status(409).json({ error: 'The upload names a project that no longer exists.' })

    const { data: profile } = await service.from('user_profiles')
      .select('role').eq('id', user.userId).maybeSingle()
    if (!['admin', 'developer', 'owner', 'employee'].includes(profile?.role ?? '')) {
      return res.status(403).json({ error: 'Approving intake is a staff action.' })
    }

    // ── only settled rows that have not already been written ─────────────────
    // 'accepted' and 'edited' are both approvals; 'edited' just means the human
    // changed something first. 'pending' and 'rejected' are not approvals, and a
    // row already carrying created_equipment_id was written by an earlier run.
    const { data: rows, error: rErr } = await service.from('intake_rows')
      .select('*').eq('upload_id', uploadId)
      .in('disposition', ['accepted', 'edited'])
      .is('created_equipment_id', null)
      .order('source_sheet').order('source_row')
    if (rErr) return res.status(500).json({ error: rErr.message })

    if (!rows?.length) {
      // NOT AN ERROR, AND SAID PLAINLY. Re-approving a finished upload is the
      // normal way someone checks whether the first attempt worked.
      const { count: settled } = await service.from('intake_rows')
        .select('id', { count: 'exact', head: true })
        .eq('upload_id', uploadId).not('created_equipment_id', 'is', null)
      return res.status(200).json({
        created: 0, enriched: 0, queued_types: 0, rules_applied: 0,
        batch_id: up.import_batch_id,
        note: settled
          ? `Already approved — ${settled} row(s) were written previously. Nothing was duplicated.`
          : 'No accepted rows to approve. Rule on some rows first.',
      })
    }

    const creates = rows.filter(r => !r.match_equipment_id)
    const enriches = rows.filter(r => r.match_equipment_id)

    // ── provenance FIRST, so nothing is ever written unattributed ────────────
    const { data: batch, error: bErr } = await service.from('import_batches').insert({
      project_id: proj.id, entity_type: 'equipment',
      source_file: up.filename, rows_expected: rows.length, rows_created: 0,
      note: `Intake approval — ${creates.length} new, ${enriches.length} enrich`,
      created_by: user.userId,
    }).select('id').single()
    if (bErr) return res.status(500).json({ error: `provenance: ${bErr.message}` })

    // ── unknown types go to the RATIFICATION QUEUE, never minted ─────────────
    // The FK on equipment.equipment_type already makes minting impossible; this
    // is what keeps the name rather than losing it. Deduped against what the
    // queue already holds so re-approving does not pile up copies.
    // A row's FINAL type is what the reviewer left it as: their edit if they made
    // one, the proposal otherwise. Only rows that still resolve to nothing put a
    // name in the queue.
    const finalType = (r: any): string | null => r.edited?.proposed_type ?? r.proposed_type ?? null
    const observed = [...new Set(
      rows.filter(r => !finalType(r))
          .map(r => r.observed_type_name)
          .filter((n): n is string => !!n),
    )]

    let queuedTypes = 0
    if (observed.length) {
      const { data: existingQ } = await service.from('proposed_equipment_types')
        .select('observed_name').eq('project_id', proj.id).eq('status', 'proposed')
      const have = new Set((existingQ ?? []).map(q => q.observed_name.toUpperCase()))
      const fresh = observed.filter(n => !have.has(n.toUpperCase()))
      if (fresh.length) {
        const { error } = await service.from('proposed_equipment_types').insert(
          fresh.map(n => ({
            project_id: proj.id, observed_name: n, status: 'proposed',
            evidence: { source: 'intake', upload: up.filename, batch: batch.id },
          })))
        if (!error) queuedTypes = fresh.length
      }
    }

    // ── CREATE ───────────────────────────────────────────────────────────────
    const { data: maxRow } = await service.from('equipment')
      .select('sort_order').eq('project_id', proj.id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    let sort = (maxRow?.sort_order ?? 0)

    const created: { rowId: string; equipmentId: string }[] = []
    for (const r of creates) {
      const e = r.edited ?? {}
      const type = finalType(r)
      const { data: made, error } = await service.from('equipment').insert({
        project_id: proj.id,
        // NOT NULL, constrained to equipment|system. Intake creates equipment;
        // a system is a human's judgement about scope, not something a schedule
        // row asserts, so it is never inferred here.
        kind: 'equipment',
        tag: e.tag ?? r.tag ?? null,
        descriptor: e.descriptor ?? r.descriptor ?? null,
        category: r.proposed_category ?? null,
        equipment_type: type,
        location: e.location ?? r.location ?? null,
        area_served: e.area_served ?? r.area_served ?? null,
        // A schedule states DESIGN intent, so its columns land in `spec` — not in
        // `installed`, which is what somebody read off the nameplate on site.
        // Filing design values as installed would make the register claim a
        // verification nobody performed.
        nameplate_extra: r.nameplate ? { spec: r.nameplate, shop_drawing: {}, installed: {} } : null,
        sort_order: ++sort,
        import_batch_id: batch.id,
      }).select('id').single()
      if (error) {
        // Fail the row, not the run — and say which. Nineteen good rows should
        // not be lost to one bad one, and a silent skip would be worse than both.
        console.error('[intake-approve] create failed', r.tag, error.message)
        continue
      }
      created.push({ rowId: r.id, equipmentId: made.id })
      await service.from('intake_rows')
        .update({ created_equipment_id: made.id }).eq('id', r.id)
    }

    // ── ENRICH — only the ticked fields, never a blanket overwrite ───────────
    let enriched = 0
    for (const r of enriches) {
      const patch: Record<string, string> = {}
      const chosen = r.edited ?? {}
      // `edited` IS the approved change set. A row accepted with nothing ticked
      // would patch nothing, which is why the review screen turns that into a
      // rejection rather than letting it look like a change.
      for (const col of ENRICH_COLS) {
        const key = col === 'equipment_type' ? 'proposed_type' : col
        const v = chosen[key]
        if (v) patch[col] = v as string
      }
      if (!Object.keys(patch).length) continue
      const { error } = await service.from('equipment')
        .update(patch).eq('id', r.match_equipment_id)
      if (error) { console.error('[intake-approve] enrich failed', r.tag, error.message); continue }
      enriched++
      await service.from('intake_rows')
        .update({ created_equipment_id: r.match_equipment_id }).eq('id', r.id)
    }

    // ── the ratified rules apply to what just arrived ───────────────────────
    // New units land with honest denominators immediately. Without this the index
    // would show a fresh unit as owing every column of every stage, including the
    // ones a ratified rule already says do not apply to its type.
    let rulesApplied = 0
    const { error: applyErr } = await service.rpc('apply_applicability_rules', { pid: proj.id })
    if (applyErr) console.error('[intake-approve] rule application failed:', applyErr.message)
    else {
      const { count } = await service.from('cx_cell_applicability')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', proj.id).eq('source', 'rule')
      rulesApplied = count ?? 0
    }

    await service.from('import_batches')
      .update({ rows_created: created.length + enriched }).eq('id', batch.id)

    // The upload is APPROVED only when nothing is left pending. A partially ruled
    // upload stays open, because closing it would hide the rows nobody decided.
    const { count: stillPending } = await service.from('intake_rows')
      .select('id', { count: 'exact', head: true })
      .eq('upload_id', uploadId).eq('disposition', 'pending')
    await service.from('intake_uploads').update({
      import_batch_id: batch.id,
      status: stillPending ? 'reviewing' : 'approved',
    }).eq('id', uploadId)

    return res.status(200).json({
      created: created.length, enriched, queued_types: queuedTypes,
      rules_applied: rulesApplied, batch_id: batch.id,
      still_pending: stillPending ?? 0,
    })
  } catch (e: any) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message })
    console.error('[intake-approve]', e)
    return res.status(500).json({ error: 'Approval failed.' })
  }
}
