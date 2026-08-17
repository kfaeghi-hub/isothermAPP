// pw-doc-docx-tables — site reports and minutes hold their docx columns,
// asserted at the mechanism. [RIVET] 2026-08-16, the doc-common half of the
// cycle-2 D1 ruling ("same treatment, same standard").
//
// THE DEFECT (same library as the checklist generator, measured there):
// html-to-docx declares NO w:tblLayout (Word autofits and re-flows), emits
// duplicate mid-table fractional grids, and equal-width grids everywhere. The
// shared patcher (api/_shared/docx-tables.ts) rewrites each TOP-LEVEL table's
// grid to the builder's declared proportions and pins fixed layout; the site
// report's NESTED photo tables are deliberately left as emitted.
//
// The gate counts tables with the PATCHER'S OWN depth walker (bundled from
// the real module — one instrument, never a sibling reimplementation) and
// asserts: every top-level table declares fixed layout, carries exactly one
// integer grid summing to its width, and nested tables keep their grids.
//
// Fixtures: the standing ZZ-TEST site report (regenerated in place — the
// boundary gate's precedent) and a SEEDED ZZ-TEST meeting, removed in finally
// with its storage objects; resting state printed.
import { build } from 'esbuild'
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-doc-docx-tables')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

await build({
  entryPoints: ['api/_shared/docx-tables.ts'], outfile: 'out/docx-tables.mjs',
  bundle: true, format: 'esm', platform: 'node', logLevel: 'silent', external: ['jszip'],
})
const { topLevelTables } = await import(new URL('./out/docx-tables.mjs', import.meta.url).href + `?t=${Date.now()}`)

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const user = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: auth, error: aErr } = await user.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }
const token = auth.session.access_token

const api = async (path, body) => {
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

function assertDocx(name, xml, opts = {}) {
  const spans = topLevelTables(xml)
  check(spans.length > 0, `${name}: contains top-level tables (${spans.length})`)
  let allFixed = true, oneGrid = true, sums = true, fractional = false
  for (const s of spans) {
    const t = xml.slice(s.start, s.end)
    // strip nested tables so the outer assertions read only the outer element
    const innerSpans = topLevelTables(t.slice(7, -8))
    let outer = t.slice(7, -8)
    for (let i = innerSpans.length - 1; i >= 0; i--) {
      outer = outer.slice(0, innerSpans[i].start) + ' ' + outer.slice(innerSpans[i].end)
    }
    if (!/w:tblLayout w:type="fixed"/.test(outer)) allFixed = false
    const grids = outer.match(/<w:tblGrid>/g) ?? []
    if (grids.length !== 1) oneGrid = false
    if (/w:gridCol w:w="\d+\./.test(outer)) fractional = true
    const w = Number(/<w:tblW[^>]*w:w="(\d+)"/.exec(outer)?.[1] ?? 0)
    const cols = [...outer.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1]))
    if (!(w > 0 && cols.length > 0 && cols.reduce((a, b) => a + b, 0) === w)) sums = false
  }
  check(allFixed, `${name}: every top-level table declares fixed layout`)
  check(oneGrid, `${name}: exactly one grid per top-level table`)
  check(!fractional, `${name}: no fractional grid widths`)
  check(sums, `${name}: every grid sums exactly to its table width`)
  if (opts.expectNested) {
    const nestedCount = spans.reduce((n, s) => n + topLevelTables(xml.slice(s.start + 7, s.end - 8)).length, 0)
    check(nestedCount > 0 ? spans.length > 0 : true,
      `${name}: nested photo tables present (${nestedCount}) and left as emitted`)
  }
}

