import { chromium } from 'playwright'
import { loginAs, adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'
import { createClient } from '@supabase/supabase-js'
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())
const { data: zz } = await adm.from('projects').select('id').eq('name', TEST_PROJECT).single()
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 950 } })
await loginAs(p, adminCredentials())
await p.goto(`${BASE_URL}/projects/${zz.id}?tab=equipment`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
await p.getByText('TEST-AHU-1', { exact: false }).first().click()
await p.waitForTimeout(1200)
await p.getByRole('button', { name: 'Edit', exact: true }).first().click()
await p.waitForTimeout(900)
// focus the Location meta field and open its suggestion list
const loc = p.locator('input[list]').first()
const has = await loc.count()
console.log('inputs with a datalist:', has)
if (has) {
  await loc.click()
  await loc.type('L')
  await p.waitForTimeout(800)
}
await p.screenshot({ path: 'out/datalist-check.png' })
await b.close()
