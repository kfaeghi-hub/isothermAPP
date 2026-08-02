import { chromium } from 'playwright'
import { loginAs, adminCredentials, BASE_URL } from './pw-config.mjs'
import { createClient } from '@supabase/supabase-js'
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())
const { data: proj } = await adm.from('projects').select('id, name').eq('com_number', '257972').single()
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
await loginAs(p, adminCredentials())
await p.goto(`${BASE_URL}/projects/${proj.id}?tab=equipment`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
// open a Wall Fin — the 50-unit family that was rendering nothing
await p.getByText('WF-100', { exact: true }).first().click()
await p.waitForTimeout(1500)
await p.screenshot({ path: 'out/clairlea-after.png' })
const body = await p.locator('body').innerText()
console.log('shows SPEC/SHOP/INSTALLED:', /SPEC \(DESIGN\)/i.test(body), /INSTALLED/i.test(body))
console.log('has emitter fields:', /output/i.test(body), /entering water/i.test(body))
await b.close()
