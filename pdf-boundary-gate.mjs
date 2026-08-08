// PAGE-BOUNDARY GATE — regenerate the real ZZ-TEST documents through the real
// handlers, download what they produced, and assert that NO table rule is
// painted inside the reserved footer band on any page of any family.
//
// This is the render-and-look gate for the footer-bleed fix, and it is the check
// that would have caught the bug: every earlier gate looked at a document's
// CONTENT and none looked at its page BOUNDARIES, which is why a defect visible
// on five of nine pages shipped.
//
// NAMED SEAM, stated because it matters here: locally these render in
// Playwright's Chromium via doc-render-chromium-shim, whose own header warns it
// is unfit for questions about pagination. That warning is respected two ways —
// the defect was first reproduced and measured on the REAL Lambda-rendered PDF
// pulled from storage, and the fix is confirmed again on a production-generated
// document. This harness is the fast A/B in between, and it is only trusted
// because it reproduces the same defect the Lambda artifact shows.
//
// Run: node --env-file=.env pdf-boundary-gate.mjs [--out out/pdfdiag/after]

import { loadHandler, invoke } from './doc-render-local.mjs'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { adminCredentials } from './pw-config.mjs'

// The reserve is READ FROM THE SOURCE, not restated here. A gate that carries
// its own copy of the number it is checking drifts silently the first time the
// real one changes, and then measures the footer band in the wrong place.
import { readFileSync } from 'node:fs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pdf-boundary-gate')
const RESERVE_IN = (() => {
  const m = readFileSync('api/_shared/doc-common.ts', 'utf8').match(/PDF_BOTTOM_RESERVE\s*=\s*'([\d.]+)in'/)
  if (!m) { console.error("REFUSE: cannot read PDF_BOTTOM_RESERVE from api/_shared/doc-common.ts"); process.exit(1) }
  return Number(m[1])
})()
const SINK_PX = (() => {
  const m = readFileSync('api/_shared/doc-common.ts', 'utf8').match(/FOOTER_SINK_PX\s*=\s*(\d+)/)
  if (!m) { console.error('REFUSE: cannot read FOOTER_SINK_PX from api/_shared/doc-common.ts'); process.exit(1) }
  return Number(m[1])
})()

const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'out/pdfdiag/after' })()
mkdirSync(OUT, { recursive: true })

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: authErr } = await anon.auth.signInWithPassword(adminCredentials())
if (authErr) { console.error('REFUSE: sign-in failed:', authErr.message); process.exit(1) }
const token = auth.session.access_token

// pick the LARGEST fixture per family — a one-page document cannot show a
// page-boundary defect, and a gate that runs on one is a gate that cannot fail.
const { data: reports } = await svc.from('site_reports').select('id, report_number').eq('project_id', ZZ)
const { data: minutes } = await svc.from('meetings').select('id').eq('project_id', ZZ).limit(1)
const { data: plans }   = await svc.from('cx_plans').select('id').eq('project_id', ZZ).neq('status','draft').limit(1)
const { data: insts }   = await svc.from('checklist_instances').select('id').eq('project_id', ZZ).limit(1)

const JOBS = [
  reports?.length && { family: 'report',   handler: 'generate-report',    body: { report_id: reports.at(-1).id }, table: 'site_reports',        id: reports.at(-1).id },
  minutes?.length && { family: 'minutes',  handler: 'generate-minutes',   body: { meeting_id: minutes[0].id },    table: 'meetings',            id: minutes[0].id },
  plans?.length   && { family: 'cx-plan',  handler: 'cx-plan-generate',   body: { plan_id: plans[0].id },         bucket: 'cx-plans' },
  insts?.length   && { family: 'checklist',handler: 'generate-checklist', body: { instance_id: insts[0].id, mode: 'completed' } },
].filter(Boolean)

const H = {}
for (const j of JOBS) H[j.handler] = await loadHandler(j.handler)
H['get-file-url'] = await loadHandler('get-file-url')

let bad = 0
for (const j of JOBS) {
  process.stdout.write(`${j.family.padEnd(10)} generating … `)
  const { status, body } = await invoke(H[j.handler], j.body, token)
  if (status !== 200) { console.log(`FAIL (${status}) ${JSON.stringify(body).slice(0, 160)}`); bad++; continue }
  // three response shapes, same as the palette sweep: report/minutes persist a
  // path on the row and sign through the app's endpoint; cx-plan returns
  // bucket-relative paths; generate-checklist hands back signed URLs directly.
  let url = null
  if (j.table)       ({ body: url } = await invoke(H['get-file-url'], { table: j.table, id: j.id, kind: 'pdf' }, token), url = url?.url ?? null)
  else if (j.bucket) url = (await svc.storage.from(j.bucket).createSignedUrl(body.pdf_url, 300)).data?.signedUrl ?? null
  else               url = body.pdf_url ?? null
  if (!url) { console.log('FAIL — no pdf url'); bad++; continue }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const file = `${OUT}/${j.family}.pdf`
  writeFileSync(file, buf)
  console.log(`${(buf.length / 1024 | 0)}kb → ${file}`)
  const out = execFileSync(process.execPath, ['pdf-boundary-measure.mjs', file, '--marginbottom', String(RESERVE_IN), '--inkoffset', String(SINK_PX)], { encoding: 'utf8' })
  const hits = [...out.matchAll(/rules in the FOOTER band : (?!none)(.+)/g)].map(m => m[1].trim())
  const pages = (out.match(/^page /gm) ?? []).length
  if (hits.length) { console.log(`   ✗ ${pages} pages — ${hits.length} page(s) paint a table rule INSIDE the footer band: ${hits.join(' | ')}`); bad++ }
  else console.log(`   ✓ ${pages} pages — no table rule inside the reserved footer band`)
}

console.log(bad ? `\nGATE FAIL — ${bad} family/families` : `\nGATE PASS — every family clears the footer band`)
process.exit(bad ? 1 : 0)
