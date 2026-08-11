// Storage privacy gate (§12 pass, 2026-07-24): the five buckets are PRIVATE and
// every read path goes through row-anchored signed URLs (api/get-file-url).
//
//   1. authorized member → signed URL → fetch 200
//   2. the raw /object/public/... form of the same file → FAILS (bucket private)
//   3. get-file-url without a JWT → 401
//   4. non-member (dev.owner, zero memberships) → 403
//   5. photo render in the app: finding detail <img> carries a token= signed src
//   6. client upload still works post-flip (equipment-files INSERT policy) — a
//      probe object is uploaded and removed as dev.test
//
// ZZ-TEST family only; self-cleaning (probe object removed).
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { BASE_URL, TEST_PROJECT } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const mk = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const emp = mk(), own = mk()
{
  const e = await emp.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
  const o = await own.auth.signInWithPassword({ email: process.env.owner_email, password: process.env.owner_password })
  if (e.error || o.error) { console.error('login failed:', e.error?.message ?? o.error?.message); process.exit(1) }
}
const tok = async (c) => (await c.auth.getSession()).data.session.access_token
const sign = async (c, body) => {
  const r = await fetch(`${BASE_URL}/api/get-file-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tok(c)}` },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const { data: report } = await emp.from('site_reports').select('id, storage_url')
  .eq('project_id', ZZ).not('storage_url', 'is', null).limit(1).single()
if (!report) { console.error('ZZ-TEST has no generated report — run pw-dates/pw-finding-register first'); process.exit(1) }

// 1 · authorized member: sign + fetch
{
  const { status, body } = await sign(emp, { table: 'site_reports', id: report.id, kind: 'docx' })
  check(status === 200 && body.url?.includes('token='), `member mints signed URL (${status})`)
  if (body.url) { const f = await fetch(body.url); check(f.ok, `signed fetch -> ${f.status}`) }
}

// 2 · the raw public form of the SAME file fails (bucket is private)
{
  const publicForm = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/site-reports/${report.storage_url}`
  const r = await fetch(publicForm)
  check(!r.ok, `raw public URL form fails (${r.status})`)
}

// 3 · no JWT -> 401
{
  const r = await fetch(`${BASE_URL}/api/get-file-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'site_reports', id: report.id, kind: 'docx' }),
  })
  check(r.status === 401, `no JWT -> ${r.status}`)
}

// 4 · non-member -> 403 — AND THE PREMISE IS ASSERTED FIRST.
//
// FROM A REAL FALSE ALARM, 2026-08-11: this leg reported `non-member -> 200`,
// which reads as *the storage control has failed*. It had not. dev.owner had
// genuinely become a member of ZZ-TEST — a project_members row left behind by a
// run of pw-deliverable-access that was KILLED before its `finally` (that suite
// seeds this exact account into ZZ-TEST for its scoping legs and removes it in
// teardown). The endpoint answered 200 because 200 was the CORRECT answer for a
// member. The check was right about the number and wrong about the meaning.
//
// A leg whose subject is "an account with no access" is worthless if it cannot
// tell A CONTROL THAT BROKE from A PREMISE THAT MOVED — both surface as one
// unexpected status. So the premise is now measured, not assumed, and when it
// has moved the suite says WHICH memberships exist and where they came from
// rather than crying breach. This is the arrival rule aimed at a fixture: assert
// the state the question depends on before trusting the answer.
//
// It refuses rather than self-heals. Deleting the row to make the leg run would
// erase the evidence that residue is accumulating, and would silently discard a
// membership someone added on purpose.
{
  const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: ownProfile } = await svc.from('user_profiles').select('id').eq('email', process.env.owner_email).single()
  const { data: held } = await svc.from('project_members')
    .select('project_id, projects(name)').eq('profile_id', ownProfile.id)
  const names = (held ?? []).map(m => (Array.isArray(m.projects) ? m.projects[0]?.name : m.projects?.name) ?? m.project_id)

  if (names.length > 0) {
    check(false, `PREMISE BROKEN — ${process.env.owner_email} holds ${names.length} membership(s): ${names.join(', ')}. `
      + 'This leg needs an account with ZERO memberships; it cannot test non-member access and its verdict is withheld. '
      + 'Most likely fixture residue from a suite killed before teardown (pw-deliverable-access seeds this account into ZZ-TEST). '
      + 'Delete the row and re-run — do NOT read this as a storage-privacy failure.')
  } else {
    check(true, `premise holds — ${process.env.owner_email} is a member of nothing`)
    const { status } = await sign(own, { table: 'site_reports', id: report.id, kind: 'docx' })
    check(status === 403, `non-member -> ${status}`)
  }
}

// 5 · app renders finding photos through signed srcs (browser, dev.test)
{
  const { data: ph } = await emp.from('finding_photos')
    .select('id, finding_id, findings!inner(project_id, title)').eq('findings.project_id', ZZ).limit(1)
  const target = (ph ?? [])[0]
  if (!target) {
    console.log('  (ZZ-TEST has no finding photos — render check skipped, endpoint batch verified in step 1 of the pass)')
  } else {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.goto(`${BASE_URL}/login`)
    await page.locator('input[type="email"]').fill(process.env.email)
    await page.locator('input[type="password"]').fill(process.env.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForTimeout(3000)
    await page.goto(`${BASE_URL}/projects`); await page.waitForTimeout(1500)
    // Desktop table row (the bare text locator matches the hidden mobile card first)
    await page.getByRole('row', { name: /ZZ-TEST — Do Not Use/ }).first().click().catch(async () => {
      await page.getByText(TEST_PROJECT, { exact: false }).first().click()
    })
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Issues Log', exact: true }).click(); await page.waitForTimeout(1500)
    const t = (Array.isArray(target.findings) ? target.findings[0] : target.findings)?.title
    if (t) { await page.getByText(t, { exact: false }).first().click(); await page.waitForTimeout(2000) }
    const imgs = page.locator('img[src*="token="]')
    await imgs.first().waitFor({ timeout: 15000 }).catch(() => {})
    check(await imgs.count() > 0, 'finding detail renders photo via signed src (token= present)')
    await browser.close()
  }
}

// 6 · client upload survives the flip (equipment-files INSERT policy)
{
  // The bucket enforces an allowed-mime list (pdf/jpeg/png/webp/doc/xls) — probe as jpeg.
  const probePath = `pw-storage-probe/${Date.now()}.jpg`
  const { error: upErr } = await emp.storage.from('equipment-files')
    .upload(probePath, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
  check(!upErr, `client upload as staff still works (${upErr?.message ?? 'ok'})`)
  const { error: rmErr } = await emp.storage.from('equipment-files').remove([probePath])
  check(!rmErr, `probe object removed (${rmErr?.message ?? 'ok'})`)
}

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0
  ? 'PASS — buckets private; access only via authorized signed URLs.'
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length ? 1 : 0)
