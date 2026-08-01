// api/extract-page — the extractor's one action: read ONE page into staged rows.
//
//   POST { upload_id } → { rows, page_note, usage }
//
// ONE PAGE PER REQUEST, and that is a measured decision rather than a style.
// The classifier taught it the expensive way: a question with no natural
// stopping point expands to fill whatever budget it is given, and the platform
// kills a function at 60s regardless. A page is a bounded question — this many
// rows, these columns — so it answers and stops. A caller with twenty pages
// makes twenty requests.
//
// NOTHING IS APPLIED. Rows land in intake_rows for the review screen. Law 2.
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, AuthError } from './_shared/auth-common.js'
import { runAgent, logAgentRun, AiError } from './_shared/ai-common.js'
import type { ExtractorOutput } from './_shared/agent-schemas.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MEDIA: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const uploadId = String(req.body?.upload_id ?? '')
    if (!uploadId) return res.status(400).json({ error: 'upload_id is required' })

    const { data: up } = await service.from('intake_uploads')
      .select('id, project_id, filename, storage_path, kind, status').eq('id', uploadId).maybeSingle()
    if (!up) return res.status(404).json({ error: 'No such upload.' })

    // A CLEAN SPREADSHEET NEVER REACHES THIS AGENT. The deterministic path is
    // more accurate, free, and reproducible; spending a model call on a parseable
    // file is cost without accuracy. Refusing here rather than in a comment means
    // it cannot happen by accident from some future caller.
    if (up.kind === 'excel') {
      return res.status(400).json({
        error: 'Excel is read deterministically and never sent to a model. ' +
               'This upload was already parsed on the client.',
      })
    }

    // Membership, not just authentication.
    const { data: profile } = await service.from('user_profiles')
      .select('role').eq('id', user.userId).maybeSingle()
    const isStaff = ['admin', 'developer', 'owner', 'employee'].includes(profile?.role ?? '')
    if (!isStaff) return res.status(403).json({ error: 'Intake extraction is a staff action.' })

    // ── the page itself ───────────────────────────────────────────────────────
    const dl = await service.storage.from('intake-files').download(up.storage_path)
    if (dl.error || !dl.data) {
      return res.status(502).json({ error: `Could not read the stored file: ${dl.error?.message}` })
    }
    const bytes = Buffer.from(await dl.data.arrayBuffer())
    const ext = (up.filename.split('.').pop() ?? '').toLowerCase()
    const mediaType = MEDIA[ext]
    if (!mediaType) {
      return res.status(400).json({
        error: `Cannot extract from a .${ext} page. Supported: ${Object.keys(MEDIA).join(', ')}.`,
      })
    }

    // ── the vocabulary the agent must key its answer to ──────────────────────
    const { data: types } = await service.from('equipment_types')
      .select('key, name').eq('active', true).order('key')
    const knownTypes = (types ?? []).map(t => `${t.key} (${t.name})`)
    if (!knownTypes.length) {
      // LAW 9 AT THE SEAM. proposed_type is FK-constrained to this vocabulary, so
      // an empty one makes every row unresolvable — the agent would be asked for
      // a key nothing could supply, and would answer anyway. That is a
      // misconfiguration, and it fails loudly rather than returning 200 rows of
      // "unknown type".
      return res.status(500).json({
        error: 'No active equipment types are configured, so no row could resolve a type.',
      })
    }

    const input = {
      source_kind: (up.kind === 'image' ? 'image' : 'pdf') as 'image' | 'pdf',
      page: Number(req.body?.page ?? 1),
      has_image: true,
      known_types: knownTypes,
    }

    const run = await runAgent<ExtractorOutput>('extractor', input, {
      task: [
        'Read this page of an equipment schedule and propose register rows.',
        '',
        'Return ONE ROW PER PIECE OF EQUIPMENT the page lists. Use the page\'s own',
        'column headings and its title; do not infer a type from a tag prefix.',
        '',
        'proposed_type MUST be one of the known_types keys, or null. Null plus a',
        'low confidence is the right answer where the page does not say — it routes',
        'to a human, which is cheaper than a confident mistake.',
        '',
        'Put every column you cannot map into `nameplate` under the page\'s own',
        'heading. A column nobody anticipated is still something an engineer wrote',
        'down on purpose.',
      ].join('\n'),
      images: [{ base64: bytes.toString('base64'), mediaType }],
    })

    // EVERY OUTCOME IS LOGGED, not just the successes. Six invisible classifier
    // failures cost $1.58 while looking like nothing had happened; this call sits
    // before the failure branch for exactly that reason.
    await logAgentRun(service, {
      agentKey: 'extractor', feature: 'intake:extract-page',
      projectId: up.project_id, runId: uploadId,
      run, createdBy: user.userId,
    })

    if (!run.ok) {
      await service.from('intake_uploads')
        .update({ status: 'failed', parse_note: `extractor: ${run.failure}` }).eq('id', uploadId)
      return res.status(502).json({
        error: 'The page could not be read into rows. Nothing was staged.',
        failure: run.failure,
      })
    }

    // ok:true does not narrow `value` on this union, and a cast would paper over
    // a case that can really happen. Fail closed instead — an extraction with no
    // payload staged nothing, and saying so beats a crash on `.rows`.
    const out = run.value
    if (!out) {
      return res.status(502).json({ error: 'The extractor returned no payload. Nothing was staged.' })
    }

    // ── stage, with the same enrich and duplicate detection as the Excel path ──
    // The rules live in ONE place conceptually and are applied identically here:
    // a row whose tag exists is an enrich proposal, and a tag repeated within the
    // upload is flagged rather than dropped. A second intake path with different
    // safety rules would be a second set of bugs.
    const { data: existing } = await service.from('equipment')
      .select('id, tag').eq('project_id', up.project_id)
    const byTag = new Map((existing ?? []).map(e => [e.tag.toUpperCase(), e.id]))

    const { data: already } = await service.from('intake_rows')
      .select('id, tag').eq('upload_id', uploadId)
    const firstByTag = new Map<string, string>()
    for (const r of already ?? []) if (r.tag) firstByTag.set(r.tag.toUpperCase(), r.id)

    const payload = (out.rows ?? []).map(r => {
      const key = (r.tag ?? '').toUpperCase()
      return {
        upload_id: uploadId, project_id: up.project_id,
        source_page: input.page, source_row: r.source_row ?? null,
        tag: r.tag ?? null, descriptor: r.descriptor ?? null,
        proposed_category: r.proposed_category ?? null,
        // The FK is the guarantee, but a value the model invented would fail the
        // insert and lose the whole page. Check it here so an unrecognised type
        // degrades to "unknown" — which the review screen already handles — rather
        // than throwing away nineteen good rows alongside the bad one.
        proposed_type: r.proposed_type && knownTypes.some(k => k.startsWith(`${r.proposed_type} `))
          ? r.proposed_type : null,
        observed_type_name: r.proposed_type && !knownTypes.some(k => k.startsWith(`${r.proposed_type} `))
          ? r.proposed_type : (r.descriptor ?? null),
        location: r.location ?? null, area_served: r.area_served ?? null,
        nameplate: r.nameplate ?? null,
        confidence: r.confidence,
        match_equipment_id: key ? byTag.get(key) ?? null : null,
      }
    })

    const { data: inserted, error: insErr } = await service.from('intake_rows')
      .insert(payload).select('id, tag')
    if (insErr) return res.status(500).json({ error: insErr.message })

    // duplicate_of in a second pass — the ids only exist after the insert.
    for (const row of inserted ?? []) {
      const key = (row.tag ?? '').toUpperCase()
      if (!key) continue
      const first = firstByTag.get(key)
      if (first) await service.from('intake_rows').update({ duplicate_of: first }).eq('id', row.id)
      else firstByTag.set(key, row.id)
    }

    const { count } = await service.from('intake_rows')
      .select('id', { count: 'exact', head: true }).eq('upload_id', uploadId)
    await service.from('intake_uploads').update({
      status: 'parsed', row_count: count ?? 0,
      parse_note: out.page_note ?? null,
    }).eq('id', uploadId)

    return res.status(200).json({
      rows: inserted?.length ?? 0,
      page_note: out.page_note ?? null,
      usage: { input: run.usage?.inputTokens, output: run.usage?.outputTokens },
    })
  } catch (e: any) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message })
    if (e instanceof AiError)   return res.status(e.status).json({ error: e.message })
    console.error('[extract-page]', e)
    return res.status(500).json({ error: 'Extraction failed. Nothing was staged.' })
  }
}
