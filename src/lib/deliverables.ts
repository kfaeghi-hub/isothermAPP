// Deliverables tab data helpers — all Supabase access behind src/lib (§9B).
// Status dates follow the date_closed pattern: auto-stamped on the transition,
// editable afterwards, cleared on regression.

import { supabase } from './supabase'
import { daysSince, DELIVERABLE_OVERDUE_GRACE_DAYS } from './dashboardThresholds'
import type { DeliverableStatus, DeliverableTemplate } from '../types/database'

export interface DeliverableRow {
  id: string
  project_id: string
  template_id: string | null
  name: string | null                       // ad-hoc rows only (one-of CHECK)
  status: DeliverableStatus
  assigned_to: string | null                // profile-name convention (§12)
  due_date: string | null
  notes: string | null
  date_submitted: string | null
  date_accepted: string | null
  sort_order: number
  deliverable_templates: Pick<DeliverableTemplate, 'name'> | null
}

export const displayName = (r: DeliverableRow) => r.name ?? r.deliverable_templates?.name ?? '(unnamed)'

export const STATUS_ORDER: DeliverableStatus[] = ['not_started', 'in_progress', 'submitted', 'accepted']

export const STATUS_META: Record<DeliverableStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Progress', cls: 'bg-sky-50 text-sky-700' },
  submitted:   { label: 'Submitted',   cls: 'bg-amber-50 text-amber-700' },
  accepted:    { label: 'Accepted',    cls: 'bg-green-50 text-green-700' },
}

// ── Assignee rollup (project-scoped widget + shared shape) ───────────────────
// A deliverable is overdue when it is past its due date by more than the grace
// AND not yet submitted/accepted — the same rule the dashboard queue uses.
export function isOverdue(status: DeliverableStatus, dueDate: string | null): boolean {
  if (status === 'submitted' || status === 'accepted') return false
  const late = daysSince(dueDate)
  return late !== null && late > DELIVERABLE_OVERDUE_GRACE_DAYS
}

export interface AssigneeRollup {
  name: string        // assignee name, or 'Unassigned' for the null bucket
  assigned: boolean   // false = the unassigned bucket (rendered muted)
  total: number
  overdue: number
  split: Record<DeliverableStatus, number>
}

/** Group deliverable rows by assignee, with an overdue count and a per-status split. */
export function rollupByAssignee(
  rows: Array<Pick<DeliverableRow, 'assigned_to' | 'status' | 'due_date'>>,
): AssigneeRollup[] {
  const map = new Map<string, AssigneeRollup>()
  for (const r of rows) {
    const key = r.assigned_to ?? ''
    let g = map.get(key)
    if (!g) {
      g = {
        name: r.assigned_to ?? 'Unassigned', assigned: !!r.assigned_to,
        total: 0, overdue: 0,
        split: { not_started: 0, in_progress: 0, submitted: 0, accepted: 0 },
      }
      map.set(key, g)
    }
    g.total++
    g.split[r.status]++
    if (isOverdue(r.status, r.due_date)) g.overdue++
  }
  // Assigned buckets first, then most-overdue, then largest, then name.
  return [...map.values()].sort((a, b) =>
    (a.assigned === b.assigned ? 0 : a.assigned ? -1 : 1)
    || b.overdue - a.overdue || b.total - a.total || a.name.localeCompare(b.name))
}

export async function fetchDeliverables(projectId: string): Promise<DeliverableRow[]> {
  const { data } = await supabase
    .from('project_deliverables')
    .select('id, project_id, template_id, name, status, assigned_to, due_date, notes, date_submitted, date_accepted, sort_order, deliverable_templates(name)')
    .eq('project_id', projectId)
    .order('sort_order').order('created_at')
  return ((data ?? []) as any[]).map(r => ({
    ...r,
    deliverable_templates: Array.isArray(r.deliverable_templates) ? (r.deliverable_templates[0] ?? null) : r.deliverable_templates,
  })) as DeliverableRow[]
}

/** Date stamps for a status change (date_closed pattern). Advancing stamps the
 *  state's date if empty; regressing below a state clears its date. */
export function statusDates(row: DeliverableRow, next: DeliverableStatus): {
  date_submitted: string | null; date_accepted: string | null
} {
  const today = new Date().toISOString().slice(0, 10)
  const rank = (s: DeliverableStatus) => STATUS_ORDER.indexOf(s)
  return {
    date_submitted: rank(next) >= rank('submitted') ? (row.date_submitted ?? today) : null,
    date_accepted:  rank(next) >= rank('accepted')  ? (row.date_accepted ?? today)  : null,
  }
}

/** Compose-from-classification delta: union of the ACTIVE default templates of the
 *  project's currently-selected ACTIVE options, minus pool rows already present.
 *  Inactive options never compose; inactive templates never appear (sign-off 4). */
export async function composeDelta(projectId: string): Promise<DeliverableTemplate[]> {
  const [selRes, existRes] = await Promise.all([
    supabase.from('project_classifications').select('option_id, classification_options!inner(active)')
      .eq('project_id', projectId).eq('classification_options.active', true),
    supabase.from('project_deliverables').select('template_id').eq('project_id', projectId).not('template_id', 'is', null),
  ])
  const optionIds = ((selRes.data ?? []) as any[]).map(r => r.option_id as string)
  if (optionIds.length === 0) return []
  const { data: defs } = await supabase
    .from('option_deliverable_defaults')
    .select('template_id, deliverable_templates!inner(id, org_id, name, description, sort_order, active, created_at)')
    .in('option_id', optionIds)
    .eq('deliverable_templates.active', true)
  const have = new Set(((existRes.data ?? []) as any[]).map(r => r.template_id as string))
  const seen = new Map<string, DeliverableTemplate>()
  for (const d of (defs ?? []) as any[]) {
    const t = (Array.isArray(d.deliverable_templates) ? d.deliverable_templates[0] : d.deliverable_templates) as DeliverableTemplate
    if (t && !have.has(t.id) && !seen.has(t.id)) seen.set(t.id, t)
  }
  return [...seen.values()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/** Apply a composed delta. Idempotent: the UNIQUE(project_id, template_id) backstop
 *  plus ignoreDuplicates makes a concurrent double-apply a no-op. */
export async function applyCompose(projectId: string, templates: DeliverableTemplate[], baseSort: number): Promise<string | null> {
  if (templates.length === 0) return null
  const { error } = await supabase.from('project_deliverables').upsert(
    templates.map((t, i) => ({
      project_id: projectId, template_id: t.id, status: 'not_started', sort_order: baseSort + i,
    })),
    { onConflict: 'project_id,template_id', ignoreDuplicates: true },
  )
  return error?.message ?? null
}
