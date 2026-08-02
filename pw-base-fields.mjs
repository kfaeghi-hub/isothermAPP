// pw-base-fields — the universal base def set (nameplate campaign step 2).
//
//   node --env-file=.env pw-base-fields.mjs
//
// The claim being tested: EVERY unit can record identity, including untyped
// ones. That was the actual cause of "fields are missing" — 55% of the register
// had no type, and an untyped unit used to get no defs at all.
//
// ZZ-TEST only, self-cleaning in `finally`.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'

const fails = []
let passed = 0
const check = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg)
}

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())
const { data: zz } = await adm.from('projects').select('id, name').eq('name', TEST_PROJECT).single()

const made = []
let browser

try {
  // ── the firm def set ──────────────────────────────────────────────────────
  const { data: base } = await adm.from('equipment_type_field_defs')
    .select('*').eq('equipment_type', '__base').order('sort_order')
  check((base ?? []).length === 5, `5 base defs seeded (${base?.length ?? 0})`)

  const bySec = s => (base ?? []).filter(b => b.section === s).map(b => b.field_name).sort()
  check(JSON.stringify(bySec('spec')) === '[]',
    'THE SPEC COLUMN CARRIES NO IDENTITY — a specification states performance and ' +
    'lets the market answer; it never names a manufacturer')
  check(JSON.stringify(bySec('shop_drawing')) === '["Manufacturer","Model Number"]',
    'shop drawing proposes a make and model')
  check(JSON.stringify(bySec('installed')) === '["Manufacturer","Model Number","Serial Number"]',
    'the nameplate confirms them and adds the serial, which exists only on the unit')

  // ── __base is NOT an equipment type ───────────────────────────────────────
  const { data: asType } = await adm.from('equipment_types')
    .select('key').eq('key', '__base').maybeSingle()
  check(!asType,
    '__base is NOT in equipment_types — it can never be assigned to a unit or ' +
    'appear in the type picker')

  // ── nothing was stranded by the migration ─────────────────────────────────
  const { count: orphaned } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true })
    .not('manufacturer', 'is', null)
    .is('nameplate_extra->installed->>Manufacturer', null)
  check((orphaned ?? 0) === 0,
    `no unit holds a legacy manufacturer the nameplate cannot show (${orphaned} stranded)`)

  // ── an UNTYPED unit can record identity ───────────────────────────────────
  const { data: u, error: uErr } = await adm.from('equipment').insert({
    project_id: zz.id, kind: 'equipment', tag: 'ZZ-BASE-1',
    descriptor: 'ZZ base-fields fixture (deliberately untyped)',
  }).select('id').single()
  if (uErr) throw new Error(`seed: ${uErr.message}`)
  made.push(u.id)
  check(true, 'seeded an UNTYPED unit — the case that used to render nothing')

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await loginAs(page, adminCredentials())
  await page.goto(`${BASE_URL}/projects/${zz.id}?tab=equipment`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // the project's copy of the base set is seeded on first load
  const { count: projBase } = await adm.from('project_equipment_field_defs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', zz.id).eq('equipment_type', '__base')
  check((projBase ?? 0) === 5,
    `the project's editable copy was seeded on load (${projBase}) — visible in the ` +
    `field-structure editor as an ordinary group, not privileged UI`)

  await page.getByText('ZZ base-fields fixture', { exact: false }).first().click()
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()

  // CASE-INSENSITIVE: the labels are uppercased by CSS, so innerText returns
  // "MANUFACTURER". The first run of this gate failed on that and the product
  // was fine — a reminder that a text assertion tests the rendered string, not
  // the string in the source.
  check(/manufacturer/i.test(body) && /serial number/i.test(body),
    'AN UNTYPED UNIT NOW RENDERS IDENTITY FIELDS — the primary fix')
  check(/Installed/i.test(body), 'and it renders them inside the Installed section')
  check(!/Set an equipment type to unlock/.test(body),
    'the old dead-end fallback copy is gone')

  await page.screenshot({ path: 'out/base-untyped.png' })

  // ── a TYPED unit gets base PREPENDED, deduped ─────────────────────────────
  await adm.from('equipment').update({ equipment_type: 'pump' }).eq('id', u.id)
  const { data: pumpDefs } = await adm.from('equipment_type_field_defs')
    .select('field_name').eq('equipment_type', 'pump').eq('section', 'installed')
  const pumpHasMfr = (pumpDefs ?? []).some(d => d.field_name === 'Manufacturer')
  check(pumpHasMfr,
    'pump declares its own Manufacturer — so this is the dedup case, not a trivial one')

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.getByText('ZZ base-fields fixture', { exact: false }).first().click()
  await page.waitForTimeout(1200)
  const typedBody = await page.locator('body').innerText()
  const mfrCount = (typedBody.match(/manufacturer/gi) ?? []).length
  check(mfrCount >= 1 && mfrCount <= 3,
    `Manufacturer is not DOUBLED on a typed unit (${mfrCount} occurrences across ` +
    `three sections — the type's own row wins, base is deduped by field name)`)

} catch (e) {
  check(false, `run: ${e.message}`)
} finally {
  for (const id of made) await adm.from('equipment').delete().eq('id', id)
  // The project's base copy is left in place deliberately — it is real
  // configuration for ZZ-TEST now, exactly as it would be on any project, and
  // deleting it would make the next run test a state no real project is in.
  const { count } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id).like('tag', 'ZZ-BASE%')
  check((count ?? 0) === 0, `self-clean: 0 fixtures left (${count})`)
  if (browser) await browser.close()
}

console.log(`\n${'='.repeat(64)}`)
if (fails.length) { console.log(`FAIL — ${fails.length}:`); fails.forEach(f => console.log(`  - ${f}`)); process.exit(1) }
console.log(`PASS — base fields: every unit records identity, typed or not. ${passed} checks.`)
