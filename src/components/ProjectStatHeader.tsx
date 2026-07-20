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
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-3 mb-5 flex items-center gap-6 flex-wrap"
      data-testid="project-stat-header">
      <button onClick={() => onTab('issues')} className="text-left group">
        <p className={`text-lg font-bold leading-none ${stats.openFindings ? 'text-amber-700' : 'text-[#1F3A5F]'}`}>{stats.openFindings}</p>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-1 group-hover:text-teal-700">Open Findings</p>
      </button>
      <button onClick={() => onTab('checklists')} className="text-left group">
        <p className="text-lg font-bold leading-none text-[#1F3A5F]">{pct === null ? '—' : `${pct}%`}</p>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-1 group-hover:text-teal-700">Checklist Coverage</p>
      </button>
      <div>
        <VisitChip lastVisit={stats.lastVisit} />
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">Last Visit</p>
      </div>
      <button onClick={() => onTab('meetings')} className="text-left group">
        <p className="text-lg font-bold leading-none text-[#1F3A5F]">
          {stats.nextMeeting ? formatDate(stats.nextMeeting) : '—'}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-1 group-hover:text-teal-700">Next Meeting</p>
      </button>
    </div>
  )
}
