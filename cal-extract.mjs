// cal-extract.mjs — Phase 1 diagnosis, extraction layer.
//
//   node --env-file=.env cal-extract.mjs        (needs `npm run dev` up)
//
// Runs the REAL extraction path on real schedule pages: render the page with
// the production `renderPage`, upload it exactly as IntakeUpload does, and call
// api/intake action=extract. Same storage bucket, same endpoint, same agent.
//
// ZZ-TEST ONLY. Every upload and every row lands on the test project and is
// removed in `finally`. Playwright's rule applies to this harness too.
//
// COSTS MONEY — one extraction call per page. That is the point: the field
// report says extraction returns nothing, and only a real call can show why.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('cal-extract')

const DEV = process.env.CAL_BASE ?? 'http://localhost:5174'

// Pages chosen from the finder baseline as GENUINE schedules (a human read the
// sample text), plus one scanned page to exercise the image leg.
const TARGETS = [
  { file: 'workman-IFT.pdf',      page: 7,  why: 'BOILERS table, page rotation 270, 255 text items' },
  { file: 'workman-IFT.pdf',      page: 12, why: 'MECHANICAL EQUIPMENT WIRING SCHEDULE, upright' },
  { file: 'clairlea-tender.pdf',  page: 16, why: 'BOILERS table, upright, 453 items' },
  { file: 'clairlea-tender.pdf',  page: 17, why: 'WALL FINS table, 2371 items — the biggest real schedule in the corpus' },
  { file: 'clairlea-tender.pdf',  page: 31, why: 'SCANNED page — exercises the image leg, the least-tested one' },
  { file: 'workman-M301-TED.pdf', page: 1,  why: 'SCANNED single-sheet TED drawing' },
]

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: sess } = await adm.auth.signInWithPassword(adminCredentials())
const token = sess?.session?.access_token
const { data: zz } = await adm.from('projects').select('id, name').eq('name', TEST_PROJECT).single()
if (!zz) throw new Error('ZZ-TEST not found — refusing to run')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(DEV, { waitUntil: 'domcontentloaded' })

const madeUploads = []
const results = []

try {
  for (const t of TARGETS) {
    process.stdout.write(`\n### ${t.file} p${t.page} — ${t.why}\n`)

    // Render with the PRODUCTION renderPage at the production scale (2.0, what
    // extractConfirmed uses), so the image the agent sees is the real one.
    const dataUrl = await page.evaluate(async ({ file, pageNo }) => {
      const mod = await import('/src/lib/schedulePages.ts')
      const res = await fetch('/samples/calibration/' + file)
      const buf = await res.arrayBuffer()
      const f = new File([buf], file, { type: 'application/pdf' })
      return await mod.renderPage(f, pageNo, 2.0)
    }, { file: t.file, pageNo: t.page })

    const b64 = dataUrl.split(',')[1]
    const bytes = Buffer.from(b64, 'base64')
    console.log(`  rendered: ${(bytes.length / 1024).toFixed(0)} KB PNG`)

    const path = `${zz.id}/CAL_${Date.now()}_${t.file.replace(/\W+/g, '_')}_p${t.page}.png`
    const up = await adm.storage.from('intake-files').upload(path, bytes, { contentType: 'image/png' })
    if (up.error) { console.log(`  STORAGE FAILED: ${up.error.message}`); continue }

    const { data: upload, error: uErr } = await adm.from('intake_uploads').insert({
      // THE PRODUCTION FILENAME CONVENTION, deliberately: this is the exact
      // shape that used to 400. The calibration has to measure the real seam.
      project_id: zz.id, filename: `CAL ${t.file} — page ${t.page}`, storage_path: path,
      kind: 'image', media_type: 'image/png',
      content_sha256: `cal-${t.file}-${t.page}`, status: 'uploaded', pages: 1,
    }).select('id').single()
    if (uErr) { console.log(`  UPLOAD ROW FAILED: ${uErr.message}`); continue }
    madeUploads.push({ id: upload.id, path })

    const t0 = Date.now()
    const res = await fetch(`${BASE_URL}/api/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ upload_id: upload.id, action: 'extract', page: t.page }),
    })
    const body = await res.json().catch(() => ({}))
    const secs = ((Date.now() - t0) / 1000).toFixed(0)

    if (!res.ok) {
      console.log(`  EXTRACT FAILED ${res.status} in ${secs}s: ${String(body.error ?? '').slice(0, 160)}`)
      results.push({ ...t, status: res.status, error: body.error, rows: 0 })
      continue
    }

    const { data: rows } = await adm.from('intake_rows')
      .select('tag, descriptor, proposed_type, observed_type_name, confidence, nameplate')
      .eq('upload_id', upload.id).order('source_row')

    const typed = (rows ?? []).filter(r => r.proposed_type).length
    console.log(`  ${rows?.length ?? 0} rows in ${secs}s · ${typed} typed · ${(rows?.length ?? 0) - typed} unresolved`)
    if (body.page_note) console.log(`  page_note: ${String(body.page_note).slice(0, 180)}`)
    for (const r of (rows ?? []).slice(0, 8)) {
      console.log(`    ${(r.tag ?? '—').padEnd(12)} ${String(r.descriptor ?? '').slice(0, 34).padEnd(36)} ` +
        `${(r.proposed_type ?? '(' + (r.observed_type_name ?? 'null') + ')').padEnd(18)} c=${r.confidence}`)
    }
    if ((rows?.length ?? 0) > 8) console.log(`    … and ${rows.length - 8} more`)

    results.push({
      ...t, status: 200, rows: rows?.length ?? 0, typed,
      usage: body.usage ? { in: body.usage.inputTokens, out: body.usage.outputTokens } : null,
      sample: (rows ?? []).slice(0, 5).map(r => ({ tag: r.tag, descriptor: r.descriptor, type: r.proposed_type })),
    })
  }
} finally {
  for (const u of madeUploads) {
    await adm.from('intake_rows').delete().eq('upload_id', u.id)
    await adm.from('intake_uploads').delete().eq('id', u.id)
    await adm.storage.from('intake-files').remove([u.path])
  }
  await browser.close()
  console.log(`\ncleaned up ${madeUploads.length} ZZ-TEST upload(s)`)
}

await writeFile('samples/calibration/_meta/extract-after.json', JSON.stringify(results, null, 2))
console.log('wrote samples/calibration/_meta/extract-after.json')
