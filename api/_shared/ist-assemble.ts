/**
 * IST DOCUMENT ASSEMBLY — plan row in, IstDoc out.
 *
 * Extracted rather than inlined into the handler because TWO callers need it and
 * they must not diverge: the endpoint, and `ist-regen-gate.mjs`, which asserts
 * the generated structure against the issued Scarborough report. A gate that
 * assembles its input differently from production is a gate that proves the gate.
 */
import type { IstDoc } from './ist-document.js'

export async function assembleIstDoc(supabase: any, plan: any): Promise<IstDoc> {
  const [{ data: project }, { data: systems }, { data: integrations },
         { data: prereqs }, { data: pre }, { data: sessions },
         { data: revisions }, { data: notes }] = await Promise.all([
    supabase.from('projects').select('name, com_number').eq('id', plan.project_id).single(),
    supabase.from('ist_systems').select('*').eq('plan_id', plan.id).order('sort_order'),
    supabase.from('ist_integrations').select('*').eq('plan_id', plan.id).order('sort_order'),
    supabase.from('ist_prerequisites').select('*').eq('plan_id', plan.id).order('item_no'),
    supabase.from('ist_precompleted').select('*').eq('plan_id', plan.id),
    supabase.from('ist_sessions').select('*').eq('plan_id', plan.id).order('test_date'),
    // Every revision of THIS project's plan, so the revision-control table shows
    // the history rather than only the revision being generated.
    supabase.from('ist_plans').select('revision_label, revision_date, description')
      .eq('project_id', plan.project_id).order('created_at'),
    supabase.from('ist_notes').select('*').eq('plan_id', plan.id).order('sort_order'),
  ])

  const intIds = (integrations ?? []).map((i: any) => i.id)
  const { data: protocols } = intIds.length
    ? await supabase.from('ist_protocols').select('*').in('integration_id', intIds).order('sort_order')
    : { data: [] }

  // The LAST session carries the results and the sign-offs that get printed.
  // A report is issued for a test event; earlier sessions live in §11's log.
  const last = (sessions ?? [])[(sessions ?? []).length - 1] ?? null
  const [{ data: results }, { data: signoffs }, { data: participants }] = last
    ? await Promise.all([
        supabase.from('ist_results').select('*').eq('session_id', last.id),
        supabase.from('ist_signoffs').select('*').eq('session_id', last.id),
        supabase.from('ist_session_participants').select('*').eq('session_id', last.id).order('sort_order'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const companyIds = [...new Set((participants ?? []).map((p: any) => p.company_id).filter(Boolean))]
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, name').in('id', companyIds)
    : { data: [] }
  const coName = (id: string | null) => (companies ?? []).find((c: any) => c.id === id)?.name ?? null
  const sysName = (id: string) => (systems ?? []).find((s: any) => s.id === id)?.label ?? '—'

  return {
    project: { name: project?.name ?? '', com_number: project?.com_number ?? null, address: null },
    plan: { revision_label: plan.revision_label, revision_date: plan.revision_date, description: plan.description },
    revisions: revisions ?? [],
    systems: (systems ?? []).map((s: any) => ({
      label: s.label, overview_description: s.overview_description, integrations_objectives: s.integrations_objectives,
    })),
    integrations: (integrations ?? []).map((i: any) => ({
      id: i.id, integration_type: i.integration_type, attachment_label: i.attachment_label,
      normal_mode_behavior: i.normal_mode_behavior, offnormal_mode_behavior: i.offnormal_mode_behavior,
      system_a: sysName(i.system_a_id), system_b: sysName(i.system_b_id),
      protocols: (protocols ?? []).filter((p: any) => p.integration_id === i.id),
    })),
    prerequisites: prereqs ?? [],
    precompleted: (pre ?? []).map((p: any) => ({
      subject_text: p.subject_text, integration_type: p.integration_type,
      documentation_ref: p.documentation_ref, comments: p.comments,
    })),
    sessions: sessions ?? [],
    participants: (participants ?? []).map((p: any) => ({
      session_id: p.session_id, role_label: p.role_label, company: coName(p.company_id), name: p.name_text,
    })),
    results: results ?? [],
    signoffs: signoffs ?? [],
    notes: notes ?? [],
    authored_by: null,
  }
}
