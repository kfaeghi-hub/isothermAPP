// Finding-photo capture guard (field finding 2026-07-25: the Issues Log offered
// only the file picker, never the camera).
//
// This is the ONLY direct coverage of the photo UPLOAD path — before it, the
// battery could say "nothing else broke" but never "this works". Both
// finding-photo surfaces carry the two-entry pattern, and each entry is proven
// FUNCTIONALLY (a real file is pushed through the input) rather than by reading
// attributes alone:
//
//   Issues Log finding detail — end to end: each input uploads, the row persists
//     a bucket-relative PATH (storage privacy pass), and the thumbnail renders
//     through a signed URL. Camera tile is mobile-only; desktop shows Upload only.
//   Checklists N-flow modal   — each input feeds the pending-photo queue (the
//     modal uploads on save; here the finding is never saved, so the queue chip
//     is the wiring proof).
//
// Guards the exact regression that shipped: a missing capture="environment", or
// one input silently unwired.
//
// ZZ-TEST family only. Self-cleaning: a probe finding (+ its photos and storage
// objects) and a throwaway checklist instance, all removed at the end.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { waitUntil, login, openTestProject, BASE_URL } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const PROBE_TITLE = 'ZZ-CAM probe finding'
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// A real (tiny) JPEG so the compressImage canvas path actually runs.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8Aqn//2Q==', 'base64')
const file = (name) => ({ name, mimeType: 'image/jpeg', buffer: JPEG })

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
{
  const { error } = await adm.auth.signInWithPassword({
    email: process.env.admin_email, password: process.env.admin_password,
  })
  if (error) { console.error('admin login failed:', error.message); process.exit(1) }
}

// Pre-clean any probe left by an interrupted run, then seed a fresh one.
async function purgeProbe() {
  const { data: found } = await adm.from('findings').select('id').eq('project_id', ZZ).eq('title', PROBE_TITLE)
  for (const f of found ?? []) {
    const { data: ph } = await adm.from('finding_photos').select('storage_url').eq('finding_id', f.id)
    const paths = (ph ?? []).map(p => p.storage_url).filter(p => p && !p.startsWith('http'))
    if (paths.length) await adm.storage.from('finding-photos').remove(paths)
    await adm.from('findings').delete().eq('id', f.id)   // cascade drops photo rows
  }
}
await purgeProbe()
const { data: probe, error: probeErr } = await adm.from('findings')
  .insert({ project_id: ZZ, title: PROBE_TITLE, category: 'INFO', status: 'open' })
  .select('id, number').single()
if (probeErr) { console.error('probe finding insert failed:', probeErr.message); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1500, height: 950 })
// Cleanup anchor: only instances this run created (a "most recent" query would
// delete a standing fixture if creation ever failed).
const runStart = new Date().toISOString()

