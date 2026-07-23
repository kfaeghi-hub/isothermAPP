// Dashboard — the app's home (§6B internal half). Four sections:
//   A · Now (stat chips + attention queue)   B · Projects (cards, radar, timeline)
//   C · Findings (trend, by system, responsible rollup)   D · Mine (my items, activity)
// All reads, zero writes; thresholds come from dashboardThresholds only.

import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell, Legend,
  CartesianGrid,
} from 'recharts'
import { CHART } from '../lib/chartTheme'
import { fetchDashboard, type DashboardData, type RespGroup, type DeliverableItem } from '../lib/dashboardData'
import { STATUS_META } from '../lib/deliverables'
import { fetchClassificationConfig, type ClassificationConfig } from '../lib/classifications'
import { ClassificationBadges } from '../components/ClassificationBadges'
import { useAuth } from '../contexts/AuthContext'
import { daysSince, visitBand } from '../lib/dashboardThresholds'
import { VisitChip } from '../components/VisitChip'
import { formatDate } from '../lib/format'

const QUEUE_KIND: Record<string, { label: string; cls: string }> = {
  overdue_item:    { label: 'OVERDUE',   cls: 'bg-red-50 text-red-700' },
  aged_finding:    { label: 'AGED',      cls: 'bg-amber-50 text-amber-700' },
  stale_draft:     { label: 'DRAFT',     cls: 'bg-sky-50 text-sky-700' },
  stale_checklist: { label: 'CHECKLIST', cls: 'bg-violet-50 text-violet-700' },
  overdue_deliverable: { label: 'DELIVERABLE', cls: 'bg-rose-50 text-rose-700' },
}

