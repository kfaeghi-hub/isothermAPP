import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Minimal admin Users view: profiles + role + membership counts. NO user creation —
// the Supabase dashboard remains that path (provisioning UI is a future item).

interface ProfileRow { id: string; name: string; email: string; role: string }

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', developer: 'Developer', owner: 'Owner', user: 'Employee', client: 'Client',
}

export function UsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [counts, setCounts] = useState<Record<string, { total: number; leads: number }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('user_profiles').select('id, name, email, role').order('name'),
      supabase.from('project_members').select('profile_id, is_lead'),
    ]).then(([pRes, mRes]) => {
      if (!alive) return
      setProfiles((pRes.data ?? []) as ProfileRow[])
      const c: Record<string, { total: number; leads: number }> = {}
      for (const m of mRes.data ?? []) {
        const e = (c[m.profile_id] ??= { total: 0, leads: 0 })
        e.total++
        if (m.is_lead) e.leads++
      }
      setCounts(c)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading users…</div>

  const roleChip = (role: string) => (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
      role === 'admin' ? 'bg-[#1F3A5F] text-white'
      : role === 'owner' ? 'bg-amber-50 text-amber-800'
      : role === 'developer' ? 'bg-violet-50 text-violet-700'
      : role === 'user' ? 'bg-teal-50 text-teal-700'
      : 'bg-gray-100 text-gray-500'
    }`}>{ROLE_LABEL[role] ?? role}</span>
  )

  return (
    <div className="p-4 lg:p-6 max-w-3xl rise">
      {/* Mobile: stacked cards — the table clipped role chips and ran the
          membership columns off-screen at phone widths (RC3). */}
      <div className="lg:hidden divide-y divide-gray-100">
        {profiles.map(p => (
          <div key={p.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-800 text-sm">{p.name}</span>
              {roleChip(p.role)}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 break-all">{p.email}</p>
            {p.role !== 'client' && (
              <p className="font-mono text-[11px] text-gray-600 mt-1">
                {counts[p.id]?.total ?? 0} memberships · {counts[p.id]?.leads ?? 0} leads
              </p>
            )}
          </div>
        ))}
      </div>
      <table className="w-full text-sm border-collapse hidden lg:table" data-testid="users-table">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4 w-28">Role</th>
            <th className="py-2 pr-4 w-32">Memberships</th>
            <th className="py-2 w-24">Leads</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => (
            <tr key={p.id} className="border-b border-gray-100">
              <td className="py-2 pr-4 font-medium text-gray-800">{p.name}</td>
              <td className="py-2 pr-4 text-gray-500">{p.email}</td>
              <td className="py-2 pr-4">
                <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                  p.role === 'admin' ? 'bg-[#1F3A5F] text-white'
                  : p.role === 'owner' ? 'bg-amber-50 text-amber-800'
                  : p.role === 'developer' ? 'bg-violet-50 text-violet-700'
                  : p.role === 'user' ? 'bg-teal-50 text-teal-700'
                  : 'bg-gray-100 text-gray-500'
                }`}>{ROLE_LABEL[p.role] ?? p.role}</span>
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-gray-600">
                {p.role === 'client' ? '—' : counts[p.id]?.total ?? 0}
              </td>
              <td className="py-2 font-mono text-xs text-gray-600">
                {p.role === 'client' ? '—' : counts[p.id]?.leads ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-4">
        Admins and developers see every project regardless of membership. User creation and
        role changes happen in the Supabase dashboard (provisioning UI is future work).
        Per-project membership is managed on each project's Overview → Access card.
      </p>
    </div>
  )
}
