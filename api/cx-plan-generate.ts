// api/cx-plan-generate — assemble, render and (optionally) issue a Cx Plan.
//
//   POST { plan_id, issue?: boolean }  → { storage_url, pdf_url, revision_label }
//
// THREE REFUSALS, all server-side, none of them merely hidden in the UI:
//
//   1. NO DRAFT REACHES A DOCUMENT WITHOUT APPROVAL. status must be 'approved'
//      (or 'issued', for a re-render of an already-issued revision). There is no
//      auto-approval path — not a flag, not a setting.
//   2. APPROVE AND ISSUE ARE OWNER+LEAD (D6). RLS can see a resulting row but not
//      a status TRANSITION, so this rule cannot live in a policy.
//   3. AN ISSUED REVISION IS FROZEN (rule 4). Re-issuing it is refused; revising
//      creates revision_index + 1.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
import { injectIntoSkeleton } from './_shared/docx-skeleton.js'
import { buildDeterministic, activeSections, type PlanFacts } from './_shared/cx-plan-assembly.js'
import { toPdf, uploadDocPair } from './_shared/doc-common.js'
import { knowledgeVersion } from './_shared/ai-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Owner+lead of THIS project (D6). Enforced in code because the service role
 *  bypasses RLS — the same reason portal-invite enforces it here. */
