import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: sess } = await adm.auth.signInWithPassword(adminCredentials())
const token = sess.session.access_token
const { data: zz } = await adm.from('projects').select('id').eq('name', TEST_PROJECT).single()
const b = await chromium.launch(); const page = await b.newPage()
await page.goto('http://localhost:5175', { waitUntil: 'domcontentloaded' })
const made = []
try {
  // ── GATE A: p16 under the expansion contract. Hand count = 11 PHYSICAL units
  //    (B-1,2=2 · P-P1,P-P2 + P-S1,P-S2=4 · T-1,2=2 · UH-B1=1 · WS-1=1 · UV-1=1)
  const shots = await page.evaluate(async () => {
    const m = await import('/src/lib/schedulePages.ts')
    const r = await fetch('/samples/calibration/clairlea-tender.pdf'); const buf = await r.arrayBuffer()
    const f = new File([buf], 'c.pdf', { type: 'application/pdf' })
    const regs = await m.detectTableRegions(f, 16)
    const out = []
    for (const g of regs) out.push({ h: g.header.slice(0,30), url: await m.renderRegion(f, 16, g, 2.0) })
    return out
  })
  let total = 0
  console.log('GATE A — p16, expansion contract, hand count 11 physical units')
  for (const [i, s] of shots.entries()) {
    const bytes = Buffer.from(s.url.split(',')[1], 'base64')
    const path = `${zz.id}/GA_${Date.now()}_${i}.png`
    await adm.storage.from('intake-files').upload(path, bytes, { contentType: 'image/png' })
    const { data: up } = await adm.from('intake_uploads').insert({
      project_id: zz.id, filename: `GA p16 r${i+1}`, storage_path: path, kind: 'image',
      media_type: 'image/png', content_sha256: `ga-${i}-${Date.now()}`, status: 'uploaded', pages: 1,
    }).select('id').single()
    made.push({ id: up.id, path })
    const res = await fetch(`${BASE_URL}/api/intake`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ upload_id: up.id, action: 'extract', page: 16 }) })
    const { data: rs } = await adm.from('intake_rows').select('tag').eq('upload_id', up.id)
    const n = rs?.length ?? 0; total += n
    console.log(`  ${s.h.padEnd(32)} -> ${String(n).padStart(2)} rows  ${(rs??[]).map(r=>r.tag).join(', ').slice(0,52)} ${res.ok?'':'FAIL'}`)
  }
  console.log(`  TOTAL ${total} / 11 physical units\n`)

  // ── GATE B: downscale verdict parity on the scanned pages
  console.log('GATE B — sorter verdicts, 0.6 vs 0.22, Clairlea scanned pages')
  const pages = [30, 31, 33, 36, 40, 45]
  for (const scale of [0.6, 0.22]) {
    const payload = await page.evaluate(async ({ pgs, sc }) => {
      const m = await import('/src/lib/schedulePages.ts')
      const r = await fetch('/samples/calibration/clairlea-tender.pdf'); const buf = await r.arrayBuffer()
      const f = new File([buf], 'c.pdf', { type: 'application/pdf' })
      const out = []
      for (const p of pgs) out.push({ page: p, image_base64: await m.renderPage(f, p, sc) })
      return out
    }, { pgs: pages, sc: scale })
    const kb = Math.round(payload.reduce((n, p) => n + p.image_base64.length, 0) / 1024)
    const res = await fetch(`${BASE_URL}/api/intake`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'find-pages', pages: payload }) })
    const body = await res.json().catch(() => ({}))
    const v = (body.sorted ?? []).map(x => `${x.page}:${x.is_schedule ? 'Y' : 'n'}`).join(' ')
    console.log(`  scale ${String(scale).padEnd(5)} payload ${String(kb).padStart(6)} KB  ${res.status}  ${v}`)
  }
} finally {
  for (const u of made) { await adm.from('intake_rows').delete().eq('upload_id', u.id)
    await adm.from('intake_uploads').delete().eq('id', u.id)
    await adm.storage.from('intake-files').remove([u.path]) }
  await b.close(); console.log(`\n  cleaned ${made.length}`)
}
