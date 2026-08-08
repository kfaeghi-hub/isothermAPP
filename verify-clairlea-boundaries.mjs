// VERIFY THE FIX ON REAL DATA WITHOUT TOUCHING THE ISSUED RECORD.
//
// Ruled 2026-08-08: neither issued client report is regenerated. Muir and
// Clairlea keep their footer bleed as a point-in-time artifact of when they were
// made, same as any issued revision. If a client ever asks for a re-issue, it
// regenerates then, as a new rev, through the normal issue flow.
//
// So the real-data proof is a LOCAL render of Clairlea (the longer issue log)
// against the working tree, with three protections:
//
//   1. uploadDocPair is aliased to a shim that writes to disk. Storage is never
//      written, so the issued PDF and DOCX are untouched at the bytes.
//   2. The row's storage columns are read BEFORE the render and restored after,
//      and the restore is RE-READ and asserted. The handler updates the row it
//      is given; assuming the restore worked is exactly the kind of claim this
//      codebase does not accept.
//   3. If the restore cannot be verified, the script exits non-zero and says so
//      loudly, because a half-restored issued record is worse than no test.
//
// Run: node --env-file=.env verify-clairlea-boundaries.mjs

import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { adminCredentials } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('verify-clairlea-boundaries')

process.env.SUPABASE_URL ??= process.env.VITE_SUPABASE_URL
const OUT = 'out/pdfdiag/clairlea'
mkdirSync(OUT, { recursive: true })

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: proj } = await svc.from('projects').select('id, name').ilike('name', 'Clairlea%').limit(1).single()
const { data: rep }  = await svc.from('site_reports')
  .select('id, report_number, storage_url, pdf_url').eq('project_id', proj.id).limit(1).single()
console.log(`${proj.name} — site report #${rep.report_number}`)

// ── 1. the values that must survive this run, captured before anything moves ──
const BEFORE = { storage_url: rep.storage_url, pdf_url: rep.pdf_url }
console.log(`  issued paths: ${BEFORE.storage_url} | ${BEFORE.pdf_url}`)

process.env.NOWRITE_DIR = OUT

// ── 2. bundle the REAL handler with uploadDocPair aliased away ────────────────
const outfile = 'out/handlers/generate-report.nowrite.mjs'
await build({
  entryPoints: ['api/generate-report.ts'], outfile,
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  packages: 'external', logLevel: 'error',
  alias: { '@sparticuz/chromium-min': './doc-render-chromium-shim.mjs' },
  // esbuild's `alias` takes package names only, so the relative doc-common
  // import is intercepted with a resolve plugin. Narrow on purpose: it matches
  // that ONE specifier and rewrites nothing else, so the rest of the generator
  // — CSS, page geometry, toPdf — is the real module under test.
  plugins: [{
    name: 'nowrite-doc-common',
    setup(b) {
      b.onResolve({ filter: /^\.\/_shared\/doc-common\.js$/ }, () => ({
        path: resolve('doc-render-nowrite-shim.mjs'),
      }))
    },
  }],
})
const handler = (await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)).default

const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: authErr } = await anon.auth.signInWithPassword(adminCredentials())
if (authErr) { console.error('REFUSE: sign-in failed:', authErr.message); process.exit(1) }

let status = 0, payload = null
const res = { status(c) { status = c; return res }, json(o) { payload = o; return res }, send(o) { payload = o; return res }, end() { return res }, setHeader() { return res } }
await handler({ method: 'POST', body: { report_id: rep.id }, headers: { authorization: `Bearer ${auth.session.access_token}` }, query: {} }, res)
console.log(`  handler → ${status}`)

// ── 3. restore, then PROVE the restore by reading it back ────────────────────
await svc.from('site_reports').update(BEFORE).eq('id', rep.id)
const { data: after } = await svc.from('site_reports').select('storage_url, pdf_url').eq('id', rep.id).single()
const restored = after.storage_url === BEFORE.storage_url && after.pdf_url === BEFORE.pdf_url
console.log(`  issued row restored and re-read: ${restored ? 'OK — byte-identical' : 'FAILED'}`)
if (!restored) {
  console.error(`REFUSE: the issued row was NOT restored. want ${JSON.stringify(BEFORE)} got ${JSON.stringify(after)}`)
  process.exit(1)
}
if (status !== 200) { console.error(`REFUSE: handler returned ${status}: ${JSON.stringify(payload).slice(0, 200)}`); process.exit(1) }

// the issued OBJECT in storage is what actually matters — assert it is still there
const { data: head } = await svc.storage.from('site-reports').list(proj.id)
const stillThere = (head ?? []).some(f => BEFORE.pdf_url?.endsWith(f.name))
console.log(`  issued PDF still in storage: ${stillThere ? 'yes' : 'NOT FOUND — investigate'}`)

const pdf = `${OUT}/${payload.pdf_url}`
console.log(`\nrendered (local, working tree): ${pdf}`)
console.log(execFileSync(process.execPath, ['pdf-boundary-measure.mjs', pdf, '--marginbottom', '0.72', '--inkoffset', '20'], { encoding: 'utf8' })
  .split('\n').filter(l => /^page |FOOTER band/.test(l)).join('\n'))
execFileSync(process.execPath, ['pdf-page-shots.mjs', pdf, `${OUT}/boundaries`, '--bottom', '190', '--scale', '2'], { stdio: 'inherit' })
