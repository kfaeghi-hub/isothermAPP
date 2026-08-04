import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'
const HAND = [32, 18, 8, 30]  // wall fins L, wall fins R, FFH, convectors — by hand off the sheet
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: sess } = await adm.auth.signInWithPassword(adminCredentials())
const token = sess.session.access_token
const { data: zz } = await adm.from('projects').select('id').eq('name', TEST_PROJECT).single()
const t0all = new Date().toISOString()
const b = await chromium.launch(); const page = await b.newPage()
await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' })
const shots = await page.evaluate(async () => {
  const m = await import('/src/lib/schedulePages.ts')
  const r = await fetch('/samples/calibration/clairlea-tender.pdf'); const buf = await r.arrayBuffer()
  const f = new File([buf], 'clairlea-tender.pdf', { type: 'application/pdf' })
  const regs = await m.detectTableRegions(f, 17)
  const out = []
  for (const g of regs) out.push({ header: g.header, items: g.items,
    box: `x[${g.x0.toFixed(0)}-${g.x1.toFixed(0)}] y[${g.y0.toFixed(0)}-${g.y1.toFixed(0)}]`,
    url: await m.renderRegion(f, 17, g, 2.0) })
  return out
})
const made = []; const tagsBy = new Map(); let rows = 0
try {
  for (const [i, s] of shots.entries()) {
    const bytes = Buffer.from(s.url.split(',')[1], 'base64')
    const path = `${zz.id}/GATE3_${Date.now()}_r${i+1}.png`
    await adm.storage.from('intake-files').upload(path, bytes, { contentType: 'image/png' })
    const { data: up } = await adm.from('intake_uploads').insert({
      project_id: zz.id, filename: `GATE3 p17 r${i+1}`, storage_path: path, kind: 'image',
      media_type: 'image/png', content_sha256: `g3-${i}-${Date.now()}`, status: 'uploaded', pages: 1,
    }).select('id').single()
    made.push({ id: up.id, path })
    const t0 = Date.now()
    const res = await fetch(`${BASE_URL}/api/intake`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ upload_id: up.id, action: 'extract', page: 17 }) })
    const body = await res.json().catch(() => ({}))
    const { data: rs } = await adm.from('intake_rows').select('tag').eq('upload_id', up.id)
    const n = rs?.length ?? 0; rows += n
    tagsBy.set(i+1, new Set((rs ?? []).map(r => String(r.tag ?? '').trim().toUpperCase()).filter(Boolean)))
    console.log(`  r${i+1} ${(s.header||'').slice(0,34).padEnd(36)} ${String(s.items).padStart(4)}it ${s.box.padEnd(28)} -> ${String(n).padStart(3)} rows ${((Date.now()-t0)/1000).toFixed(0).padStart(4)}s ${res.ok?'':'FAIL '+res.status}`)
  }
  console.log('\n  TRIPWIRE — cross-region tag intersection:')
  let coll = 0
  const ks = [...tagsBy.keys()]
  for (let a=0;a<ks.length;a++) for (let c=a+1;c<ks.length;c++) {
    const shared = [...tagsBy.get(ks[a])].filter(t => tagsBy.get(ks[c]).has(t))
    if (shared.length) { coll += shared.length
      console.log(`    r${ks[a]} ∩ r${ks[c]}: ${shared.slice(0,6).join(', ')}${shared.length>6?` …+${shared.length-6}`:''}`) }
  }
  console.log(coll ? `    ${coll} COLLISION(S) — tripwire would fire` : '    silent — no tag appears in two regions')
  const { data: gen } = await adm.from('ai_generations')
    .select('outcome, output_tokens, thinking_tokens, max_tokens, cost_cents')
    .eq('agent_key','extractor').gte('created_at', t0all).order('created_at')
  let cents = 0
  console.log('\n  outcome    out_tok  think    max     cost')
  for (const g of gen ?? []) { cents += Number(g.cost_cents)
    console.log(`  ${String(g.outcome).padEnd(10)} ${String(g.output_tokens).padStart(6)} ${String(g.thinking_tokens).padStart(6)} ${String(g.max_tokens).padStart(6)}  ${Number(g.cost_cents).toFixed(2)}c`) }
  console.log(`\n  TOTAL ${rows} rows / 88 · ${cents.toFixed(1)}c`)
  console.log(`  hand counts (any order): ${HAND.join(' / ')}`)
} finally {
  for (const u of made) { await adm.from('intake_rows').delete().eq('upload_id', u.id)
    await adm.from('intake_uploads').delete().eq('id', u.id)
    await adm.storage.from('intake-files').remove([u.path]) }
  await b.close(); console.log(`  cleaned ${made.length}`)
}