async function requireApprover(service: any, userId: string, projectId: string) {
  const { data: profile } = await service
    .from('user_profiles').select('role').eq('id', userId).maybeSingle()
  if (!profile) throw new AuthError(403, 'No access to this project')
  if (profile.role === 'admin' || profile.role === 'developer') return
  const { data: member } = await service.from('project_members')
    .select('is_lead').eq('project_id', projectId).eq('profile_id', userId).maybeSingle()
  const isOwner = profile.role === 'owner' && !!member
  if (!isOwner && !member?.is_lead) {
    throw new AuthError(403, 'Only an owner or lead of this project can approve or issue a Cx Plan')
  }
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const { plan_id, issue } = req.body ?? {}
    if (!plan_id) return res.status(400).json({ error: 'plan_id required' })

    const { data: plan } = await service.from('cx_plans')
      .select('*').eq('id', plan_id).maybeSingle()
    if (!plan) return res.status(404).json({ error: 'plan not found' })

    await requireProjectAccess(service, user.userId, plan.project_id)
    await requireApprover(service, user.userId, plan.project_id)

    // REFUSAL 1 — the one the brief calls out by name.
    if (plan.status === 'draft') {
      return res.status(409).json({
        error: 'This plan has not been approved. Every section must be accepted and the plan approved before a document can be generated.',
      })
    }
    // REFUSAL 3 — rule 4.
    if (plan.status === 'issued' && issue) {
      return res.status(409).json({
        error: 'This revision is already issued and is frozen. Create a new revision instead.',
      })
    }

    // ── Gather the deterministic facts ─────────────────────────────────────
    const [{ data: project }, { data: answers }, { data: team }, { data: equip },
           { data: phases }, { data: sections }] = await Promise.all([
      service.from('projects')
        .select('name, com_number, address, background_description, cx_role_designation, companies(name)')
        .eq('id', plan.project_id).maybeSingle(),
      service.from('cx_plan_answers').select('question_key, answer')
        .eq('project_id', plan.project_id).eq('document_type', 'cx_plan'),
      service.from('project_team_assignments')
        .select('companies(name), contacts(name), company_role_types(name, abbreviation, sort_order)')
        .eq('project_id', plan.project_id),
      service.from('equipment').select('category').eq('project_id', plan.project_id),
      service.from('project_phases').select('name').eq('project_id', plan.project_id).order('sort_order'),
      service.from('cx_plan_sections').select('*').eq('plan_id', plan_id),
    ])

    const answerMap = Object.fromEntries(
      (answers ?? []).map((a: any) => [a.question_key,
        typeof a.answer === 'string' ? a.answer : (a.answer?.value ?? '')]))

    const facts: PlanFacts = {
      project: {
        name: project?.name ?? '', com_number: project?.com_number ?? null,
        address: project?.address ?? null,
        client_name: (project as any)?.companies?.name ?? null,
        background_description: project?.background_description ?? null,
        cx_role_designation: (project?.cx_role_designation as any) ?? null,
      },
      // VERBATIM from the matrix, in matrix order.
      team: (team ?? []).map((t: any) => ({
        role_name: t.company_role_types?.name ?? null,
        role_abbr: t.company_role_types?.abbreviation ?? null,
        company_name: t.companies?.name ?? null,
        contact_name: t.contacts?.name ?? null,
      })),
      systems: [...new Set((equip ?? []).map((e: any) => e.category).filter(Boolean))] as string[],
      submittals: JSON.parse(answerMap.submittals || '[]'),
      phases: (phases ?? []).map((p: any) => p.name),
      answers: answerMap,
      procedures: JSON.parse(answerMap.procedures || '[]'),
      options: JSON.parse(answerMap.options || '{}'),
      appendices: JSON.parse(answerMap.appendices || '[]'),
      tier: plan.tier,
      revisionLabel: plan.revision_label
        ? `Rev ${plan.revision_index} – ${plan.revision_label}`
        : `Rev ${plan.revision_index}`,
      docDate: new Date().toISOString().slice(0, 10),
    }

    // REFUSAL 1, second half: every narrative section must be ACCEPTED. A plan
    // can be marked approved only through the endpoint below, but this re-checks
    // the sections themselves so an approved-then-redrafted plan cannot slip out.
    const narrativeKeys = activeSections(facts).filter(s => s.kind === 'narrative').map(s => s.key)
    const byKey = Object.fromEntries((sections ?? []).map((s: any) => [s.section_key, s]))
    const unaccepted = narrativeKeys.filter(k => !byKey[k]?.accepted)
    if (unaccepted.length) {
      return res.status(409).json({
        error: `These sections have not been accepted: ${unaccepted.join(', ')}`,
      })
    }

    const narrative = Object.fromEntries(
      narrativeKeys.map(k => [k, byKey[k]?.final_text || byKey[k]?.drafted_text || '']))

    // ── Assemble and render ────────────────────────────────────────────────
    const blocks = buildDeterministic(facts, narrative)
    const skeleton = readFileSync(join(process.cwd(), 'firm-knowledge/skeletons/cx-plan.docx'))
    const injected = await injectIntoSkeleton(skeleton, blocks)
    if (injected.missingStyles.length) {
      return res.status(500).json({
        error: `The document skeleton is missing styles: ${injected.missingStyles.join(', ')}`,
      })
    }

    // PDF from the SAME assembly, so the two outputs cannot diverge in content.
    const html = blocksToHtml(blocks)
    const pdf = await toPdf(html, PDF_FOOTER)

    const base = `${plan.project_id}/CxPlan-Rev${plan.revision_index}`
    const uploaded = await uploadDocPair(service, base, injected.buffer, pdf)
    if ((uploaded as any).error) {
      return res.status(500).json({ error: (uploaded as any).error })
    }
    const { storage_url, pdf_url } = uploaded as any

    const patch: Record<string, unknown> = {
      storage_url, pdf_url, knowledge_version: knowledgeVersion(), updated_at: new Date().toISOString(),
    }
    if (issue) { patch.status = 'issued'; patch.issued_at = new Date().toISOString() }
    await service.from('cx_plans').update(patch).eq('id', plan_id)

    // ── Rule 4 snapshot, at issue ──────────────────────────────────────────
    if (issue) {
      await service.from('cx_plan_snapshots').insert({
        plan_id, revision_index: plan.revision_index,
        answers: answerMap, sections: sections ?? [],
        knowledge_version: knowledgeVersion(),
      })
    }

    return res.status(200).json({
      storage_url, pdf_url, revision_label: facts.revisionLabel,
      issued: !!issue, knowledge_version: knowledgeVersion(),
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('cx-plan-generate error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ── PDF path: the same blocks, rendered through the established stack ───────
import { BASE_CSS, FIRM_HEADER_PDF, esc, DOC } from './_shared/doc-common.js'

const PDF_FOOTER =
  `<div style="width:100%;padding:6px 46px 12px;text-align:center;font-family:Arial,sans-serif;` +
  `font-size:7.5pt;font-style:italic;color:#888;border-top:1px solid #e5e5e5;box-sizing:border-box;">` +
  `Isotherm Engineering Ltd. — Building Commissioning Plan</div>`

function blocksToHtml(blocks: any[]): string {
  const body = blocks.map(b => {
    switch (b.kind) {
      case 'title':     return `<h1 style="text-align:center;color:${DOC.INK};font-size:22pt;">${esc(b.text)}</h1>`
      case 'cover':     return `<p style="text-align:center;font-size:12pt;">${esc(b.text)}</p>`
      case 'heading':   return `<h2 class="sec" style="font-size:${b.level === 1 ? 13 : 11}pt;">${esc(b.text)}</h2>`
      case 'para':      return `<p style="margin:6px 0;">${esc(b.text)}</p>`
      case 'bullet':    return `<p style="margin:2px 0 2px 18px;">&bull;&nbsp;${esc(b.text)}</p>`
      case 'pagebreak': return `<div style="page-break-after:always;"></div>`
      // The Word TOC is a live field; a PDF cannot have one, and a rendered list
      // of page numbers would be a different document. Omitted deliberately.
      case 'toc':       return ''
      case 'table':
        return `<table><thead><tr>${b.header.map((h: string) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
               `<tbody>${b.rows.map((r: string[]) =>
                 `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      default: return ''
    }
  }).join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>` +
         `<body><div class="page">${FIRM_HEADER_PDF}${body}</div></body></html>`
}
