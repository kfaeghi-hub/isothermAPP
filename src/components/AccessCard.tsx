import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { reportError } from '../lib/mutationError'
import { useAuth } from '../contexts/AuthContext'

// Project Access card (Overview tab, ADMIN-ONLY render — parent gates it).
// Membership management is owner-only by design: leads run settings, owners
// decide who is on the project (proposal §1.3 / §9.4a).

interface MemberRow {
  id: string
  profile_id: string
  is_lead: boolean
  added_by: string | null
  added_by_name: string | null
  user_profiles: { id: string; name: string; role: string } | null
}

interface ProfileRow { id: string; name: string; role: string }

export function AccessCard({ projectId }: { projectId: string }) {
  const { profile } = useAuth()
  const [members, setMembers]   = useState<MemberRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [adding, setAdding]     = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<MemberRow | null>(null)

  const fetchAll = useCallback(async () => {
    // Profiles via the DEFINER RPC: owners can list internal profiles for the
    // picker without widening user_profiles RLS; employees/clients get zero rows.
    // Member names are mapped FROM the RPC result — a direct user_profiles embed
    // would show an owner only their own row under RLS.
    const [mRes, pRes] = await Promise.all([
      supabase.from('project_members')
        .select('id, profile_id, is_lead, added_by')
        .eq('project_id', projectId),
      supabase.rpc('list_internal_profiles'),
    ])
    const profs = (pRes.data ?? []) as ProfileRow[]
    const byId = new Map(profs.map(p => [p.id, p]))
    setMembers(((mRes.data ?? []) as any[]).map(m => ({
      ...m,
      user_profiles: byId.get(m.profile_id) ?? null,
      added_by_name: m.added_by ? (byId.get(m.added_by)?.name ?? null) : null,
    })))
    setProfiles(profs)
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function addMember(profileId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('project_members').insert({
      project_id: projectId, profile_id: profileId, added_by: user?.id ?? null,
    })
    if (reportError(error, 'add the member')) return
    setAdding(false)
    fetchAll()
  }

  async function toggleLead(m: MemberRow) {
    const { error } = await supabase.from('project_members').update({ is_lead: !m.is_lead }).eq('id', m.id)
    if (reportError(error, 'update the lead role')) return
    fetchAll()
  }

  async function removeMember(m: MemberRow) {
    const { error } = await supabase.from('project_members').delete().eq('id', m.id)
    if (reportError(error, 'remove the member')) return
    setConfirmRemove(null)
    fetchAll()
  }

  const memberIds = new Set(members.map(m => m.profile_id))
  const addable = profiles.filter(p => !memberIds.has(p.id))
  const sorted = [...members].sort((a, b) =>
    (b.is_lead ? 1 : 0) - (a.is_lead ? 1 : 0)
    || (a.user_profiles?.name ?? '').localeCompare(b.user_profiles?.name ?? ''))

  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200 p-5" data-testid="access-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Access</h3>
        <button onClick={() => setAdding(a => !a)}
          className="text-xs text-teal-700 hover:underline">+ Add member</button>
      </div>

      {adding && (
        <div className="mb-3 border border-gray-200 rounded p-2 space-y-0.5 max-h-40 overflow-auto">
          {addable.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-1">Everyone is already a member.</p>
          ) : addable.map(p => (
            <button key={p.id} onClick={() => addMember(p.id)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-teal-50 text-xs flex items-center gap-2">
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="text-gray-400 capitalize">{p.role === 'user' ? 'employee' : p.role}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.map(m => {
          // The auto-lead creator self-added at project creation (added_by = self).
          const isCreator = !!m.added_by && m.added_by === m.profile_id
          return (
          <div key={m.id} className="flex items-center gap-2 text-sm group">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-gray-800">{m.user_profiles?.name ?? '(deleted user)'}</span>
                <span className="text-[10px] text-gray-400 capitalize">
                  {m.user_profiles?.role === 'user' ? 'employee' : m.user_profiles?.role}
                </span>
                {isCreator && (
                  <span className="text-[9px] font-semibold text-teal-700 bg-teal-50 rounded px-1 py-0.5">CREATOR</span>
                )}
              </div>
              {(isCreator || m.added_by_name) && (
                <p className="text-[10px] text-gray-400">
                  {isCreator ? 'created this project' : `added by ${m.added_by_name}`}
                </p>
              )}
            </div>
            {m.profile_id === profile?.id ? (
              // No one may change their OWN lead status (RLS members_update self-
              // exclusion) — show it as a static badge, not an actionable toggle.
              <span
                title={m.is_lead ? 'Lead (you)' : 'Member (you)'}
                className={`flex-shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                  m.is_lead ? 'bg-[#1F3A5F] text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                {m.is_lead ? 'LEAD' : 'MEMBER'}
              </span>
            ) : (
              <button
                onClick={() => toggleLead(m)}
                title={m.is_lead ? 'Lead — click to make member' : 'Member — click to make lead'}
                className={`flex-shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors ${
                  m.is_lead ? 'bg-[#1F3A5F] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {m.is_lead ? 'LEAD' : 'MEMBER'}
              </button>
            )}
            {confirmRemove?.id === m.id ? (
              <span className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => removeMember(m)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white">Remove</button>
                <button onClick={() => setConfirmRemove(null)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmRemove(m)}
                className="flex-shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">×</button>
            )}
          </div>
          )
        })}
        {members.length === 0 && <p className="text-xs text-gray-400">No members.</p>}
      </div>
      <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
        Owners and admins can manage membership on projects they belong to. Leads can edit
        project settings. No one can change their own membership.
      </p>
    </div>
  )
}