function ageChip(age: number): string {
  if (age >= 90) return '90+'
  if (age >= 60) return '60+'
  return '30+'
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [config, setConfig] = useState<ClassificationConfig>({ dimensions: [], options: [] })
  const [showAllQueue, setShowAllQueue] = useState(false)
  const [expandedResp, setExpandedResp] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchDashboard(profile?.name ?? ''), fetchClassificationConfig()])
      .then(([d, c]) => { if (alive) { setData(d); setConfig(c) } })
    return () => { alive = false }
  }, [profile?.name])

  if (!data) return <div className="p-8 text-sm text-gray-400">Loading dashboard…</div>

  // Employee OR owner with zero memberships: RLS returns no projects at all.
  if (data.projects.length === 0 && ['user', 'owner'].includes(profile?.role ?? '')) {
    return (
      <div className="p-16 text-center" data-testid="no-membership">
        <p className="text-3xl mb-4 opacity-30">🔐</p>
        <p className="text-sm font-medium text-gray-600 mb-1">No projects assigned yet</p>
        <p className="text-xs text-gray-400">Ask an owner to add you to a project.</p>
      </div>
    )
  }

  const projName = (id: string) => data.projects.find(p => p.id === id)?.name ?? '?'
  const isGovernor = ['admin', 'developer', 'owner'].includes(profile?.role ?? '')
  const actives = data.projects.filter(p => p.status === 'active')
    .sort((a, b) => (a.finish_date ?? '9999').localeCompare(b.finish_date ?? '9999'))

  const queue = showAllQueue ? data.queue : data.queue.slice(0, 10)

  // Radar data: active projects, days since visit, stalest first, never pinned top.
  const radar = actives.map(p => {
    const days = daysSince(data.projectStats[p.id]?.lastVisit ?? null)
    return { name: p.name, days: days ?? 0, band: visitBand(days), never: days === null }
  }).sort((a, b) => (a.never === b.never ? b.days - a.days : a.never ? -1 : 1))

  // Timeline: transparent offset bar + duration bar, today reference line.
  const dated = actives.filter(p => p.start_date && p.finish_date)
  const minStart = dated.reduce((m, p) => (p.start_date! < m ? p.start_date! : m), '9999-12-31')
  const dayNum = (d: string) => Math.floor(new Date(`${d}T12:00:00`).getTime() / 86_400_000)
  const base = dated.length ? dayNum(minStart) : 0
  const timeline = dated.map(p => ({
    name: p.name,
    offset: dayNum(p.start_date!) - base,
    duration: Math.max(1, dayNum(p.finish_date!) - dayNum(p.start_date!)),
  }))
  const todayOffset = dated.length ? dayNum(new Date().toISOString().slice(0, 10)) - base : 0
  const undated = actives.filter(p => !p.start_date || !p.finish_date)
  const tlDateLabel = (v: number) => {
    const d = new Date((base + v) * 86_400_000)
    return `${d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' })}`
  }

  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="h-full overflow-auto">
      {/* Floating document chrome: the register's title rides over content */}
      <div className="chrome-material sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 pt-5 pb-3 flex items-end justify-between border-b-2 border-gray-900">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Isotherm Engineering · Commissioning Record
            </p>
            <h1 className="font-display text-[24px] font-bold text-gray-900 leading-tight mt-0.5 tracking-[-0.02em]">
              Portfolio Register
            </h1>
          </div>
          <p className="font-mono text-[11px] text-gray-500 pb-0.5">{today}</p>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6 space-y-10">

        {/* ── A · Now ─────────────────────────────────────────────────── */}
        <section className="space-y-5 rise" style={{ '--rise-i': 0 } as React.CSSProperties}>
          {/* Instrument readings as tiles: large optical numerals, real depth */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatChip label="Active Projects" value={data.stats.activeProjects} testid="chip-active" />
            <StatChip label="Open Findings" value={data.stats.openFindings} alert={data.stats.openFindings > 0} testid="chip-findings" />
            <StatChip label="Overdue Action Items" value={data.stats.overdueItems} alert={data.stats.overdueItems > 0} testid="chip-overdue" />
            <StatChip label="Avg Days to Close (90d)" value={data.stats.avgDaysToClose ?? '—'} testid="chip-close" />
          </div>

          <div className="card-tile bg-white rounded-xl border border-gray-200">
            <ClauseHead n="1" title="Attention Queue" extra={String(data.queue.length)} />
            {data.queue.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center" data-testid="queue-empty">Nothing needs attention.</p>
            ) : (
              <>
                {/* Mobile: stacked queue entries — the table row clipped the
                    finding title off-screen at 375 (found by the populated-data
                    re-audit; the empty state had hidden it). */}
                <div className="lg:hidden divide-y divide-gray-50">
                  {queue.map((q, i) => (
                    <Link key={i} to={`/projects/${q.projectId}?tab=${q.tab}`}
                      className="block px-4 py-2.5 active:bg-gray-50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 ${QUEUE_KIND[q.kind].cls}`}>
                          {QUEUE_KIND[q.kind].label}
                        </span>
                        {q.kind === 'aged_finding' && (
                          <span className="text-[9px] font-bold rounded px-1 py-0.5 bg-gray-100 text-gray-500">
                            {ageChip(q.ageDays)}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-500 truncate">{projName(q.projectId)}</span>
                        {q.detail && <span className="ml-auto text-[10px] text-gray-400 font-mono">{q.detail}</span>}
                      </div>
                      <p className="text-xs text-gray-800 mt-1">{q.description}</p>
                    </Link>
                  ))}
                </div>
                <table className="w-full text-xs hidden lg:table" data-testid="attention-queue">
                  <tbody>
                    {queue.map((q, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 w-28 whitespace-nowrap">
                          <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 ${QUEUE_KIND[q.kind].cls}`}>
                            {QUEUE_KIND[q.kind].label}
                          </span>
                          {q.kind === 'aged_finding' && (
                            <span className="ml-1 text-[9px] font-bold rounded px-1 py-0.5 bg-gray-100 text-gray-500">
                              {ageChip(q.ageDays)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 w-48 text-gray-500 truncate max-w-[12rem]">{projName(q.projectId)}</td>
                        <td className="px-2 py-2 text-gray-800 truncate max-w-md">{q.description}</td>
                        <td className="px-2 py-2 w-24 text-gray-400 font-mono whitespace-nowrap">{q.detail}</td>
                        <td className="px-4 py-2 w-16 text-right">
                          <Link to={`/projects/${q.projectId}?tab=${q.tab}`} className="text-teal-700 hover:underline">Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.queue.length > 10 && (
                  <button onClick={() => setShowAllQueue(s => !s)}
                    className="w-full py-2 text-[11px] text-teal-700 hover:bg-teal-50/40">
                    {showAllQueue ? 'Show fewer' : `Show all ${data.queue.length}`}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── B · Projects ────────────────────────────────────────────── */}
        <section className="space-y-4 rise" style={{ '--rise-i': 1 } as React.CSSProperties}>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4 content-start" data-testid="portfolio-cards">
              {actives.map(p => {
                const s = data.projectStats[p.id]
                const pct = s && s.coverageExpected > 0 ? Math.round(100 * s.coverageRecorded / s.coverageExpected) : null
                const daysToFinish = p.finish_date ? -(daysSince(p.finish_date) ?? 0) : null
                return (
                  <Link key={p.id} to={`/projects/${p.id}`}
                    className="card-tile bg-white rounded-xl border border-gray-200 p-4 hover:border-standard-500 transition-colors block">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-gray-900 truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{p.clientName ?? '—'}{p.com_number ? <> · <span className="font-mono">{p.com_number}</span></> : ''}</p>
                      </div>
                      <VisitChip lastVisit={s?.lastVisit ?? null} />
                    </div>
                    <div className="mb-2">
                      <ClassificationBadges dimensions={config.dimensions} options={config.options}
                        selections={data.selections[p.id] ?? {}} compact />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                      <span><strong className={s?.openFindings ? 'text-amber-700' : 'text-gray-700'}>{s?.openFindings ?? 0}</strong> open findings
                        {s && s.openedLast14d > 0 && <span className="text-gray-400"> (+{s.openedLast14d} in 14d)</span>}</span>
                      {s?.nextMeeting && <span>Next mtg <span className="font-mono">{formatDate(s.nextMeeting)}</span></span>}
                      {daysToFinish !== null && <span>{daysToFinish >= 0 ? `${daysToFinish}d to finish` : `${-daysToFinish}d past finish`}</span>}
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>Checklists</span><span>{pct === null ? 'no items' : `${pct}%`}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-600 rounded-full" style={{ width: `${pct ?? 0}%` }} />
                      </div>
                    </div>
                  </Link>
                )
              })}
              {actives.length === 0 && <p className="text-sm text-gray-400 p-4">No active projects.</p>}
            </div>

            <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="followup-radar">
              <ClauseHead n="2" title="Follow-up Radar" sub="days since last site visit — stalest first" />
              <div className="p-4">
              <ResponsiveContainer width="100%" height={Math.max(120, radar.length * 34)}>
                <BarChart data={radar} layout="vertical" margin={{ left: 8, right: 24, top: 14 }}>
                  <CartesianGrid horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" tick={CHART.tickMono} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={CHART.tick} axisLine={false} tickLine={false} />
                  <Tooltip {...CHART.tooltip} cursor={CHART.cursor}
                    formatter={(v: any, _n: any, e: any) => [e?.payload?.never ? 'never visited' : `${v} days`, 'since visit']} />
                  {/* Thresholds as annotations — bar LENGTH is the encoding, color never carries it alone */}
                  <ReferenceLine x={14} stroke={CHART.amber} strokeDasharray="4 3"
                    label={{ value: '14d', fontSize: 9, fill: CHART.amber, position: 'top' }} />
                  <ReferenceLine x={30} stroke={CHART.vermilion} strokeDasharray="4 3"
                    label={{ value: '30d', fontSize: 9, fill: CHART.vermilion, position: 'top' }} />
                  <Bar dataKey="days" radius={[0, CHART.endRadius, CHART.endRadius, 0]} minPointSize={3} barSize={CHART.barSize}>
                    {radar.map((r, i) => <Cell key={i} fill={r.never ? CHART.neutral : CHART.purple} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="portfolio-timeline">
            <ClauseHead n="3" title="Portfolio Timeline" />
            <div className="p-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400">No active projects with both start and finish dates.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(100, timeline.length * 36)}>
                <BarChart data={timeline} layout="vertical" margin={{ left: 8, right: 24, top: 14 }}>
                  <CartesianGrid horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" tickFormatter={tlDateLabel} tick={CHART.tickMono} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={CHART.tick} axisLine={false} tickLine={false} />
                  <Tooltip {...CHART.tooltip} cursor={CHART.cursor}
                    formatter={(v: any, name: any) => name === 'duration' ? [`${v} days`, 'duration'] : [null, null]}
                    labelFormatter={l => String(l)} />
                  <ReferenceLine x={todayOffset} stroke={CHART.vermilion} strokeDasharray="4 3"
                    label={{ value: 'today', fontSize: 9, fill: CHART.vermilion, position: 'top' }} />
                  <Bar dataKey="offset" stackId="tl" fill="transparent" />
                  <Bar dataKey="duration" stackId="tl" fill={CHART.purple} radius={CHART.endRadius} barSize={CHART.barSize} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {undated.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">
                No dates: {undated.map(p => p.name).join(', ')}
              </p>
            )}
            </div>
          </div>
        </section>

        {/* ── C · Findings ────────────────────────────────────────────── */}
        <section className="space-y-4 rise" style={{ '--rise-i': 2 } as React.CSSProperties}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="trend-chart">
              <ClauseHead n="4" title="Findings Opened vs Closed" sub="6 months" />
              <div className="p-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.trend} barGap={2}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="month" tick={CHART.tickMono} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={CHART.tickMono} axisLine={false} tickLine={false} />
                  <Tooltip {...CHART.tooltip} cursor={CHART.cursor} />
                  <Legend iconSize={CHART.legend.iconSize} wrapperStyle={CHART.legend.wrapperStyle} />
                  <Bar dataKey="opened" fill={CHART.amber} radius={[CHART.endRadius, CHART.endRadius, 0, 0]} barSize={CHART.barSize} />
                  <Bar dataKey="closed" fill={CHART.green} radius={[CHART.endRadius, CHART.endRadius, 0, 0]} barSize={CHART.barSize} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>

            <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="system-chart">
              <ClauseHead n="5" title="Open Findings by System" />
              <div className="p-4">
              {data.bySystem.length === 0 ? (
                <p className="text-sm text-gray-400">No open findings.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(120, data.bySystem.length * 30)}>
                  <BarChart data={data.bySystem} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid horizontal={false} stroke={CHART.grid} />
                    <XAxis type="number" allowDecimals={false} tick={CHART.tickMono} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="system" width={110} tick={CHART.tick} axisLine={false} tickLine={false} />
                    <Tooltip {...CHART.tooltip} cursor={CHART.cursor} />
                    <Bar dataKey="count" fill={CHART.purple} radius={[0, CHART.endRadius, CHART.endRadius, 0]} barSize={CHART.barSize} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              </div>
            </div>
          </div>

          <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="responsible-table">
            <div className="border-b border-gray-200">
              <ClauseHead n="6" title="Open Items by Responsible Party" />
              <p className="text-[10px] text-gray-400 px-4 pb-2 -mt-1">Meeting action items + findings, grouped by company via the team matrix. Free-text labels listed separately — never string-matched.</p>
            </div>
            {data.responsible.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No open assigned items.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-2">Responsible</th>
                    <th className="px-2 py-2 w-20">Open</th>
                    <th className="px-2 py-2 w-24">Projects</th>
                    <th className="px-2 py-2 w-24">Oldest</th>
                    <th className="px-4 py-2 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {data.responsible.map(g => (
                    <RespRow key={g.key} group={g} expanded={expandedResp === g.key}
                      onToggle={() => setExpandedResp(expandedResp === g.key ? null : g.key)}
                      projName={projName} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── D · Mine ────────────────────────────────────────────────── */}
        <section className="space-y-4 rise" style={{ '--rise-i': 3 } as React.CSSProperties}>
          <MyDeliverablesCard items={data.myDeliverables} projName={projName} profileName={profile?.name} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="my-items">
            <div className="border-b border-gray-200">
              <ClauseHead n="8" title="My Items" />
              <p className="px-4 pb-2 -mt-1 text-[10px] text-gray-400" title="Matched by your profile name against identified_by / prepared_by / authored_by — the existing text conventions.">
                Matched by name · {profile?.name}
              </p>
            </div>
            {data.mine.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">Nothing open under your name.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.mine.map((m, i) => (
                  <Link key={i} to={`/projects/${m.projectId}?tab=${m.tab}`}
                    className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-gray-50">
                    <span className="text-gray-800 truncate flex-1">{m.label}</span>
                    <span className="text-gray-400 truncate max-w-[10rem]">{projName(m.projectId)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="recent-activity">
            <ClauseHead n="9" title="Recent Activity" />
            <div className="divide-y divide-gray-50">
              {data.activity.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 text-xs">
                  <span className="text-gray-400 font-mono w-20 flex-shrink-0">{a.when.slice(0, 10)}</span>
                  <span className="text-gray-700 truncate flex-1">{a.what}</span>
                  {a.projectId && (
                    <Link to={`/projects/${a.projectId}`} className="text-teal-700 hover:underline flex-shrink-0">Open</Link>
                  )}
                </div>
              ))}
              {data.activity.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No activity yet.</p>
              )}
            </div>
          </div>
          </div>
        </section>

        {/* ── E · Outstanding Deliverables — governors only (§3b, clause 10) ── */}
        {isGovernor && (
          <section className="rise" style={{ '--rise-i': 4 } as React.CSSProperties}>
            <OutstandingDeliverablesCard items={data.outstandingDeliverables} projName={projName} />
          </section>
        )}
      </div>
    </div>
  )
}

/** One instrument reading: a tile with a large optically-tight numeral. */
function StatChip({ label, value, alert = false, testid }: {
  label: string; value: number | string; alert?: boolean; testid: string
}) {
  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200 px-5 py-4" data-testid={testid}>
      <p className={`font-mono text-[32px] font-medium leading-none tabular-nums tracking-[-0.02em] ${alert ? 'text-amber-700' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-2.5">{label}</p>
    </div>
  )
}

/** Clause head: the document's section grammar (number · title · rule). */
function ClauseHead({ n, title, extra, sub }: { n: string; title: string; extra?: string; sub?: string }) {
  return (
    <div className="px-4 py-2.5 border-b border-gray-200 flex items-baseline gap-2.5">
      <span className="font-mono text-[11px] font-medium text-standard-600">{n}</span>
      <h3 className="font-display text-xs font-bold text-gray-900 uppercase tracking-[0.08em]">{title}</h3>
      {extra !== undefined && <span className="font-mono text-[10px] text-gray-400">{extra}</span>}
      {sub && <span className="text-[10px] text-gray-400 ml-1">{sub}</span>}
    </div>
  )
}

function RespRow({ group, expanded, onToggle, projName }: {
  group: RespGroup
  expanded: boolean
  onToggle: () => void
  projName: (id: string) => string
}) {
  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2">
          <span className={group.matched ? 'font-medium text-gray-800' : 'text-gray-500 italic'}>
            {group.label}
          </span>
          {!group.matched && <span className="ml-1.5 text-[9px] text-gray-400 not-italic">free-text</span>}
        </td>
        <td className="px-2 py-2 font-mono">{group.count}</td>
        <td className="px-2 py-2 font-mono">{group.projectCount}</td>
        <td className="px-2 py-2 font-mono">{group.oldestAge}d</td>
        <td className="px-4 py-2 text-right text-teal-700">{expanded ? '▾' : '▸'}</td>
      </tr>
      {expanded && group.items.map((it, i) => (
        <tr key={i} className="border-b border-gray-50 bg-gray-50/50">
          <td className="pl-8 pr-4 py-1.5 text-gray-600 truncate max-w-md" colSpan={2}>{it.label}</td>
          <td className="px-2 py-1.5 text-gray-400 truncate max-w-[10rem]" colSpan={1}>{projName(it.projectId)}</td>
          <td className="px-2 py-1.5 text-gray-400 font-mono">{it.ageDays ?? '—'}d</td>
          <td className="px-4 py-1.5 text-right">
            <Link to={`/projects/${it.projectId}?tab=${it.tab}`} className="text-teal-700 hover:underline"
              onClick={e => e.stopPropagation()}>Open</Link>
          </td>
        </tr>
      ))}
    </>
  )
}

/** Deliverable status chip — single source of truth (STATUS_META). */
function StatusChip({ status }: { status: DeliverableItem['status'] }) {
  const m = STATUS_META[status]
  return <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap ${m.cls}`}>{m.label}</span>
}

/** Due date, flagged rose when overdue (same treatment as the attention queue). */
function DueCell({ due, overdue }: { due: string | null; overdue: boolean }) {
  if (!due) return <span className="text-gray-300">—</span>
  return overdue
    ? <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-rose-50 text-rose-700 whitespace-nowrap">{formatDate(due)}</span>
    : <span className="text-gray-600 font-mono whitespace-nowrap">{formatDate(due)}</span>
}

/** #3c — the current user's assigned, still-outstanding deliverables (name convention). */
function MyDeliverablesCard({ items, projName, profileName }: {
  items: DeliverableItem[]; projName: (id: string) => string; profileName?: string
}) {
  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="my-deliverables">
      <div className="border-b border-gray-200">
        <ClauseHead n="7" title="My Deliverables" extra={String(items.length)} />
        <p className="px-4 pb-2 -mt-1 text-[10px] text-gray-400">Assigned to you · {profileName}</p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">No deliverables assigned to you.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2">Deliverable</th>
                <th className="px-2 py-2 w-40">Project</th>
                <th className="px-2 py-2 w-28">Status</th>
                <th className="px-2 py-2 w-28">Due</th>
                <th className="px-2 py-2">Notes</th>
                <th className="px-4 py-2 w-14" />
              </tr>
            </thead>
            <tbody>
              {items.map(d => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800 truncate max-w-[16rem]">{d.name}</td>
                  <td className="px-2 py-2 text-gray-500 truncate max-w-[10rem]">{projName(d.projectId)}</td>
                  <td className="px-2 py-2"><StatusChip status={d.status} /></td>
                  <td className="px-2 py-2"><DueCell due={d.dueDate} overdue={d.overdue} /></td>
                  <td className="px-2 py-2 text-gray-400 truncate max-w-[12rem]">{d.notes ?? ''}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/projects/${d.projectId}?tab=deliverables`} className="text-teal-700 hover:underline">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** #3b — governors' cross-project "who owes me what," grouped by project.
 *  Scoping is automatic: the dashboard query runs under RLS, so an owner only
 *  ever sees their member projects here. */
function OutstandingDeliverablesCard({ items, projName }: {
  items: DeliverableItem[]; projName: (id: string) => string
}) {
  // Group by project, preserving the incoming overdue-first ordering within each.
  const byProject: Array<[string, DeliverableItem[]]> = []
  const idx = new Map<string, DeliverableItem[]>()
  for (const d of items) {
    let arr = idx.get(d.projectId)
    if (!arr) { arr = []; idx.set(d.projectId, arr); byProject.push([d.projectId, arr]) }
    arr.push(d)
  }
  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200" data-testid="outstanding-deliverables">
      <div className="border-b border-gray-200">
        <ClauseHead n="10" title="Outstanding Deliverables" extra={String(items.length)} />
        <p className="px-4 pb-2 -mt-1 text-[10px] text-gray-400">
          Across your projects · assignee · due · notes — overdue flagged. Scoped to your memberships.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">Nothing outstanding across your projects.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2">Deliverable</th>
                <th className="px-2 py-2 w-40">Assignee</th>
                <th className="px-2 py-2 w-28">Status</th>
                <th className="px-2 py-2 w-28">Due</th>
                <th className="px-2 py-2">Notes</th>
                <th className="px-4 py-2 w-14" />
              </tr>
            </thead>
            <tbody>
              {byProject.map(([pid, ds]) => (
                <Fragment key={pid}>
                  <tr className="bg-gray-50/70" data-testid="outstanding-project">
                    <td colSpan={6} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {projName(pid)}
                    </td>
                  </tr>
                  {ds.map(d => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800 truncate max-w-[16rem]">{d.name}</td>
                      <td className="px-2 py-2 text-gray-600 truncate max-w-[10rem]">
                        {d.assignedTo ?? <span className="text-gray-300 italic">unassigned</span>}
                      </td>
                      <td className="px-2 py-2"><StatusChip status={d.status} /></td>
                      <td className="px-2 py-2"><DueCell due={d.dueDate} overdue={d.overdue} /></td>
                      <td className="px-2 py-2 text-gray-400 truncate max-w-[12rem]">{d.notes ?? ''}</td>
                      <td className="px-4 py-2 text-right">
                        <Link to={`/projects/${d.projectId}?tab=deliverables`} className="text-teal-700 hover:underline">Open</Link>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
