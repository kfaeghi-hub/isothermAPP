// 04 Project team — company · role · contact, from THIS project's team matrix.
// Display only, and scoped by construction: portal_team returns the project's
// roster, never the firm Directory. The 261 real contacts are unreachable from
// this world because no query here can name that table.
import type { PortalTeamRow } from '../../../lib/portal'
import { EmptyState } from '../ui/EmptyState'

export function Team({ team }: { team: PortalTeamRow[] }) {
  return (
    <section aria-labelledby="pt-team">
      <h2 id="pt-team" className="font-display text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400 mb-3">
        <span className="font-mono text-vermilion-400 mr-2">04</span>Project team
      </h2>

      <div className="pt-panel overflow-hidden">
        {team.length === 0 ? (
          <EmptyState
            headline="No team recorded yet"
            line="The project's companies and their commissioning roles appear here once the team matrix is set."
          />
        ) : (
          <ul className="divide-y divide-rule">
            {team.map((t, i) => (
              <li key={i} className="px-4 sm:px-5 py-3 flex items-baseline gap-3 sm:gap-4 flex-wrap">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-gray-400 w-12 flex-shrink-0">
                  {t.role_abbr ?? '—'}
                </span>
                <span className="font-medium text-ink-display min-w-0 flex-1">{t.company_name ?? '—'}</span>
                {t.contact_name && (
                  <span className="text-[13px] text-gray-500 sm:text-right">{t.contact_name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
