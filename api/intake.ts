// api/intake -- the intake feature's ONE endpoint: read a page, or approve rows.
//
//   POST { upload_id, action: 'extract' }  -> { rows, page_note, usage }
//   POST { upload_id, action: 'approve' }  -> { created, enriched, queued_types, ... }
//   POST { action: 'draft-field-set', type_key }
//                                          -> { fields, note, usage }   (1.02)
//   POST { action: 'find-pages', pages: [{ page, text_excerpt?, image_base64? }] }
//                                          -> { sorted, usage }         (1.02)
//
// TWO ACTIONS, ONE FUNCTION, AND THE MERGE WAS FORCED BEFORE IT WAS CHOSEN.
// This plan accepts 12 serverless functions. A thirteenth BUILDS cleanly -- 54
// seconds, every asset emitted, no error -- and then fails at "Deploying
// outputs" with no message naming the limit. Worth writing down, because the
// symptom looks nothing like the cause: a green build, an unchanged bundle, and
// endpoints that answer 404 while the previous deployment keeps serving.
//
// Diagnosis: the GitHub deployments API carries the Vercel status, so
//   curl .../deployments -> latest id -> /statuses
// gives the failure and the `npx vercel inspect <dpl> --logs` command for it.
// That is the route when the Vercel connector is not available.
//
// Having been forced to look, the merge is the better shape anyway. Both actions
// resolve the same upload, apply the same resolve-and-refuse guard, and require
// the same staff role -- that preamble now exists once instead of twice.
//
// NEITHER ACTION IS AUTONOMOUS. `extract` proposes rows into intake_rows;
// `approve` writes only rows a human already ruled on. Law 2 holds across both.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, AuthError } from './_shared/auth-common.js'
import { matchScheduleSpec, type DeclaredField } from './_shared/schedule-field-match.js'
import { runAgent, logAgentRun, AiError } from './_shared/ai-common.js'
import { checkExtraction, describeProblems } from './_shared/extract-contract.js'
import { readSheetWithModel, costCents } from './_shared/sheet-model-read.js'
import { verifyExtraction } from './_shared/verify-extraction.js'
import { sniffMediaType, describeBytes } from './_shared/media-type.js'
import type { ExtractorOutput, FieldSetDraftInput, FieldSetDraftOutput,
  PageSortInput, PageSortOutput } from './_shared/agent-schemas.js'

const ACTIONS = ['extract', 'approve', 'draft-field-set', 'find-pages',
                 'read-sheet', 'verify-sheet']

/** One pass sorts at most this many undecided pages. A drawing set is allowed to
 *  be enormous; a single model call is not. Over the ceiling the user is TOLD,
 *  with the pre-extracted-pages path named as the alternative — never truncated
 *  quietly, which would read as "we looked at all of it". */
const PAGE_SORT_CEILING = 40

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// The extension->media map is GONE. `sniffMediaType` reads the bytes instead;
// see api/_shared/media-type.ts and R18. Nothing in this file may decide what a
// file is from what it is called.

/** The fields an ENRICH may fill. A row changes only what the reviewer ticked. */
const ENRICH_COLS = ['descriptor', 'equipment_type', 'location', 'area_served'] as const

/**
 * Storage read with bounded retry.
 *
 * Returns the supabase shape plus `attempts` and `retryable`, so the caller can
 * both report how hard it tried and distinguish "the object would not come" from
 * "the object is not there".
 *
 * NOT a general retry wrapper: it is deliberately scoped to this one read,
 * because this read is the one that is provably flaky and provably safe to
 * repeat. A retry on a write, or on a call with side effects, is a different
 * decision and should be made separately.
 */
