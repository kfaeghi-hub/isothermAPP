// PortalLink — the share-link surface at /portal/link/:token.
//
// Reached BEFORE the router and before any auth gate, like /portal/accept and
// /reset-password: a link visitor has no session, so nothing that assumes one may
// run first. Unlike those two, this page RENDERS THE RECORD, not a form.
//
// NO SUPABASE CLIENT. lib/portalLink talks only to /api/portal-link and
// /api/get-file-url. That is the structural guarantee that link mode cannot
// write — the channel does not exist — rather than a policy one.
//
// The visitor sees the IDENTICAL official record an account sees: same hero,
// same register, same documents, same team, because the bundle reads through the
// same portal_internal implementations the account RPCs use. What is deliberately
// absent is the chrome that implies an identity: no sign-out, no project
// switcher, no "your projects". A link is one project, held by whoever has it.
import './portal.css'
import { useEffect, useState } from 'react'
import { LogoMark } from '../../components/Logo'
import { fetchLinkBundle, openLinkDocument, getLinkPhotoUrls, type PortalLinkBundle } from '../../lib/portalLink'
import { useMotionMode } from './motion'
import { Hero } from './sections/Hero'
import { Register } from './sections/Register'
import { Documents } from './sections/Documents'
import { Team } from './sections/Team'
import { CxProgress } from './sections/CxProgress'
import { PortalContour } from './ui/PortalContour'

/** A share link must never be indexed or leak its token in a Referer header.
 *  The endpoint sets the same things as headers; this is the document half,
 *  applied for the lifetime of the page and removed on unmount so the internal
 *  app is never left with them. */
function useLinkPageMeta() {
  useEffect(() => {
    const tags: HTMLMetaElement[] = []
    const add = (name: string, content: string) => {
      const m = document.createElement('meta')
      m.name = name; m.content = content
      document.head.appendChild(m); tags.push(m)
    }
    add('robots', 'noindex, nofollow, noarchive')
    add('referrer', 'no-referrer')
    return () => { for (const t of tags) t.remove() }
  }, [])
}

export function PortalLink() {
  useLinkPageMeta()
  const motion = useMotionMode()
  const token = window.location.pathname.replace(/^\/portal\/link\//, '').split(/[?#]/)[0]

  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading')
  const [bundle, setBundle] = useState<PortalLinkBundle | null>(null)

  useEffect(() => {
    let alive = true
    if (!token) { setState('invalid'); return }
    fetchLinkBundle(token).then(b => {
      if (!alive) return
      if (!b) { setState('invalid'); return }
      setBundle(b); setState('ok')
    })
    return () => { alive = false }
  }, [token])

  if (state === 'loading') {
    return (
      <div className="min-h-screen pt-cover flex items-center justify-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Opening the record…
        </p>
      </div>
    )
  }

  // ONE message for invalid, expired and revoked alike — the server answers one
  // shape for all three and this page must not become the oracle the API refused
  // to be. It also must not imply the project exists.
  if (state === 'invalid' || !bundle) {
    return (
      <div className="relative min-h-screen pt-cover flex items-center justify-center p-5 overflow-hidden">
        <PortalContour />
        <div className="relative w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2.5 mb-7">
            <LogoMark variant="reverse" className="h-8 w-auto" />
            <span className="font-display text-sm font-bold tracking-tight text-paper">
              Isotherm <span className="font-mono text-vermilion-400">Cx</span>
            </span>
          </div>
          <div className="pt-panel px-6 py-8">
            <p className="font-display text-base font-bold text-ink-display">
              This link is no longer active
            </p>
            <p className="mt-1.5 text-sm text-gray-500">
              It may have expired or been revoked. Ask your Isotherm contact for a
              current link.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-cover text-slate-300 flex flex-col">
      <header className="border-b border-cover-edge flex-shrink-0">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-2.5">
          <LogoMark variant="reverse" className="h-6 w-auto flex-shrink-0" />
          <span className="font-display text-[13px] font-bold tracking-tight text-paper">
            Isotherm <span className="font-mono text-vermilion-400">Cx</span>
          </span>
          {/* No sign-out, no switcher, no name. There is no identity here to show. */}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            View only
          </span>
        </div>
      </header>

      <main className="flex-1">
        <Hero project={bundle.project} stats={bundle.stats} motion={motion} />
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-10">
          <Register
            findings={bundle.findings}
            photos={bundle.photos}
            getPhotoUrls={fid => getLinkPhotoUrls(token, fid)}
          />
          <Documents
            docs={bundle.documents}
            onOpen={(doc, kind) => openLinkDocument(token, doc, kind)}
          />
          <Team team={bundle.team} />
          <CxProgress rows={bundle.cx_index} />
        </div>
      </main>

      <footer className="border-t border-cover-edge flex-shrink-0">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 text-[11px] text-slate-400">
          Isotherm Engineering — commissioning record. Documents shown here are the
          issued record. This is a view-only link and can be revoked at any time.
        </div>
      </footer>
    </div>
  )
}
