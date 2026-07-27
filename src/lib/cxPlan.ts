// Cx Plan composer — client data layer.
//
// SECTIONS is imported from the shared assembly module rather than redeclared:
// the wizard, the review screen and the document assembler must agree on what
// sections exist, and two lists would drift. Same argument as portal_internal.
import { supabase } from './supabase'
import { authedFetch, apiErrorMessage } from './api'

export type Tier = 'standard' | 'tender'
export type PlanStatus = 'draft' | 'approved' | 'issued'

export interface CxPlan {
  id: string; project_id: string; tier: Tier
  revision_index: number; revision_label: string | null
  status: PlanStatus
  approved_at: string | null; issued_at: string | null
  storage_url: string | null; pdf_url: string | null
  knowledge_version: string | null
  created_at: string
}
export interface PlanSection {
  id: string; plan_id: string; section_key: string; ordinal: number
  kind: 'boilerplate' | 'data' | 'narrative'
  drafted_text: string | null; final_text: string | null
  accepted: boolean
  flags: Flag[] | null
  regenerate_note: string | null
}
export interface Flag {
  span: string; claim: string
  severity: 'unsupported' | 'contradicted' | 'vague'
  why: string
}

/** Mirrors api/_shared/cx-plan-assembly.ts SECTIONS. Kept in sync by
 *  pw-cx-plan, which asserts the two lists are identical — a duplicated list
 *  that nothing compares is a list that drifts. */
export const SECTIONS = [
  { key: 'exec',        title: 'Executive Summary',                            kind: 'boilerplate' },
  { key: 'overview',    title: 'Project Overview',                             kind: 'boilerplate' },
  { key: 'background',  title: 'Background',                                   kind: 'narrative' },
  { key: 'cxplan',      title: 'Commissioning Plan',                           kind: 'boilerplate' },
  { key: 'team',        title: 'Commissioning Team',                           kind: 'data' },
  { key: 'roles',       title: 'Roles and Responsibilities',                   kind: 'narrative' },
  { key: 'process',     title: 'Commissioning Process Overview',               kind: 'narrative' },
  { key: 'install',     title: 'Installation and Startup Testing Procedures',  kind: 'data' },
  { key: 'operational', title: 'Operational Testing',                          kind: 'narrative' },
  { key: 'training',    title: 'Training for Operation and Maintenance Staff', kind: 'boilerplate', option: 'training' },
  { key: 'coordination',title: 'Project Coordination',                         kind: 'boilerplate', option: 'coordination' },
  { key: 'ils',         title: 'Integrated Life Safety Systems Testing',       kind: 'narrative', tier: 'tender', option: 'ils' },
  { key: 'tab',         title: 'Testing, Adjusting and Balancing of Mechanical Systems', kind: 'narrative', tier: 'tender', option: 'tab' },
  { key: 'schedule',    title: 'Commissioning Schedule',                       kind: 'narrative', tier: 'tender', option: 'schedule' },
  { key: 'docs',        title: 'Documentation and Deliverables',               kind: 'data' },
  { key: 'qa',          title: 'Quality Assurance',                            kind: 'boilerplate', tier: 'tender', option: 'qa' },
  { key: 'conclusion',  title: 'Conclusion',                                   kind: 'boilerplate' },
  { key: 'appendix',    title: 'Appendix',                                     kind: 'data' },
] as const

export const APPENDIX_MENU = [
  { letter: 'A', title: 'Commissioning Index',                   reference: 'Maintained live in the Cx Index. Provided on request or through the project portal.', live: true },
  { letter: 'B', title: "Owner's Project Requirements",          reference: 'Provided under separate cover.', live: false },
  { letter: 'C', title: 'Basis of Design',                       reference: 'Provided under separate cover.', live: false },
  { letter: 'D', title: 'Project Specifications',                reference: 'Provided under separate cover.', live: false },
  { letter: 'E', title: 'Commissioned Systems',                  reference: 'Maintained live in the equipment register.', live: true },
  { letter: 'F', title: 'Commissioning Issues Log',              reference: 'Maintained live in the Issues Log. The register is current at all times; this plan does not embed a copy.', live: true },
  { letter: 'G', title: 'Commissioning Construction Checklists', reference: 'Maintained live in the checklist register.', live: true },
  { letter: 'H', title: 'Cx Meeting Minutes',                    reference: 'Issued separately as each meeting is minuted.', live: true },
  { letter: 'I', title: 'Owner Training',                        reference: 'Recorded as training is delivered.', live: false },
] as const

