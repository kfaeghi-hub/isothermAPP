// Dashboard data layer — plain authenticated reads, client-side aggregation.
// Every query runs under the caller's RLS; the one SQL view
// (dashboard_checklist_coverage) is security_invoker. Zero writes.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import {
  FINDING_AGED_DAYS, DRAFT_STALE_DAYS, CHECKLIST_STALE_DAYS,
  DELIVERABLE_OVERDUE_GRACE_DAYS, daysSince,
} from './dashboardThresholds'

// ── Shared per-project stats (portfolio card + project Overview header) ──────
// ONE derivation path: the dashboard batches all projects, the Overview header
// asks for a single id — both flow through fetchProjectStatsMap, so the numbers
// cannot diverge.

export interface ProjectStats {
  openFindings: number
  openedLast14d: number
  coverageExpected: number
  coverageRecorded: number
  lastVisit: string | null      // latest site report date (report_date)
  nextMeeting: string | null    // nearest upcoming meeting date, else next_meeting_date
}

const EMPTY_STATS: ProjectStats = {
  openFindings: 0, openedLast14d: 0, coverageExpected: 0, coverageRecorded: 0,
  lastVisit: null, nextMeeting: null,
}

export async function fetchProjectStatsMap(projectIds: string[]): Promise<Record<string, ProjectStats>> {
  if (projectIds.length === 0) return {}
  const todayISO = new Date().toISOString().slice(0, 10)
  const [fRes, cRes, sRes, mRes] = await Promise.all([
    supabase.from('findings').select('project_id, status, date_raised').in('project_id', projectIds),
    supabase.from('dashboard_checklist_coverage').select('*').in('project_id', projectIds),
    supabase.from('site_reports').select('project_id, report_date').in('project_id', projectIds),
    supabase.from('meetings').select('project_id, meeting_date, next_meeting_date').in('project_id', projectIds),
  ])

  const map: Record<string, ProjectStats> = {}
  const stats = (id: string) => (map[id] ??= { ...EMPTY_STATS })

  for (const f of fRes.data ?? []) {
    const s = stats(f.project_id)
    if (f.status === 'open') s.openFindings++
    const age = daysSince(f.date_raised)
    if (age !== null && age <= 14) s.openedLast14d++
  }
  for (const c of cRes.data ?? []) {
    const s = stats(c.project_id)
    s.coverageExpected = Number(c.expected)
    s.coverageRecorded = Number(c.recorded)
  }
  for (const r of sRes.data ?? []) {
    const s = stats(r.project_id)
    if (r.report_date && (!s.lastVisit || r.report_date > s.lastVisit)) s.lastVisit = r.report_date
  }
  for (const m of mRes.data ?? []) {
    const s = stats(m.project_id)
    const candidates = [m.meeting_date, m.next_meeting_date]
      .filter((d): d is string => !!d && d >= todayISO)
    for (const d of candidates) {
      if (!s.nextMeeting || d < s.nextMeeting) s.nextMeeting = d
    }
  }
  for (const id of projectIds) stats(id)
  return map
}

/** Single-project stats for the Overview header — same code path as the cards. */
export function useProjectStats(projectId: string): ProjectStats | null {
  const [stats, setStats] = useState<ProjectStats | null>(null)
  useEffect(() => {
    let alive = true
    fetchProjectStatsMap([projectId]).then(m => { if (alive) setStats(m[projectId] ?? { ...EMPTY_STATS }) })
    return () => { alive = false }
  }, [projectId])
  return stats
}

// ── Firm-wide dashboard payload ───────────────────────────────────────────────

export interface DashProject {
  id: string
  name: string
  com_number: string | null
  status: string
  start_date: string | null
  finish_date: string | null
  clientName: string | null
}

export interface QueueRow {
  kind: 'overdue_item' | 'aged_finding' | 'stale_draft' | 'stale_checklist' | 'overdue_deliverable'
  projectId: string
  description: string
  detail: string          // "due 2026-07-10" / "42 days old"
  ageDays: number
  tab: string             // deep-link tab on the project
}

export interface RespGroupItem {
  projectId: string
  label: string           // "3.2 — discussion…" / "Finding #12 — title"
  ageDays: number | null
  tab: string
}

export interface RespGroup {
  key: string
  label: string           // "GC — Bird Construction" | company name | raw text
  matched: boolean        // false = free-text label (surfaced, never string-matched)
  count: number
  projectCount: number
  oldestAge: number
  items: RespGroupItem[]
}