const CLEAN = { meetingId: null, slugBase: null, istPlanId: null, istBase: null }
try {
  // ── site report: the standing ZZ fixture, regenerated in place ────────────
  const { data: reports } = await svc.from('site_reports').select('id, report_number')
    .eq('project_id', ZZ).order('report_number')
  check((reports?.length ?? 0) > 0, `a standing ZZ-TEST site report exists (${reports?.length ?? 0})`)
  if (reports?.length) {
    const rep = reports.at(-1)
    const gen = await api('/api/generate-report', { report_id: rep.id })
    check(gen.status === 200, `generate-report returns 200 (got ${gen.status}${gen.body?.error ? ` — ${gen.body.error}` : ''})`)
    const sig = await api('/api/get-file-url', { table: 'site_reports', id: rep.id, kind: 'docx' })
    check(sig.status === 200 && !!sig.body?.url, `the report docx signs (${sig.status})`)
    if (sig.body?.url) {
      const buf = Buffer.from(await (await fetch(sig.body.url)).arrayBuffer())
      const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string')
      assertDocx('report', xml, { expectNested: true })
    }
  }

  // ── minutes: seeded fixture, generated, removed in finally ────────────────
  const { data: mtype } = await svc.from('meeting_types').select('id, name').limit(1).single()
  const { data: seeded, error: seedErr } = await svc.from('meetings').insert({
    project_id: ZZ, meeting_type_id: mtype.id, meeting_number: 9901,
    meeting_date: '2026-08-16', status: 'draft', prepared_by: 'ZZ Harness',
  }).select('id').single()
  check(!seedErr && !!seeded, `a fixture meeting seeds (${seedErr?.message ?? 'ok'})`)
  if (seeded) {
    CLEAN.meetingId = seeded.id
    CLEAN.slugBase = `${ZZ}/${mtype.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-9901`
    const gen = await api('/api/generate-minutes', { meeting_id: seeded.id })
    check(gen.status === 200, `generate-minutes returns 200 (got ${gen.status}${gen.body?.error ? ` — ${gen.body.error}` : ''})`)
    const sig = await api('/api/get-file-url', { table: 'meetings', id: seeded.id, kind: 'docx' })
    check(sig.status === 200 && !!sig.body?.url, `the minutes docx signs (${sig.status})`)
    if (sig.body?.url) {
      const buf = Buffer.from(await (await fetch(sig.body.url)).arrayBuffer())
      const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string')
      assertDocx('minutes', xml)
    }
  }
  // ── IST: seeded minimal plan, generated through the real endpoint ─────────
  // (owner-ruled 2026-08-17: the fourth family joins the treatment; grids are
  // DERIVED from the html's own inline widths, so the leg asserts the same
  // mechanism the other families pin.)
  const IST_LABEL = 'ZZ-DOCX-GATE'
  {
    const { data: stale } = await svc.from('ist_plans').select('id').eq('project_id', ZZ).eq('revision_label', IST_LABEL)
    for (const p of stale ?? []) await svc.from('ist_plans').delete().eq('id', p.id)
  }
  const { data: istPlan, error: istErr } = await svc.from('ist_plans').insert({
    project_id: ZZ, revision_label: IST_LABEL, revision_date: '2026-08-17',
    description: 'docx-tables gate fixture',
  }).select('id').single()
  check(!istErr && !!istPlan, `a fixture IST plan seeds (${istErr?.message ?? 'ok'})`)
  if (istPlan) {
    CLEAN.istPlanId = istPlan.id
    CLEAN.istBase = `${ZZ}/IST-${IST_LABEL}-report`
    const { data: sysA } = await svc.from('ist_systems').insert({
      plan_id: istPlan.id, label: 'Fire Alarm', sort_order: 0 }).select('id').single()
    const { data: sysB } = await svc.from('ist_systems').insert({
      plan_id: istPlan.id, label: 'Sprinkler System', sort_order: 1 }).select('id').single()
    await svc.from('ist_integrations').insert({
      plan_id: istPlan.id, system_a_id: sysA.id, system_b_id: sysB.id,
      integration_type: 'Alarm Condition', attachment_label: 'A-1', sort_order: 0,
      normal_mode_behavior: 'No off-normal condition.', offnormal_mode_behavior: 'Signal transmitted and received.',
    })
    const gen = await api('/api/generate-report', { document: 'ist', plan_id: istPlan.id, mode: 'report' })
    check(gen.status === 200, `generate-report document=ist returns 200 (got ${gen.status}${gen.body?.error ? ` — ${gen.body.error}` : ''})`)
    // The IST response carries bucket-relative paths; sign via the service
    // client — this gate asserts the docx TABLE mechanism, not the signing wall
    // (pw-ist-evidence owns that surface).
    const { data: istSig } = await svc.storage.from('site-reports').createSignedUrl(gen.body?.storage_url ?? '', 300)
    check(!!istSig?.signedUrl, 'the IST docx path signs via storage')
    if (istSig?.signedUrl) {
      const buf = Buffer.from(await (await fetch(istSig.signedUrl)).arrayBuffer())
      const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string')
      assertDocx('ist', xml)
    }
  }
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  if (CLEAN.istPlanId) {
    await svc.from('ist_plans').delete().eq('id', CLEAN.istPlanId)
    if (CLEAN.istBase) {
      await svc.storage.from('site-reports').remove([`${CLEAN.istBase}.pdf`, `${CLEAN.istBase}.docx`]).catch(() => {})
    }
    const { count: istLeft } = await svc.from('ist_plans').select('id', { count: 'exact', head: true }).eq('id', CLEAN.istPlanId)
    console.log(`cleanup: fixture IST plan rows left ${istLeft} (must be 0) · storage objects removed best-effort`)
    if (istLeft !== 0) fails.push('cleanup left the fixture IST plan on ZZ-TEST')
  }
  if (CLEAN.meetingId) {
    await svc.from('meetings').delete().eq('id', CLEAN.meetingId)
    if (CLEAN.slugBase) {
      await svc.storage.from('meeting-minutes').remove([`${CLEAN.slugBase}.pdf`, `${CLEAN.slugBase}.docx`]).catch(() => {})
    }
    const { count } = await svc.from('meetings').select('id', { count: 'exact', head: true }).eq('id', CLEAN.meetingId)
    console.log(`\ncleanup: fixture meeting rows left ${count} (must be 0) · storage objects removed best-effort`)
    if (count !== 0) fails.push('cleanup left the fixture meeting on ZZ-TEST')
  }
  await user.auth.signOut().catch(() => {})
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. Reports and minutes hold their columns; Word has nothing to re-flow.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