async function downloadWithRetry(service: any, path: string, tries = 3) {
  const RETRYABLE = /timeout|timed out|gateway|temporarily|unavailable|502|503|504|econnreset|socket hang up|fetch failed/i
  let last: any = null
  for (let attempt = 1; attempt <= tries; attempt++) {
    const r = await service.storage.from('intake-files').download(path)
    if (!r.error && r.data) return { data: r.data, error: null, attempts: attempt, retryable: false }
    last = r.error
    const status = Number(r.error?.statusCode ?? r.error?.status ?? 0)
    const retryable = (status >= 500 && status <= 599) || RETRYABLE.test(String(r.error?.message ?? ''))
    if (!retryable) {
      console.log(`[intake] storage read failed permanently (attempt ${attempt}, status ${status || '?'}): ${r.error?.message}`)
      return { data: null, error: r.error, attempts: attempt, retryable: false }
    }
    console.log(`[intake] storage read attempt ${attempt}/${tries} failed (${r.error?.message}) — retrying`)
    if (attempt < tries) await new Promise(r2 => setTimeout(r2, attempt * 400))
  }
  return { data: null, error: last, attempts: tries, retryable: true }
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const uploadId = String(req.body?.upload_id ?? '')
    const action = String(req.body?.action ?? '')
    if (!ACTIONS.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${ACTIONS.join(', ')}` })
    }

    const isStaff = async () => {
      const { data: p } = await service.from('user_profiles')
        .select('role').eq('id', user.userId).maybeSingle()
      return ['admin', 'developer', 'owner', 'employee'].includes(p?.role ?? '')
    }

    // == READ SHEET (5a) ======================================================
    //
    // ONE SHEET, OR ONE BAND, PER INVOCATION — and that is the whole architecture,
    // not an optimisation. Measured before this existed: one sheet takes 20-105s,
    // and a chunked 18-band sheet or a multi-sheet workbook cannot clear this
    // function's 300s ceiling. Worst case for a single call, with the content
    // retry and the transport retry both exhausting the 240s backstop, is 1,440s.
    //
    // The browser orchestrates instead. It holds the file, parses the rules leg
    // locally, and calls this once per sheet — so NO INVOCATION EVER CARRIES MORE
    // THAN ONE SHEET'S RETRY BUDGET. The 1,440s worst case is dissolved rather
    // than mitigated: it can no longer be reached, because nothing here loops.
    //
    // THE GRID ARRIVES AS DATA. This endpoint never opens a workbook — it cannot,
    // without a runtime import from api/ into src/lib that has never been proven
    // to work on Vercel and that the pw-extractor incident says would fail. The
    // caller sends the grid and the merge extents it already has, and the API
    // holds only what the API key requires.
    if (action === 'read-sheet') {
      if (!(await isStaff())) return res.status(403).json({ error: 'Intake is a staff action.' })

      const grid = req.body?.grid
      const sheet = String(req.body?.sheet ?? '').trim()
      if (!Array.isArray(grid) || !grid.length) {
        return res.status(400).json({ error: 'grid is required and must be a non-empty array of rows.' })
      }
      if (!sheet) return res.status(400).json({ error: 'sheet is required.' })
      const merges = Array.isArray(req.body?.merges) ? req.body.merges : []

      const { data: types } = await service.from('equipment_types')
        .select('key, name').eq('active', true).order('key')
      const knownTypes = (types ?? []).map(t => `${t.key} (${t.name})`)
      if (!knownTypes.length) {
        return res.status(500).json({ error: 'No active equipment types are configured, so no row could resolve a type.' })
      }

      // THE SAME FUNCTION THE BENCH CALLS. One reading path, two callers — the
      // request is the same bytes because it is built by the same code.
      const r = await readSheetWithModel({ grid, sheetName: sheet, merges, knownTypes })
      await logAgentRun(service, {
        agentKey: 'extractor', feature: 'intake:read-sheet',
        projectId: typeof req.body?.project_id === 'string' ? req.body.project_id : undefined,
        run: r.run, createdBy: user.userId, runId: randomUUID(),
      })

      if (!r.run.ok) {
        return res.status(502).json({
          error: `The sheet could not be read (${r.run.failure}). Nothing was staged.`,
          failure: r.run.failure, retryable: true, cost: costCents(r.run),
        })
      }
      if (!r.checked?.ok) {
        return res.status(502).json({
          error: `The reading did not hold together well enough to keep. ${describeProblems(r.checked?.problems ?? [])}`,
          failure: 'contract-boundary', problems: r.checked?.problems ?? [],
          retryable: true, cost: costCents(r.run),
        })
      }

      return res.status(200).json({
        rows: r.checked.rows,
        mappings: r.checked.mappings,
        ambiguities: r.checked.ambiguities,
        problems: r.checked.problems,
        page_note: r.run.value?.page_note ?? null,
        rendered: r.rendered,
        cost: costCents(r.run),
        model: r.run.usage?.model ?? null,
      })
    }

    // == VERIFY SHEET (5a) ====================================================
    // The second pass, same one-sheet-per-invocation rule. Fails CLOSED: a
    // verification that could not run comes back `ran: false` with a named
    // failure, never an empty pass.
    if (action === 'verify-sheet') {
      if (!(await isStaff())) return res.status(403).json({ error: 'Intake is a staff action.' })

      const grid = req.body?.grid
      const sheet = String(req.body?.sheet ?? '').trim()
      const claims = Array.isArray(req.body?.claims) ? req.body.claims : []
      if (!Array.isArray(grid) || !grid.length) {
        return res.status(400).json({ error: 'grid is required.' })
      }
      const v = await verifyExtraction({
        grid, sheetName: sheet, merges: Array.isArray(req.body?.merges) ? req.body.merges : [],
        claims, claimedUnits: Number(req.body?.claimed_units ?? claims.length),
      })
      return res.status(200).json(v)
    }

    // == DRAFT FIELD SET ======================================================
    // Not upload-scoped, which is why it is handled before the upload lookup.
    //
    // WHY IT LIVES HERE AT ALL: api/ holds exactly 12 serverless functions and
    // Vercel's ceiling is 12. A 13th builds cleanly and then fails at "Deploying
    // outputs" - the incident is recorded in ARCHITECTURE. This endpoint already
    // owns the other agent call in the equipment domain, so the drafter routes
    // through it rather than costing a deployment. The semantic stretch is
    // acknowledged; the ceiling is physical.
    if (action === 'draft-field-set') {
      if (!(await isStaff())) return res.status(403).json({ error: 'Drafting is a staff action.' })

      const typeKey  = String(req.body?.type_key ?? '').trim()
      if (!typeKey) return res.status(400).json({ error: 'type_key is required.' })

      // RESOLVE AGAINST THE REGISTER, NEVER TRUST THE BODY. The display name
      // comes from the row, not from the caller.
      const { data: type } = await service.from('equipment_types')
        .select('key, name').eq('key', typeKey).maybeSingle()
      if (!type) return res.status(404).json({ error: `No such equipment type: ${typeKey}` })

      // A type that already has a table is not drafted OVER. It may be drafted
      // FOR — additive rows only — and that is a different request, so it is a
      // different mode rather than a silent widening of this one.
      const enrich = req.body?.mode === 'enrich'
      const { data: existingDefs } = await service.from('equipment_type_field_defs')
        .select('field_name').eq('equipment_type', typeKey)
      const existingNames = [...new Set((existingDefs ?? []).map(d => d.field_name))]
      if (existingNames.length > 0 && !enrich) {
        return res.status(409).json({
          error: `${type.name} already has ${existingNames.length} field(s). ` +
                 `Pass mode:"enrich" to add to it; this mode only drafts a new table.`,
        })
      }
      if (existingNames.length === 0 && enrich) {
        return res.status(409).json({
          error: `${type.name} has no table to enrich. Draft one instead.`,
        })
      }

      // LAW 9: everything the contract forbids or requires is SUPPLIED.
      const { data: baseDefs } = await service.from('equipment_type_field_defs')
        .select('field_name').eq('equipment_type', '__base')
      const baseNames = [...new Set((baseDefs ?? []).map(d => d.field_name))]
      if (!baseNames.length) {
        // Fail closed, and say why. Drafting without the base set would produce
        // duplicate identity fields on every unit of the type.
        return res.status(500).json({
          error: 'The universal __base field set is missing; a draft cannot be asked to exclude it.',
        })
      }

      const { data: siblings } = await service.from('equipment_type_field_defs')
        .select('equipment_type, field_name, unit')
        .in('equipment_type', ['pump', 'boiler', 'unit_heater'])
        .order('sort_order')
      const byType = new Map<string, { field_name: string; unit: string | null }[]>()
      for (const d of siblings ?? []) {
        const list = byType.get(d.equipment_type) ?? []
        list.push({ field_name: d.field_name, unit: d.unit })
        byType.set(d.equipment_type, list)
      }

      const input: FieldSetDraftInput = {
        type_key: type.key,
        type_name: type.name,
        base_field_names: baseNames,
        unit_convention:
          'Ontario mechanical practice: CFM, MBH, NPS, V, A, Hz are written the ' +
          'same in both systems (leave unit_imperial null for these); metric ' +
          'temperatures and lengths take an imperial counterpart.',
        ...(enrich ? { existing_field_names: existingNames } : {}),
        ...(typeof req.body?.standards_anchor === 'string' && req.body.standards_anchor.trim()
          ? { standards_anchor: String(req.body.standards_anchor).slice(0, 600) } : {}),
        sibling_examples: [...byType.entries()].map(([k, fields]) => ({
          type_name: k, fields: fields.slice(0, 12),
        })),
      }

      const run = await runAgent<FieldSetDraftOutput>('drafter', input, {
        task: [
          enrich
            ? `Add the MISSING fields to the existing nameplate table for "${type.name}". ` +
              `Return only what is absent from existing_field_names — additive rows only. ` +
              `If the table is already adequate, say so in note and return few or none.`
            : `Draft the starter nameplate field set for "${type.name}".`,
          '',
          'Return the fields a commissioning agent standing at the unit could',
          'actually record, and that someone would later care about. Target 10-15;',
          'fewer for passive equipment.',
          '',
          'Never emit a field whose name appears in base_field_names - those are on',
          'every unit already, and a duplicate is indistinguishable from the real',
          'one at the point of entry.',
          '',
          'Set unit_imperial ONLY where the quantity genuinely swaps between',
          'systems. Leave it null for CFM, MBH, NPS, V, A and Hz.',
          '',
          'If you are unsure, emit FEWER fields and say why in `note`. A short table',
          'a human extends beats a long one a human prunes.',
        ].join('\n'),
      })

      if (!run.ok) {
        // Fail closed with the failure named. A drafting call that half-worked
        // must not present a partial table as a proposal.
        return res.status(502).json({ error: `The draft failed: ${run.failure}.` })
      }

      await logAgentRun(service, {
        agentKey: 'drafter', feature: 'classifications:draft-field-set',
        projectId: null, runId: type.key,
        run, createdBy: user.userId,
      }).catch(() => {})

      // Base collisions are dropped HERE as well as forbidden in the contract.
      // A rule that lives only in prose is a rule the next model version may not
      // follow, and the reviewer must never be shown a row that would duplicate
      // identity.
      // Base collisions are dropped HERE as well as forbidden in the contract, and
      // on enrich the EXISTING names are dropped the same way. A rule that lives
      // only in prose is a rule the next model version may not follow, and a
      // duplicate row would render twice on every unit of the type.
      const forbidden = new Set([...baseNames, ...(enrich ? existingNames : [])]
        .map(n => n.trim().toLowerCase()))
      const drafted = run.value!.fields
      const fields = drafted.filter(
        (f) => !forbidden.has(f.field_name.trim().toLowerCase()))
      const droppedBase = drafted.length - fields.length

      return res.status(200).json({
        type_key: type.key, type_name: type.name,
        mode: enrich ? 'enrich' : 'draft',
        existing_field_count: existingNames.length,
        fields, note: run.value!.note ?? null,
        dropped_base_collisions: droppedBase,
        usage: run.usage,
      })
    }


    // == FIND PAGES ===========================================================
    // The AI half of the schedule-page finder. The deterministic half already
    // ran in the BROWSER, on the file the user is holding, and decided most of
    // the set for free. Only the pages that filter could not call arrive here.
    //
    // Not upload-scoped either: this runs BEFORE anything is uploaded, which is
    // the point — a 300-page set should never be stored to find out that six
    // pages mattered.
    if (action === 'find-pages') {
      if (!(await isStaff())) return res.status(403).json({ error: 'Intake is a staff action.' })

      const raw = Array.isArray(req.body?.pages) ? req.body.pages : []
      if (!raw.length) {
        return res.status(400).json({ error: 'pages is required — nothing to sort.' })
      }
      // A HARD CEILING, WITH A MESSAGE. Silently sorting the first N and
      // reporting success would read as "we looked at your whole set".
      if (raw.length > PAGE_SORT_CEILING) {
        return res.status(413).json({
          error: `${raw.length} pages need a look, over the ${PAGE_SORT_CEILING}-page ceiling ` +
                 `for one pass. Split the set, or extract the schedule pages yourself and drag ` +
                 `those in — that path is unchanged and costs nothing.`,
        })
      }

      const pages = raw.map((p: any) => ({
        page: Number(p.page),
        text_excerpt: typeof p.text_excerpt === 'string' && p.text_excerpt.trim()
          ? String(p.text_excerpt).slice(0, 4000) : undefined,
        image_base64: typeof p.image_base64 === 'string' ? p.image_base64 : undefined,
      }))

      const input: PageSortInput = {
        pages: pages.map((p: any) => ({
          page: p.page,
          text_excerpt: p.text_excerpt,
          has_image: !!p.image_base64 || undefined,
        })),
      }

      const images = pages.filter((p: any) => p.image_base64).map((p: any) => ({
        base64: String(p.image_base64).replace(/^data:image\/\w+;base64,/, ''),
        mediaType: 'image/png' as const,
      }))

      const run = await runAgent<PageSortOutput>('sorter', input, {
        task: [
          'For each page below, say whether it is an equipment schedule worth',
          'extracting into a commissioning register.',
          '',
          'Return one entry per page, in the order given, keyed by the page number',
          'you were given — the human confirms your answer against their own set.',
          '',
          'A door, window, or room-finish schedule is a real schedule and the wrong',
          'discipline: is_schedule false. A legend, point list, or notes page set in',
          'columns is not a schedule however table-like it looks.',
          '',
          'Where you cannot tell, answer false with a LOW confidence and say what',
          'stopped you. A confident wrong yes costs an extraction and a page of',
          'nonsense rows; a hedged no costs one scroll.',
        ].join('\n'),
        ...(images.length ? { images } : {}),
      } as any)

      await logAgentRun(service, {
        agentKey: 'sorter', feature: 'intake:find-pages',
        projectId: null, runId: null,
        run, createdBy: user.userId,
      }).catch(() => {})

      if (!run.ok) {
        // FAIL OPEN INTO THE HUMAN'S HANDS, NOT INTO AN EXTRACTION. A sort that
        // could not be made is reported as undecided so the confirmation screen
        // still shows the pages and lets a person tick them — it must never
        // silently drop them, and it must never guess them in.
        return res.status(200).json({
          sorted: [], failure: run.failure,
          note: 'The page sort failed; the pages it could not judge are shown undecided.',
          usage: run.usage,
        })
      }

      return res.status(200).json({ sorted: run.value!.pages, usage: run.usage })
    }

    if (!uploadId) return res.status(400).json({ error: 'upload_id is required' })

    const { data: up } = await service.from('intake_uploads')
      .select('id, project_id, filename, storage_path, kind, status, import_batch_id, media_type')
      .eq('id', uploadId).maybeSingle()
    if (!up) return res.status(404).json({ error: 'No such upload.' })

    // RESOLVE AND REFUSE. The project comes from the upload row, never from the
    // request body: a caller cannot name a different project to write into.
    const { data: proj } = await service.from('projects')
      .select('id, name, com_number, unit_system').eq('id', up.project_id).maybeSingle()
    if (!proj) return res.status(409).json({ error: 'The upload names a project that no longer exists.' })

    const { data: profile } = await service.from('user_profiles')
      .select('role').eq('id', user.userId).maybeSingle()
    if (!['admin', 'developer', 'owner', 'employee'].includes(profile?.role ?? '')) {
      return res.status(403).json({ error: 'Intake is a staff action.' })
    }

    // == EXTRACT ==============================================================
    if (action === 'extract') {
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


      // ── the page itself ───────────────────────────────────────────────────────
      //
      // RETRIED, BECAUSE THIS READ IS FLAKY AND IDEMPOTENT. On 2026-08-11 a
      // 0.9 MB PNG failed with a storage `Gateway Timeout` and threw away the
      // whole run — the object was fine, and downloaded in 436 ms on the next
      // attempt. Fetching a byte-identical immutable object has no side effects,
      // so a retry costs a few hundred milliseconds and converts that failure
      // into a non-event.
      //
      // RETRYABLE ONLY. A 404 or 403 means the path or the permission is wrong,
      // and retrying a wrong path is just slower wrongness — those fail
      // immediately and loudly. Only 5xx and timeouts are tried again.
      const dl = await downloadWithRetry(service, up.storage_path)
      if (dl.error || !dl.data) {
        return res.status(502).json({
          error: `Could not read the stored file: ${dl.error?.message}`,
          // The CLIENT needs to tell "we never fetched the page" from "the page
          // held nothing". They are different facts about the user's document
          // and only one of them is about their document at all.
          failure: 'fetch',
          attempts: dl.attempts,
          retryable: dl.retryable,
        })
      }
      if (dl.attempts > 1) {
        // A flaky-but-succeeding read must not be silent: if this line starts
        // appearing often, storage is degrading and the retry is hiding it.
        console.log(`[intake] storage read succeeded on attempt ${dl.attempts} for ${up.storage_path}`)
      }
      const bytes = Buffer.from(await dl.data.arrayBuffer())

      // R18 — FILENAMES LIE, AND OURS DID. This used to read
      // `up.filename.split('.').pop()`. The schedule-page finder names uploads
      // "…-IFT.pdf — page 7 (M-301)", so that returned "pdf — page 7 (m-301)",
      // matched no media type, and 400'd. EVERY page confirmed through the
      // finder failed, on every set, from the day it shipped — while a
      // perfectly valid PNG sat in storage that nothing ever looked at.
      //
      // The bytes decide. `media_type` is recorded at creation from content,
      // and this sniff of the ACTUAL OBJECT is the authority: if the two ever
      // disagree, what is in storage wins, because that is what the model will
      // be shown.
      const mediaType = sniffMediaType(bytes)
      if (!mediaType) {
        // Refuse with what was actually seen. "Cannot extract" without evidence
        // sends the next person to the wrong layer — which is exactly what the
        // old message did.
        return res.status(400).json({
          error: `The stored file is not a readable page. Recorded media_type: ` +
                 `${up.media_type ?? 'none'}; bytes say: ${describeBytes(bytes)}.`,
        })
      }
      if (up.media_type && up.media_type !== mediaType) {
        // Not fatal — the bytes win — but a mismatch means something wrote a
        // wrong fact, and a silent correction would hide it.
        console.warn(`[intake] media_type mismatch on ${uploadId}: ` +
                     `recorded ${up.media_type}, bytes say ${mediaType}`)
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
        projectId: proj.id, runId: uploadId,
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
        .select('id, tag').eq('project_id', proj.id)
      const byTag = new Map((existing ?? []).map(e => [e.tag.toUpperCase(), e.id]))

      const { data: already } = await service.from('intake_rows')
        .select('id, tag').eq('upload_id', uploadId)
      const firstByTag = new Map<string, string>()
      for (const r of already ?? []) if (r.tag) firstByTag.set(r.tag.toUpperCase(), r.id)

      // ── THE BOUNDARY (Phase 1) ────────────────────────────────────────────
      // Nothing model-produced reaches the register without crossing this. The
      // shapes that would land as a PLAUSIBLE WRONG ROW — a tag that is a
      // sentence, a confidence of 4, a spec value that is a structure — are
      // refused here and NAMED. Flags are recorded rather than dropped: an
      // unrecognised type still degrades to "unknown" exactly as it did before,
      // but the degradation is now visible instead of silent.
      const checked = checkExtraction(out, { knownTypes })
      if (!checked.ok) {
        console.error(`[intake] extraction refused at the boundary for ${uploadId}:`,
          JSON.stringify(checked.problems.slice(0, 8)))
        await service.from('intake_uploads')
          .update({ status: 'failed', parse_note: `Refused at the boundary — ${describeProblems(checked.problems)}` })
          .eq('id', uploadId)
        return res.status(502).json({
          error: 'The page was read, but the reading did not hold together well enough to keep. ' +
                 `Nothing was written. ${describeProblems(checked.problems)}`,
          failure: 'contract-boundary',
          problems: checked.problems,
          retryable: true,
        })
      }
      const boundaryFlags = checked.problems.filter(p => p.severity === 'flag')
      if (boundaryFlags.length) {
        console.warn(`[intake] ${boundaryFlags.length} boundary flag(s) on ${uploadId}:`,
          JSON.stringify(boundaryFlags.slice(0, 8)))
      }

      const payload = checked.rows.map(r => {
        const key = (r.tag ?? '').toUpperCase()
        return {
          upload_id: uploadId, project_id: proj.id,
          source_page: input.page, source_row: r.source_row ?? null,
          // The sheet number the finder confirmed, carried onto every row it
          // produced. "Where did this unit come from" must be answerable as
          // "sheet M-401", not "an upload from Tuesday".
          source_sheet: typeof req.body?.sheet === 'string' ? req.body.sheet : null,
          tag: r.tag ?? null, descriptor: r.descriptor ?? null,
          proposed_category: r.proposed_category ?? null,
          // The FK is the guarantee, but a value the model invented would fail the
          // insert and lose the whole page. Check it here so an unrecognised type
          // degrades to "unknown" — which the review screen already handles — rather
          // than throwing away nineteen good rows alongside the bad one.
          // The boundary already resolved this against the vocabulary and FLAGGED
          // a miss rather than silently nulling it. `proposed_type` is either a
          // real key or null; the observed name falls back to the descriptor.
          proposed_type: r.proposed_type ?? null,
          observed_type_name: r.proposed_type ? null : (r.descriptor ?? null),
          location: r.location ?? null, area_served: r.area_served ?? null,
          nameplate: Object.keys(r.nameplate).length ? r.nameplate : null,
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

      // NAMES, NEVER COUNTS — AND MEASURED, NOT SELF-REPORTED.
      //
      // The Excel path now says which columns mapped and which were captured, so
      // the PDF path must too, or the same page read two ways tells the user two
      // different stories about how much of it survived.
      //
      // But it is computed from THE ROWS THAT WERE ACTUALLY WRITTEN, not from the
      // model's own `page_note`. An extractor describing its own coverage is a
      // claim; the union of nameplate keys across the rows it produced is a
      // measurement. Where those two disagree, only one of them is evidence.
      const produced = (payload ?? []) as { nameplate?: Record<string, string> | null }[]
      const spec = new Set<string>()
      for (const r of produced) for (const k of Object.keys(r.nameplate ?? {})) spec.add(k)
      const fields = ['tag', 'descriptor', 'location', 'area_served', 'proposed_type'] as const
      const got = fields.filter(f => produced.some(r => (r as Record<string, unknown>)[f]))

      const coverageNote = [
        out.page_note ?? null,
        `Read from this page — fields: ${got.join(', ') || 'none'}`,
        `captured as spec (${spec.size}): ${[...spec].join(', ') || 'nothing'}`,
      ].filter(Boolean).join(' · ')

      await service.from('intake_uploads').update({
        status: 'parsed', row_count: count ?? 0,
        parse_note: coverageNote,
      }).eq('id', uploadId)

      return res.status(200).json({
        rows: inserted?.length ?? 0,
        page_note: out.page_note ?? null,
        usage: { input: run.usage?.inputTokens, output: run.usage?.outputTokens },
      })
    }

    // == APPROVE ==============================================================
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

    // ── THE MATCHER RUNS HERE, ON THE LIVE PATH (ruled 2026-08-14) ───────────
    //
    // From June to August, matchScheduleSpec existed and ran nowhere but its own
    // test and a one-off repair script — approval wrote raw schedule headings
    // straight into nameplate_extra.spec, so the register held 77 values and
    // displayed the ones whose headings happened to equal a declared field name
    // (on the pump set: exactly VFD). A capability is only as real as the live
    // path that invokes it.
    //
    // The repoint-script shape, ratified: matched values land under DECLARED
    // field names; the WHOLE original read is preserved verbatim in
    // from_schedule — every heading, every string, exactly as the document
    // spoke. Conversions are loud (arithmetic in the batch note); refusals write
    // nothing. Forward-only: existing equipment is untouched.
    //
    // Declared fields come from the project's own defs when they exist; the
    // firm's type defs otherwise (the seed trigger fires AFTER equipment
    // insert, so a project's first unit of a type has no project defs yet —
    // the fallback mirrors what the trigger is about to seed).
    // proj is non-null here (refused with 409 above); TS cannot see it through
    // the closure, so it is pinned once.
    const projId = proj.id
    const projImperial = proj.unit_system === 'imperial'
    const declaredCache = new Map<string, DeclaredField[]>()
    async function declaredFor(type: string): Promise<DeclaredField[]> {
      if (declaredCache.has(type)) return declaredCache.get(type)!
      let defs: DeclaredField[] = []
      const { data: projDefs } = await service.from('project_equipment_field_defs')
        .select('field_name, unit').eq('project_id', projId)
        .eq('equipment_type', type).eq('section', 'spec')
      if (projDefs?.length) defs = projDefs
      else {
        const { data: firmDefs } = await service.from('equipment_type_field_defs')
          .select('field_name, unit, unit_imperial').eq('equipment_type', type).eq('section', 'spec')
        const imperial = projImperial
        defs = (firmDefs ?? []).map(d => ({
          field_name: d.field_name,
          unit: imperial ? (d.unit_imperial ?? d.unit) : d.unit,
        }))
      }
      declaredCache.set(type, defs)
      return defs
    }
    const matcherTally = { wrote: 0, converted: 0, compound: 0, refused: 0, unmatched: 0 }
    const conversionNotes: string[] = []

    const created: { rowId: string; equipmentId: string }[] = []
    for (const r of creates) {
      const e = r.edited ?? {}
      const type = finalType(r)

      // Build nameplate_extra through the matcher. from_schedule ALWAYS carries
      // the verbatim read when a nameplate exists — populated from_schedule is
      // the tell that the matcher ran, and the gate asserts it.
      let nameplateExtra: Record<string, unknown> | null = null
      if (r.nameplate) {
        let specOut: Record<string, string> = {}
        if (type) {
          const verdicts = matchScheduleSpec(r.nameplate as Record<string, string>, await declaredFor(type))
          for (const m of verdicts) {
            if ((m.kind === 'exact' || m.kind === 'converted' || m.kind === 'compound') && m.field && m.value != null) {
              specOut[m.field] = m.value
              if (m.kind === 'exact') matcherTally.wrote++
              else if (m.kind === 'compound') matcherTally.compound++
              else { matcherTally.converted++; conversionNotes.push(`${r.tag ?? '?'}: ${m.note}`) }
            } else if (m.kind === 'unit-mismatch') matcherTally.refused++
            else matcherTally.unmatched++
          }
        } else {
          // untyped unit: no declared fields to match — everything stays in the
          // verbatim read, visible in the unmapped strip, nothing invisible.
          matcherTally.unmatched += Object.keys(r.nameplate).length
        }
        nameplateExtra = { spec: specOut, shop_drawing: {}, installed: {}, from_schedule: r.nameplate }
      }
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
        // The unresolved name travels WITH the unit, not only into the queue.
        // Before this, an approved unknown row produced a unit whose type was
        // null and whose observed name existed only on the intake row — so the
        // Cx Index showed a blank cell and the ratification, when it landed,
        // had nothing to match the unit back to.
        observed_type_name: type ? null : (e.observed_type_name ?? r.observed_type_name ?? null),
        location: e.location ?? r.location ?? null,
        area_served: e.area_served ?? r.area_served ?? null,
        // A schedule states DESIGN intent, so its columns land in `spec` — not in
        // `installed`, which is what somebody read off the nameplate on site.
        // Filing design values as installed would make the register claim a
        // verification nobody performed. Spec keys are DECLARED field names via
        // the matcher above; the document's own headings and strings live whole
        // in from_schedule.
        nameplate_extra: nameplateExtra,
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

    // The batch note carries the matcher's arithmetic — conversions are LOUD.
    const matcherNote = created.length
      ? ` · spec matching: ${matcherTally.wrote} as-is, ${matcherTally.compound} from compound columns, ` +
        `${matcherTally.converted} converted (${conversionNotes.slice(0, 12).join('; ') || 'none'})` +
        `${matcherTally.refused ? `, ${matcherTally.refused} refused on unbridgeable units` : ''}` +
        `, ${matcherTally.unmatched} left named in from_schedule`
      : ''
    await service.from('import_batches')
      .update({
        rows_created: created.length + enriched,
        note: `Intake approval — ${creates.length} new, ${enriches.length} enrich${matcherNote}`,
      }).eq('id', batch.id)

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
    if (e instanceof AiError)   return res.status(e.status).json({ error: e.message })
    console.error('[intake]', e)
    return res.status(500).json({ error: 'Intake failed.' })
  }
}