try {
  await login(page)
  await openTestProject(page)

  // ── Surface 1 · Issues Log finding detail ────────────────────────────────
  await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
  await page.waitForTimeout(1500)
  // Select the probe AT phone width: below lg the detail is its own full-width
  // view, so selecting on desktop and then resizing drops back to the list.
  await page.setViewportSize({ width: 375, height: 820 })
  await page.waitForTimeout(1000)
  await page.getByText(PROBE_TITLE, { exact: false }).first().click()
  await page.waitForTimeout(2000)

  const inputs = page.locator('input[type="file"]')
  // The inputs are deliberately class="hidden" (buttons drive them), so wait for
  // ATTACHED — the default 'visible' can never be satisfied here.
  await inputs.first().waitFor({ state: 'attached', timeout: 15000 })
  const attrs = await inputs.evaluateAll(els =>
    els.map(e => ({ accept: e.getAttribute('accept'), capture: e.getAttribute('capture') })))
  check(attrs.length === 2, `issues log: two photo inputs present (got ${attrs.length})`)
  check(attrs.filter(a => a.capture === 'environment').length === 1,
    'issues log: capture="environment" on exactly one input')
  check(attrs.every(a => a.accept === 'image/*'), 'issues log: both inputs accept image/*')

  const btns = await page.getByRole('button').filter({ hasText: /Take Photo|Upload Photo/ })
    .evaluateAll(els => els.map(e => ({
      label: e.innerText.trim().replace(/\s+/g, ' '),
      h: Math.round(e.getBoundingClientRect().height),
      w: Math.round(e.getBoundingClientRect().width),
    })))
  check(btns.length === 2, `issues log @375: both entries visible (got ${btns.map(b => b.label).join(', ')})`)
  check(btns.every(b => b.h >= 44 && b.w >= 44),
    `issues log @375: tap targets >= 44px (${btns.map(b => `${b.w}x${b.h}`).join(' ')})`)

  // FUNCTIONAL: each input must actually upload. Camera input first.
  const cameraInput  = page.locator('input[type="file"][capture="environment"]')
  const galleryInput = page.locator('input[type="file"]:not([capture])')
  await cameraInput.setInputFiles(file('zz-cam-camera.jpg'))
  await page.locator('img[src*="token="]').first().waitFor({ timeout: 30000 })
  check(await page.locator('img[src*="token="]').count() === 1,
    'CAMERA input uploads: 1 photo rendered via a signed URL')

  await galleryInput.setInputFiles(file('zz-cam-gallery.jpg'))
  await page.waitForFunction(() => document.querySelectorAll('img[src*="token="]').length === 2,
    null, { timeout: 30000 }).catch(() => {})
  check(await page.locator('img[src*="token="]').count() === 2,
    'GALLERY input uploads: 2 photos rendered via signed URLs')

  // Both rows must persist PATHS, not URLs (storage privacy pass).
  const { data: rows } = await adm.from('finding_photos').select('storage_url, caption').eq('finding_id', probe.id)
  check((rows ?? []).length === 2, `both uploads persisted (${rows?.length ?? 0} rows)`)
  check((rows ?? []).every(r => r.storage_url && !r.storage_url.startsWith('http')),
    'stored values are bucket-relative paths, not URLs')
  const captions = (rows ?? []).map(r => r.caption).sort()
  check(captions.join(',') === 'zz-cam-camera.jpg,zz-cam-gallery.jpg',
    `both inputs are wired to the upload handler (captions: ${captions.join(', ')})`)

  // Desktop: capture is ignored by browsers, so the camera entry must NOT be a
  // second control that does exactly what Upload does.
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.waitForTimeout(800)
  const deskBtns = await page.getByRole('button').filter({ hasText: /Take Photo|Upload Photo/ })
    .evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 0).map(e => e.innerText.trim()))
  check(deskBtns.length === 1 && /Upload/.test(deskBtns[0]),
    `desktop: camera entry hidden, Upload only (got ${deskBtns.join(', ') || 'none'})`)

  // ── Surface 2 · Checklists N-flow finding modal ──────────────────────────
  await page.getByRole('button', { name: 'Checklists', exact: true }).click()
  await page.waitForTimeout(1500)
  const modal = page.locator('div.fixed.inset-0')
  await page.getByRole('button', { name: '+ New Checklist' }).click()
  await page.waitForTimeout(800)
  await modal.getByRole('button').filter({ hasText: 'AHU Prefunctional Checklist' }).first().click()
  await page.waitForTimeout(800)
  await modal.getByRole('button').filter({ hasText: 'TEST-AHU-1' }).first().click()
  await page.waitForTimeout(400)
  await modal.getByRole('button', { name: 'Create Checklist' }).click()
  // Anchor on an item label, NOT the copy-into control: that whole multi-unit
  // header is gated on responseTargets.length > 1, so a single-target instance
  // (all this surface needs) never renders it.
  await page.getByText('Cabinet and general installation', { exact: true }).first()
    .waitFor({ timeout: 25000 })


  // A manual N opens the finding modal — the surface under test.
  const row = (label) =>
    page.locator('div.group').filter({ has: page.locator('p', { hasText: new RegExp(`^${label}$`) }) })
  await row('Cabinet and general installation').locator('select').nth(0).selectOption('n')
  await waitUntil(async () => await page.getByText('Create Finding', { exact: true }).count() > 0,
    { timeout: 15000, what: 'checklist: manual N opens the finding modal' })
  check(await page.getByText('Create Finding', { exact: true }).count() > 0,
    'checklist: manual N opens the finding modal')

  const mInputs = page.locator('input[type="file"]')
  const mAttrs = await mInputs.evaluateAll(els =>
    els.map(e => ({ accept: e.getAttribute('accept'), capture: e.getAttribute('capture') })))
  check(mAttrs.length === 2, `checklist modal: two photo inputs present (got ${mAttrs.length})`)
  check(mAttrs.filter(a => a.capture === 'environment').length === 1,
    'checklist modal: capture="environment" on exactly one input')

  // Wiring proof: each input feeds the pending-photo queue (chips by filename).
  await page.locator('input[type="file"][capture="environment"]').setInputFiles(file('zz-modal-camera.jpg'))
  await page.waitForTimeout(600)
  await page.locator('input[type="file"]:not([capture])').setInputFiles(file('zz-modal-gallery.jpg'))
  await waitUntil(async () => await page.getByText('zz-modal-camera.jpg', { exact: false }).count() === 1,
    { timeout: 15000, what: 'checklist modal: CAMERA input queues its file' })
  check(await page.getByText('zz-modal-camera.jpg', { exact: false }).count() === 1,
    'checklist modal: CAMERA input queues its file')
  check(await page.getByText('zz-modal-gallery.jpg', { exact: false }).count() === 1,
    'checklist modal: GALLERY input queues its file')

  // Close without saving — no finding is created from this surface.
  await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {})
  await page.waitForTimeout(800)

} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-photo-capture-fail.png', fullPage: true }).catch(() => {})
}

// ── Cleanup ────────────────────────────────────────────────────────────────
try {
  // Runs UNCONDITIONALLY: the create click and the anchor that confirms it are
  // two steps, and a failure between them used to leak the instance. The filter
  // is time-scoped to this run, so it can only ever remove what this run made.
  const { data: gone } = await adm.from('checklist_instances').delete()
    .eq('project_id', ZZ).gt('created_at', runStart).select('id')
  if ((gone?.length ?? 0) > 0) console.log(`cleanup: removed ${gone.length} throwaway instance(s)`)
} catch (e) { console.log(`cleanup: instance — ${e.message}`) }
await purgeProbe()
{
  const { data: left } = await adm.from('findings').select('id').eq('project_id', ZZ).eq('title', PROBE_TITLE)
  check((left ?? []).length === 0, 'self-clean: probe finding, photos and storage objects removed')
}

await browser.close()
console.log('\n' + '='.repeat(64))
console.log(fails.length === 0
  ? 'PASS — both photo entries present and functionally wired on both surfaces.'
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