export interface ActivityRow {
  when: string
  what: string
  projectId: string | null
}

export interface MineItem {
  section: 'finding' | 'meeting' | 'report' | 'checklist' | 'deliverable'
  projectId: string
  label: string
  tab: string
}

export interface DashboardData {
  projects: DashProject[]              // ALL projects (name lookup); actives derived
  stats: { activeProjects: number; openFindings: number; overdueItems: number; avgDaysToClose: number | null }
  queue: QueueRow[]
  projectStats: Record<string, ProjectStats>
  selections: Record<string, Record<string, string[]>>   // project → dimension → option ids
  trend: Array<{ month: string; opened: number; closed: number }>
  bySystem: Array<{ system: string; count: number }>
  responsible: RespGroup[]
  mine: MineItem[]
  activity: ActivityRow[]
}

const monthKey = (d: string) => d.slice(0, 7)

export async function fetchDashboard(profileName: string): Promise<DashboardData> {
  const now = Date.now()
  const todayISO = new Date().toISOString().slice(0, 10)
  const d90 = new Date(now - 90 * 86_400_000).toISOString().slice(0, 10)
  const trendStart = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()

  const [pRes, fRes, miRes, mRes, srRes, ciRes, taRes, pcRes, pdRes] = await Promise.all([
    supabase.from('projects').select('id, name, com_number, status, start_date, finish_date, created_at, companies(name)'),
    supabase.from('findings').select('id, project_id, number, title, status, date_raised, date_closed, category, created_at, identified_by, responsible_party_id, contacts(company_id, companies(name, abbreviation))'),
    supabase.from('meeting_items')
      .select('id, item_number, discussion, due_date, status, responsible_assignment_id, responsible_text, created_at, meetings(project_id, meeting_number, meeting_types(name))')
      .eq('status', 'open'),
    supabase.from('meetings').select('id, project_id, meeting_number, status, created_at, issued_at, prepared_by, meeting_types(name)'),
    supabase.from('site_reports').select('id, project_id, report_number, report_date, created_at, updated_at, storage_url, authored_by'),
    supabase.from('checklist_instances').select('id, project_id, status, created_at, updated_at, completed_at, authored_by, source_template_name_snapshot'),
    supabase.from('project_team_assignments').select('id, project_id, company_id, companies(name, abbreviation), company_role_types(name, abbreviation)'),
    supabase.from('project_classifications').select('project_id, dimension_id, option_id'),
    supabase.from('project_deliverables')
      .select('id, project_id, template_id, name, status, assigned_to, due_date, deliverable_templates(name)')
      .not('status', 'in', '(submitted,accepted)'),
  ])

  const one = <T,>(v: T | T[] | null | undefined): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  const projects: DashProject[] = ((pRes.data ?? []) as any[]).map(p => ({
    id: p.id, name: p.name, com_number: p.com_number, status: p.status,
    start_date: p.start_date, finish_date: p.finish_date,
    clientName: one<any>(p.companies)?.name ?? null,
  }))
  const findings = (fRes.data ?? []) as any[]
  const meetingItems = (miRes.data ?? []) as any[]
  const meetings = (mRes.data ?? []) as any[]
  const reports = (srRes.data ?? []) as any[]
  const instances = (ciRes.data ?? []) as any[]
  const assignments = (taRes.data ?? []) as any[]
  // Non-submitted/accepted deliverables only (queue + My Items feed).
  const deliverables = ((pdRes.data ?? []) as any[]).map(d => ({
    ...d, displayName: d.name ?? one<any>(d.deliverable_templates)?.name ?? '(unnamed)',
  }))

  const activeIds = projects.filter(p => p.status === 'active').map(p => p.id)

  // ── A1 chips ────────────────────────────────────────────────────────────
  const openFindings = findings.filter(f => f.status === 'open')
  const overdue = meetingItems.filter(i => i.due_date && i.due_date < todayISO)
  const closed90 = findings.filter(f => f.date_closed && f.date_closed >= d90)
  const avgDaysToClose = closed90.length
    ? Math.round(closed90.reduce((s, f) =>
        s + (new Date(f.date_closed).getTime() - new Date(f.date_raised).getTime()) / 86_400_000, 0) / closed90.length)
    : null

  // ── A2 attention queue ──────────────────────────────────────────────────
  const queue: QueueRow[] = []
  for (const i of overdue) {
    const mtg = one<any>(i.meetings)
    if (!mtg) continue
    queue.push({
      kind: 'overdue_item', projectId: mtg.project_id,
      description: `Item ${i.item_number} — ${i.discussion || '(no discussion)'}`,
      detail: `due ${i.due_date}`, ageDays: daysSince(i.due_date) ?? 0, tab: 'meetings',
    })
  }
  for (const f of openFindings) {
    const age = daysSince(f.date_raised) ?? 0
    if (age > FINDING_AGED_DAYS) queue.push({
      kind: 'aged_finding', projectId: f.project_id,
      description: `Finding #${f.number ?? '—'} — ${f.title ?? f.category}`,
      detail: `${age}d open`, ageDays: age, tab: 'issues',
    })
  }
  for (const m of meetings.filter(m => m.status === 'draft')) {
    const age = daysSince(m.created_at) ?? 0
    if (age > DRAFT_STALE_DAYS) queue.push({
      kind: 'stale_draft', projectId: m.project_id,
      description: `${one<any>(m.meeting_types)?.name ?? 'Meeting'} #${m.meeting_number} still draft`,
      detail: `${age}d`, ageDays: age, tab: 'meetings',
    })
  }
  for (const r of reports.filter(r => !r.storage_url)) {
    const age = daysSince(r.created_at) ?? 0
    if (age > DRAFT_STALE_DAYS) queue.push({
      kind: 'stale_draft', projectId: r.project_id,
      description: `Site Note #${r.report_number} never generated`,
      detail: `${age}d`, ageDays: age, tab: 'site_reports',
    })
  }
  for (const ci of instances.filter(c => c.status === 'in_progress')) {
    const age = daysSince(ci.updated_at) ?? 0
    if (age > CHECKLIST_STALE_DAYS) queue.push({
      kind: 'stale_checklist', projectId: ci.project_id,
      description: `${ci.source_template_name_snapshot} untouched`,
      detail: `${age}d idle`, ageDays: age, tab: 'checklists',
    })
  }
  for (const d of deliverables) {
    if (!d.due_date) continue
    const late = daysSince(d.due_date) ?? 0
    if (late > DELIVERABLE_OVERDUE_GRACE_DAYS) queue.push({
      kind: 'overdue_deliverable', projectId: d.project_id,
      description: `${d.displayName} overdue`,
      detail: `${late}d overdue`, ageDays: late, tab: 'deliverables',
    })
  }
  queue.sort((a, b) => b.ageDays - a.ageDays)

  // ── B: per-project stats + classification selections ───────────────────
  const projectStats = await fetchProjectStatsMap(activeIds)
  const selections: DashboardData['selections'] = {}
  for (const r of (pcRes.data ?? []) as any[]) {
    ((selections[r.project_id] ??= {})[r.dimension_id] ??= []).push(r.option_id)
  }

  // ── C6 trend (last 6 months) ────────────────────────────────────────────
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const trend = months.map(m => ({
    month: m,
    opened: findings.filter(f => f.date_raised >= trendStart && monthKey(f.date_raised) === m).length,
    closed: findings.filter(f => f.date_closed && f.date_closed >= trendStart && monthKey(f.date_closed) === m).length,
  }))

  // ── C7 open by system ───────────────────────────────────────────────────
  const sysCounts = new Map<string, number>()
  for (const f of openFindings) sysCounts.set(f.category, (sysCounts.get(f.category) ?? 0) + 1)
  const bySystem = [...sysCounts.entries()].map(([system, count]) => ({ system, count }))
    .sort((a, b) => b.count - a.count)

  // ── C8 responsible rollup — company-id keys, NEVER string matching ─────
  const asgMap = new Map(assignments.map(a => {
    const co = one<any>(a.companies), ro = one<any>(a.company_role_types)
    return [a.id, {
      companyId: a.company_id as string,
      label: `${ro?.abbreviation ?? ro?.name ?? '?'} — ${co?.name ?? '?'}`,
      companyLabel: co?.name ?? '?',
    }]
  }))
  const groups = new Map<string, RespGroup>()
  const addToGroup = (key: string, label: string, matched: boolean, item: RespGroupItem) => {
    let g = groups.get(key)
    if (!g) { g = { key, label, matched, count: 0, projectCount: 0, oldestAge: 0, items: [] }; groups.set(key, g) }
    g.count++
    g.items.push(item)
    if ((item.ageDays ?? 0) > g.oldestAge) g.oldestAge = item.ageDays ?? 0
  }
  for (const i of meetingItems) {
    const mtg = one<any>(i.meetings)
    if (!mtg) continue
    const item: RespGroupItem = {
      projectId: mtg.project_id,
      label: `${i.item_number} — ${(i.discussion || '').slice(0, 80)}`,
      ageDays: daysSince(i.created_at), tab: 'meetings',
    }
    const asg = i.responsible_assignment_id ? asgMap.get(i.responsible_assignment_id) : null
    if (asg) addToGroup(`co:${asg.companyId}`, asg.label, true, item)
    else if ((i.responsible_text ?? '').trim()) addToGroup(`txt:${i.responsible_text.trim().toLowerCase()}`, i.responsible_text.trim(), false, item)
  }
  for (const f of openFindings) {
    const c = one<any>(f.contacts)
    if (!c?.company_id) continue
    const co = one<any>(c.companies)
    addToGroup(`co:${c.company_id}`, co?.name ?? '?', true, {
      projectId: f.project_id,
      label: `Finding #${f.number ?? '—'} — ${(f.title ?? f.category).slice(0, 80)}`,
      ageDays: daysSince(f.date_raised), tab: 'issues',
    })
  }
  const responsible = [...groups.values()].map(g => ({
    ...g, projectCount: new Set(g.items.map(i => i.projectId)).size,
  })).sort((a, b) => (a.matched === b.matched ? b.count - a.count : a.matched ? -1 : 1))

  // ── D9 mine ─────────────────────────────────────────────────────────────
  const mine: MineItem[] = [
    ...openFindings.filter(f => f.identified_by === profileName).map(f => ({
      section: 'finding' as const, projectId: f.project_id,
      label: `Finding #${f.number ?? '—'} — ${f.title ?? f.category}`, tab: 'issues',
    })),
    ...meetings.filter(m => m.status === 'draft' && m.prepared_by === profileName).map(m => ({
      section: 'meeting' as const, projectId: m.project_id,
      label: `${one<any>(m.meeting_types)?.name ?? 'Meeting'} #${m.meeting_number} (draft)`, tab: 'meetings',
    })),
    ...reports.filter(r => !r.storage_url && r.authored_by === profileName).map(r => ({
      section: 'report' as const, projectId: r.project_id,
      label: `Site Note #${r.report_number} (not generated)`, tab: 'site_reports',
    })),
    ...instances.filter(c => c.status === 'in_progress' && c.authored_by === profileName).map(c => ({
      section: 'checklist' as const, projectId: c.project_id,
      label: `${c.source_template_name_snapshot} (in progress)`, tab: 'checklists',
    })),
    // Deliverables assigned by profile name (§12 convention); already filtered
    // to non-submitted/accepted at the query.
    ...deliverables.filter(d => d.assigned_to === profileName).map(d => ({
      section: 'deliverable' as const, projectId: d.project_id,
      label: `${d.displayName} (${String(d.status).replace('_', ' ')})`, tab: 'deliverables',
    })),
  ]

  // ── D10 recent activity (derived — no events table) ────────────────────
  const activity: ActivityRow[] = [
    ...findings.map(f => ({ when: f.created_at as string, what: `Finding #${f.number ?? '—'} created`, projectId: f.project_id })),
    ...findings.filter(f => f.date_closed).map(f => ({ when: `${f.date_closed}T12:00:00`, what: `Finding #${f.number ?? '—'} closed`, projectId: f.project_id })),
    ...meetings.filter(m => m.issued_at).map(m => ({ when: m.issued_at as string, what: `${one<any>(m.meeting_types)?.name ?? 'Meeting'} #${m.meeting_number} minutes issued`, projectId: m.project_id })),
    // Site reports have no issued timestamp — updated_at of generated reports is the
    // honest approximation, labeled as "generated" not "issued".
    ...reports.filter(r => r.storage_url).map(r => ({ when: r.updated_at as string, what: `Site Note #${r.report_number} report generated`, projectId: r.project_id })),
    ...instances.filter(c => c.completed_at).map(c => ({ when: c.completed_at as string, what: `${c.source_template_name_snapshot} completed`, projectId: c.project_id })),
    ...projects.map(p => ({ when: (pRes.data as any[]).find(x => x.id === p.id)?.created_at ?? '', what: `Project created — ${p.name}`, projectId: p.id })),
  ].filter(a => a.when).sort((a, b) => b.when.localeCompare(a.when)).slice(0, 15)

  return {
    projects,
    stats: {
      activeProjects: activeIds.length,
      openFindings: openFindings.length,
      overdueItems: overdue.length,
      avgDaysToClose,
    },
    queue, projectStats, selections, trend, bySystem, responsible, mine, activity,
  }
}
