// Client / External Access card — the external roster in one place.
//
// DELIBERATELY SEPARATE from AccessCard rather than a section inside it.
// Internal membership and external access are different security boundaries
// (project_members vs portal_members), and the whole point of the Part A schema
// ruling was that the two never mix. The UI should not blur what the schema
// separates — someone scanning this card must never wonder whether a name in it
// is an Isotherm engineer.
//
// Owner/lead visible (9.4a) — the parent gates rendering; portal_roster and the
// endpoints gate again server-side, because a hidden card is not a control.
import { useCallback, useEffect, useState } from 'react'
import { Eye, Copy, Check, Link2, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { reportError, reportWriteBlocked } from '../lib/mutationError'
import { authedFetch, apiErrorMessage } from '../lib/api'

interface RosterRow {
  member_id: string; profile_id: string; name: string | null; email: string | null
  invited_at: string | null; accepted_at: string | null; invited_by_name: string | null
}
interface InviteRow {
  id: string; email: string; created_at: string; expires_at: string
  redeemed_at: string | null; revoked_at: string | null
}
interface LinkRow {
  id: string; label: string | null; expires_at: string | null; revoked_at: string | null
  created_at: string; last_viewed_at: string | null; view_count: number
  created_by_name?: string | null
}

type Preset = '1d' | '1w' | '1m' | '1y' | 'never'
const PRESET_LABEL: Record<Preset, string> = {
  '1d': '1 day', '1w': '1 week', '1m': '1 month', '1y': '1 year', 'never': 'Never',
}

const days = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
const ago = (iso: string | null) => {
  if (!iso) return 'never opened'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return 'opened just now'
  if (h < 24) return `last opened ${h}h ago`
  return `last opened ${Math.floor(h / 24)}d ago`
}

export function ExternalAccessCard({ projectId }: { projectId: string }) {
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loading, setLoading] = useState(true)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const [preset, setPreset] = useState<Preset>('1m')
  const [neverConfirm, setNeverConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  // A freshly minted secret, shown ONCE. Never re-fetchable — the server stores
  // only the hash, so if this is dismissed the link must be recreated.
  const [fresh, setFresh] = useState<{ url: string; what: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<
    { kind: 'member' | 'invite' | 'link'; id: string; who: string } | null>(null)

  const fetchAll = useCallback(async () => {
    const [r, i, l] = await Promise.all([
      supabase.rpc('portal_roster', { pid: projectId }),
      supabase.from('portal_invites')
        .select('id, email, created_at, expires_at, redeemed_at, revoked_at')
        .eq('project_id', projectId).is('redeemed_at', null).is('revoked_at', null),
      supabase.from('portal_share_links')
        .select('id, label, expires_at, revoked_at, created_at, last_viewed_at, view_count')
        .eq('project_id', projectId).is('revoked_at', null)
        .order('created_at', { ascending: false }),
    ])
    setRoster((r.data ?? []) as RosterRow[])
    setInvites((i.data ?? []) as InviteRow[])
    setLinks((l.data ?? []) as LinkRow[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function createInvite() {
    if (!inviteEmail.trim()) return
    setBusy(true)
    try {
      const res = await authedFetch('/api/portal-invite', {
        project_id: projectId, email: inviteEmail.trim(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { reportError(new Error(body.error ?? apiErrorMessage(res.status, body)), 'create invite'); return }
      // The three delivery states from PORTAL-GOLIVE §1, surfaced rather than
      // guessed: the copy link is ALWAYS the reliable path.
      setFresh({
        url: body.invite_url,
        what: body.mail_attempted
          ? `Invite emailed to ${inviteEmail.trim()} — copy the link too, in case it lands in spam.`
          : `Invite created. Email delivery is off, so send this link yourself.`,
      })
      setInviteEmail(''); setInviteOpen(false); fetchAll()
    } finally { setBusy(false) }
  }

  async function createLink() {
    setBusy(true)
    try {
      const res = await authedFetch('/api/portal-share-link', {
        project_id: projectId, label: linkLabel.trim() || null, expires: preset,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { reportError(new Error(body.error ?? apiErrorMessage(res.status, body)), 'create share link'); return }
      setFresh({
        url: body.link_url,
        what: preset === 'never'
          ? 'View-only link created. It works forever until you revoke it.'
          : `View-only link created. It stops working on ${String(body.expires_at).slice(0, 10)}.`,
      })
      setLinkLabel(''); setPreset('1m'); setNeverConfirm(false); setLinkOpen(false); fetchAll()
    } finally { setBusy(false) }
  }

  async function doRevoke() {
    if (!confirm) return
    const { kind, id } = confirm
    setBusy(true)
    try {
      if (kind === 'member') {
        // Revocation for an ACCOUNT is deleting the membership row — instant and
        // total, exactly as ARCHITECTURE describes. The account survives; its
        // access to this project does not.
        const res = await supabase.from('portal_members').delete().eq('id', id).select('id')
        // reportWriteBlocked takes the WHOLE result: an RLS-blocked delete comes
        // back as success with zero rows, indistinguishable from a legitimate
        // no-op, and that silent case is exactly what it exists to catch.
        if (reportWriteBlocked(res, 'remove external member')) return
      } else {
        const table = kind === 'invite' ? 'portal_invites' : 'portal_share_links'
        const res = await supabase.from(table)
          .update({ revoked_at: new Date().toISOString() }).eq('id', id).select('id')
        if (reportWriteBlocked(res, `revoke ${kind}`)) return
      }
      setConfirm(null); fetchAll()
    } finally { setBusy(false) }
  }

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  const empty = !loading && roster.length === 0 && invites.length === 0 && links.length === 0

  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Client / External Access
        </h3>
        <a href={`/portal/${projectId}`} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-standard-600 transition-colors">
          <Eye size={14} strokeWidth={1.75} /> View as client
        </a>
      </div>

      {empty ? (
        <p className="text-xs text-gray-500 mb-3">
          No external access yet. Invite someone to give them an account, or create a
          view-only link.
        </p>
      ) : null}

      {/* ── People with accounts ─────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h4 className="text-[11px] font-semibold text-gray-600">People with accounts</h4>
        <button onClick={() => { setInviteOpen(v => !v); setLinkOpen(false) }}
          className="inline-flex items-center gap-1 text-[11px] text-standard-600 hover:text-standard-700">
          <UserPlus size={12} strokeWidth={2} /> Invite person
        </button>
      </div>

      {inviteOpen && (
        <div className="mb-2.5 p-2.5 bg-gray-50 rounded-md space-y-2">
          <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
            placeholder="name@company.com" autoFocus
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm bg-white
                       focus:outline-none focus:border-standard-600" />
          <div className="flex gap-2">
            <button onClick={createInvite} disabled={busy || !inviteEmail.trim()}
              className="text-xs px-3 py-1.5 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
              Create invite
            </button>
            <button onClick={() => setInviteOpen(false)} className="text-xs px-2 py-1.5 text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5 mb-4">
        {roster.map(m => (
          <div key={m.member_id} className="flex items-start gap-2 text-sm group">
            <div className="min-w-0 flex-1">
              <p className="text-gray-800 truncate">{m.name ?? m.email ?? '(unnamed)'}</p>
              <p className="text-[10px] text-gray-500 truncate">
                {m.email}
                {m.invited_by_name ? ` · invited by ${m.invited_by_name}` : ''}
                {m.accepted_at ? ` · accepted ${m.accepted_at.slice(0, 10)}` : ''}
              </p>
            </div>
            <button onClick={() => setConfirm({ kind: 'member', id: m.member_id, who: m.name ?? m.email ?? 'this person' })}
              title="Remove access"
              className="flex-shrink-0 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}

        {invites.map(v => (
          <div key={v.id} className="flex items-start gap-2 text-sm group">
            <div className="min-w-0 flex-1">
              <p className="text-gray-800 truncate flex items-center gap-1.5">
                {v.email}
                <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 rounded px-1 py-0.5">
                  PENDING · {Math.max(0, days(v.expires_at))}d left
                </span>
              </p>
              <p className="text-[10px] text-gray-500">invited {v.created_at.slice(0, 10)}</p>
            </div>
            <button onClick={() => setConfirm({ kind: 'invite', id: v.id, who: v.email })}
              title="Revoke invite"
              className="flex-shrink-0 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}

        {!loading && roster.length === 0 && invites.length === 0 && (
          <p className="text-[11px] text-gray-500">Nobody has an account on this project yet.</p>
        )}
      </div>

      {/* ── View-only links ──────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h4 className="text-[11px] font-semibold text-gray-600">View-only links</h4>
        <button onClick={() => { setLinkOpen(v => !v); setInviteOpen(false) }}
          className="inline-flex items-center gap-1 text-[11px] text-standard-600 hover:text-standard-700">
          <Link2 size={12} strokeWidth={2} /> Create link
        </button>
      </div>

      {linkOpen && (
        <div className="mb-2.5 p-2.5 bg-gray-50 rounded-md space-y-2">
          <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
            placeholder="Label (optional) — e.g. For Bird PM" autoFocus
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm bg-white
                       focus:outline-none focus:border-standard-600" />
          <div className="flex flex-wrap gap-1">
            {(Object.keys(PRESET_LABEL) as Preset[]).map(p => (
              <button key={p} onClick={() => { setPreset(p); setNeverConfirm(false) }}
                aria-pressed={preset === p}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  preset === p
                    ? 'bg-standard-600 border-standard-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>

          {/* "Never" is a second, deliberate step — not a radio you can brush past. */}
          {preset === 'never' && !neverConfirm ? (
            <div className="text-[11px] text-red-700 bg-red-50 rounded p-2 space-y-1.5">
              <p>This link works forever until revoked — anyone who has it can view this
                 project's record.</p>
              <button onClick={() => setNeverConfirm(true)}
                className="text-[11px] font-semibold underline">I understand, create it</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={createLink} disabled={busy}
                className="text-xs px-3 py-1.5 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
                Create link
              </button>
              <button onClick={() => { setLinkOpen(false); setNeverConfirm(false) }}
                className="text-xs px-2 py-1.5 text-gray-500">Cancel</button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {links.map(l => (
          <div key={l.id} className="flex items-start gap-2 text-sm group">
            <div className="min-w-0 flex-1">
              <p className="text-gray-800 truncate flex items-center gap-1.5 flex-wrap">
                {l.label ?? 'Untitled link'}
                {/* NEVER renders as a MARK, not a date — it is the row you want to
                    notice on a later audit. */}
                {l.expires_at === null ? (
                  <span className="text-[9px] font-bold tracking-wide text-red-700 bg-red-50 rounded px-1 py-0.5">
                    NEVER EXPIRES
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-500">expires {l.expires_at.slice(0, 10)}</span>
                )}
              </p>
              <p className="text-[10px] text-gray-500">
                created {l.created_at.slice(0, 10)} · {ago(l.last_viewed_at)}
                {l.view_count > 0 ? ` · ${l.view_count} view${l.view_count === 1 ? '' : 's'}` : ''}
              </p>
            </div>
            <button onClick={() => setConfirm({ kind: 'link', id: l.id, who: l.label ?? 'this link' })}
              title="Revoke link"
              className="flex-shrink-0 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
        {!loading && links.length === 0 && (
          <p className="text-[11px] text-gray-500">No view-only links on this project.</p>
        )}
      </div>

      <p className="text-[10px] text-gray-500 mt-3 pt-2 border-t border-gray-100">
        Nothing here is internal. Isotherm membership is the Access card above.
      </p>

      {/* ── The freshly minted secret, shown once ────────────────────────── */}
      {fresh && (
        <div className="mt-3 p-2.5 bg-standard-50 border border-standard-200 rounded-md">
          <p className="text-[11px] text-gray-700 mb-1.5">{fresh.what}</p>
          <div className="flex gap-1.5">
            <input readOnly value={fresh.url} onFocus={e => e.currentTarget.select()}
              className="min-w-0 flex-1 text-[10px] font-mono border border-gray-200 rounded px-2 py-1 bg-white" />
            <button onClick={() => copy(fresh.url)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-standard-600 text-white flex-shrink-0">
              {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setFresh(null)} className="text-[10px] text-gray-500 mt-1.5">
            Done — I've copied it
          </button>
        </div>
      )}

      {/* ── Revocation confirm — copy differs by KIND ────────────────────── */}
      {confirm && (
        <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-md">
          <p className="text-[11px] text-red-800 mb-2">
            {confirm.kind === 'member'
              ? `${confirm.who} loses access to this project immediately.`
              : confirm.kind === 'invite'
              ? `The invite to ${confirm.who} stops working immediately. Nobody has used it yet.`
              : `Anyone holding "${confirm.who}" loses access immediately.`}
          </p>
          <div className="flex gap-2">
            <button onClick={doRevoke} disabled={busy}
              className="text-xs px-3 py-1.5 rounded bg-red-600 text-white font-medium disabled:opacity-50">
              {confirm.kind === 'member' ? 'Remove access' : 'Revoke'}
            </button>
            <button onClick={() => setConfirm(null)} className="text-xs px-2 py-1.5 text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