export const OPTION_LABELS: Record<string, string> = {
  training: 'Training for Operation and Maintenance Staff',
  coordination: 'Project Coordination',
  schedule: 'Commissioning Schedule',
  ils: 'Integrated Life Safety Systems Testing',
  tab: 'Testing, Adjusting and Balancing',
  qa: 'Quality Assurance',
}

export const narrativeKeys = (tier: Tier, options: Record<string, boolean>) =>
  SECTIONS.filter(s => s.kind === 'narrative'
    && !((s as any).tier === 'tender' && tier !== 'tender')
    && !((s as any).option && !options[(s as any).option]))
    .map(s => s.key)

// ── Reads ────────────────────────────────────────────────────────────────────
export async function fetchPlan(projectId: string): Promise<CxPlan | null> {
  const { data } = await supabase.from('cx_plans').select('*')
    .eq('project_id', projectId).order('revision_index', { ascending: false })
    .limit(1).maybeSingle()
  return (data as CxPlan) ?? null
}
export async function fetchRevisions(projectId: string): Promise<CxPlan[]> {
  const { data } = await supabase.from('cx_plans').select('*')
    .eq('project_id', projectId).order('revision_index', { ascending: false })
  return (data ?? []) as CxPlan[]
}
export async function fetchSections(planId: string): Promise<PlanSection[]> {
  const { data } = await supabase.from('cx_plan_sections').select('*')
    .eq('plan_id', planId).order('ordinal')
  return (data ?? []) as PlanSection[]
}
export async function fetchAnswers(projectId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('cx_plan_answers')
    .select('question_key, answer').eq('project_id', projectId).eq('document_type', 'cx_plan')
  return Object.fromEntries((data ?? []).map((a: any) =>
    [a.question_key, typeof a.answer === 'string' ? a.answer : (a.answer?.value ?? '')]))
}

// ── Writes ───────────────────────────────────────────────────────────────────
export async function saveAnswer(projectId: string, key: string, value: unknown) {
  return supabase.from('cx_plan_answers').upsert({
    project_id: projectId, document_type: 'cx_plan', question_key: key,
    answer: typeof value === 'string' ? value : JSON.stringify(value),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,document_type,question_key' }).select('id')
}

/** §13: the wizard edits the PROJECT field. One home for the background. */
export async function saveBackground(projectId: string, text: string) {
  return supabase.from('projects')
    .update({ background_description: text }).eq('id', projectId).select('id')
}
export async function saveRoleDesignation(projectId: string, d: 'CxA' | 'CxP') {
  return supabase.from('projects')
    .update({ cx_role_designation: d }).eq('id', projectId).select('id')
}

export async function createPlan(projectId: string, tier: Tier, revisionIndex = 0, label?: string) {
  return supabase.from('cx_plans').insert({
    project_id: projectId, tier, revision_index: revisionIndex, revision_label: label ?? null,
  }).select('*').single()
}

export async function acceptSection(planId: string, key: string, finalText: string) {
  return supabase.from('cx_plan_sections')
    .update({ final_text: finalText, accepted: true })
    .eq('plan_id', planId).eq('section_key', key).select('id')
}

/** Approval is explicit and only ever reaches here from the review screen's
 *  Approve button, which is disabled until every narrative section is accepted.
 *  The server re-checks both, so this is convenience and not the control. */
export async function approvePlan(planId: string, userId: string) {
  return supabase.from('cx_plans').update({
    status: 'approved', approved_at: new Date().toISOString(), approved_by: userId,
  }).eq('id', planId).select('id')
}

/** A drafting failure the UI can act on: it carries the reason and whether a
 *  retry is worth offering, instead of collapsing to a string in an alert(). */
export class DraftError extends Error {
  constructor(message: string, public reason?: string, public retryable = false) {
    super(message)
  }
}

export async function draftSection(planId: string, sectionKey: string, note?: string) {
  const res = await authedFetch('/api/cx-plan-draft', { plan_id: planId, section_key: sectionKey, note })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new DraftError(
      body.error ?? apiErrorMessage(res.status, body), body.reason, !!body.retryable)
  }
  return body as { prose: string; claims: { text: string; supported_by: string }[]; flags: Flag[] }
}

export async function generatePlan(planId: string, issue = false) {
  const res = await authedFetch('/api/cx-plan-generate', { plan_id: planId, issue })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? apiErrorMessage(res.status, body))
  return body as { storage_url: string; pdf_url: string; revision_label: string; issued: boolean }
}
