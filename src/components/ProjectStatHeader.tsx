import { useProjectStats } from '../lib/dashboardData'
import { VisitChip } from './VisitChip'
import { formatDate } from '../lib/format'

// Compact stat header on the project Overview tab — the SAME numbers as the
// dashboard portfolio card (both flow through fetchProjectStatsMap).
export function ProjectStatHeader({ projectId, onTab }: {
  projectId: string
  onTab: (tab: any) => void
}) {
  const stats = useProjectStats(projectId)
  if (!stats) return null

  const pct = stats.coverageExpected > 0
    ? Math.round(100 * stats.coverageRecorded / stats.coverageExpected) : null

  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200 px-5 py-4 mb-5 flex items-center gap-8 flex-wrap"
      data-testid="project-stat-header">
      <button onClick={() => onTab('issues')} className="text-left group">
        <p className={`font-mono text-[24px] font-medium leading-none tabular-nums tracking-[-0.02em] ${stats.openFindings ? 'text-amber-700' : 'text-gray-900'}`}>{stats.openFindings}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5 group-hover:text-standard-600 transition-colors">Open Findings</p>
      </button>
      <button onClick={() => onTab('checklists')} className="text-left group">
        <p className="font-mono text-[24px] font-medium leading-none tabular-nums tracking-[-0.02em] text-gray-900">{pct === null ? '—' : `${pct}%`}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5 group-hover:text-standard-600 transition-colors">Checklist Coverage</p>
      </button>
      <div>
        <VisitChip lastVisit={stats.lastVisit} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5">Last Visit</p>
      </div>
      <button onClick={() => onTab('meetings')} className="text-left group">
        <p className="font-mono text-[24px] font-medium leading-none tabular-nums tracking-[-0.02em] text-gray-900">
          {stats.nextMeeting ? formatDate(stats.nextMeeting) : '—'}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5 group-hover:text-standard-600 transition-colors">Next Meeting</p>
      </button>
    </div>
  )
}
