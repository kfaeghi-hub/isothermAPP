// Meeting Minutes — full-flow verification (ZZ-TEST only, self-cleaning):
//   topic seeding from the type skeleton · matrix-attributed attendee + items ·
//   document content (title, bands, action summary grouping, disclaimer, No-items row) ·
//   carry-forward with ORIGINAL number retention · close-carried-item isolation.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-meetings.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { inflateRawSync } from 'node:zlib'
import { login, openTestProject } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

function docxXml(buf) {
  let i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const m = buf.readUInt16LE(i + 8), cs = buf.readUInt32LE(i + 18)
    const nl = buf.readUInt16LE(i + 26), el = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nl).toString('latin1')
    const s = i + 30 + nl + el
    if (name === 'word/document.xml' && cs > 0) {
      const d = buf.subarray(s, s + cs)
      return (m === 8 ? inflateRawSync(d) : d).toString('utf8')
    }
    i = s + (cs || 1)
  }
  return ''
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
// Admin client for privileged cleanup only (issued meetings are frozen for employees).
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })

// Pre-clean any leftovers from a failed prior run (admin — may include issued meetings)
{
  const { data } = await adm.from('meetings').delete().eq('project_id', ZZ).select('id')
  if (data?.length) console.log(`pre-clean: removed ${data.length} leftover meeting(s)`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 1000 })
const modal = page.locator('div.fixed.inset-0')

const itemRow = (num) =>
  page.locator('tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${num.replace('.', '\\.')}\\s*↺?$`) }) })

try {
  await login(page)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Meetings', exact: true }).click()
  await page.waitForTimeout(1500)

  // ── Meeting #1: Recurring Cx Meeting, topics seeded from skeleton ────────
  await page.getByRole('button', { name: '+ New Meeting' }).first().click()
  await page.waitForTimeout(600)
  await modal.locator('select').first().selectOption({ label: 'Recurring Cx Meeting' })
  await page.waitForTimeout(300)
  check(await modal.locator('input[type="number"]').inputValue() === '1', 'meeting number auto-suggested as 1')
  await modal.getByRole('button', { name: 'Create Meeting' }).click()
  await page.waitForTimeout(2500)

  for (const t of ['Review of Previous Minutes', 'Checklist (PFC) Status', 'Issues Log Review', 'Next Meeting']) {
    check(await page.locator(`input[value="${t}"]`).count() === 1, `topic seeded: ${t}`)
  }
  const { data: t1 } = await sb.from('meeting_topics').select('id', { count: 'exact' })
    .eq('meeting_id', (await sb.from('meetings').select('id').eq('project_id', ZZ).single()).data.id)
  check((t1 ?? []).length === 11, `all 11 Recurring topics copied (got ${(t1 ?? []).length})`)

  // ── Attendee from directory: matrix member surfaces first, role auto ─────
  await page.locator('[data-testid="add-attendee"]').click()
  await page.waitForTimeout(500)
  check(await modal.getByText('Project team').count() === 1, 'attendee picker: Project team group first')
  const rayRow = modal.getByRole('button').filter({ hasText: 'Ray Scheepstra' }).first()
  check(await rayRow.getByText('BAS', { exact: true }).count() === 1, 'matrix member shows auto role chip (BAS)')
  await rayRow.click()
  await page.waitForTimeout(1000)
  check(await page.locator('input[value="BAS"]').count() >= 1, 'attendee role auto-attributed from the matrix')

  // ── Items: one matrix-attributed, one free-text, numbers 1.1 / 1.2 ───────
  await page.locator('[data-testid="add-item-0"]').click({ force: true })
  await page.waitForTimeout(800)
  check(await itemRow('1.1').count() === 1, 'first item numbered 1.1')
  await itemRow('1.1').locator('textarea').fill('BAS graphics review outstanding for AHU floors')
  await itemRow('1.1').locator('textarea').press('Tab')
  await page.waitForTimeout(600)
  await itemRow('1.1').locator('select').first().selectOption({ label: 'BAS — Automated Logic Controls' })
  await page.waitForTimeout(600)

  await page.locator('[data-testid="add-item-1"]').click({ force: true })
  await page.waitForTimeout(800)
  check(await itemRow('1.2').count() === 1, 'second item numbered 1.2')
  await itemRow('1.2').locator('textarea').fill('Revised construction schedule to be circulated')
  await itemRow('1.2').locator('textarea').press('Tab')
  await page.waitForTimeout(600)
  await itemRow('1.2').locator('select').first().selectOption('__text')
  await page.waitForTimeout(300)
  await itemRow('1.2').locator('input[placeholder="responsible"]').fill('GC — site office')
  await itemRow('1.2').locator('input[placeholder="responsible"]').press('Tab')
  await page.waitForTimeout(600)

  // ── Generate + document content ──────────────────────────────────────────
  await page.locator('[data-testid="generate-minutes"]').click()
  await page.waitForTimeout(25000)   // cold-start chromium can be slow
  check(await page.getByText('ISSUED').count() >= 1, 'meeting flips to ISSUED')

  const { data: mtg1 } = await sb.from('meetings').select('id, storage_url, issued_at').eq('project_id', ZZ).single()
  check(!!mtg1?.issued_at, 'issued_at stamped')
  const docx = Buffer.from(await (await fetch(mtg1.storage_url)).arrayBuffer())
  const txt = docxXml(docx).replace(/<[^>]+>/g, ' ')
  check(txt.includes('MEETING MINUTES — Recurring Cx Meeting #1'), 'doc: title line')
  check(txt.includes('REVIEW OF PREVIOUS MINUTES'), 'doc: navy topic band (uppercase)')
  check(txt.includes('1.1') && txt.includes('BAS graphics review outstanding'), 'doc: item 1.1 with discussion')
  check(txt.includes('BAS — Automated Logic Controls'), 'doc: matrix-attributed responsible renders')
  check(txt.includes('GC — site office'), 'doc: free-text responsible renders')
  check(txt.includes('Action Summary by Responsible Party'), 'doc: action summary section')
  check(/BAS — Automated Logic Controls — 1\.1/.test(txt), 'doc: action summary grouped by responsible with item numbers')
  check(txt.includes('No items — reviewed, nothing arising.'), 'doc: empty topics render the muted No-items row')
  check(txt.includes('within seven (7) days of issue'), 'doc: 7-day disclaimer')

  // ── Meeting #2: carry-forward, number retention ──────────────────────────
  await page.getByRole('button', { name: '+ New Meeting' }).first().click()
  await page.waitForTimeout(600)
  await modal.locator('select').first().selectOption({ label: 'Recurring Cx Meeting' })
  await page.waitForTimeout(400)
  check(await modal.locator('input[type="number"]').inputValue() === '2', 'meeting number auto-suggested as 2')
  const carryText = await modal.locator('label', { hasText: 'Carry forward' }).innerText().catch(() => '')
  check(/Carry forward\s+2\s+open items/.test(carryText), `carry-forward offered with count (got: ${carryText.split('\n')[0]})`)
  await modal.getByRole('button', { name: 'Create Meeting' }).click()
  await page.waitForTimeout(3000)

  check(await itemRow('1.1').count() === 1, 'RETENTION: item 1.1 keeps its number in meeting #2')
  check(await itemRow('1.2').count() === 1, 'RETENTION: item 1.2 keeps its number in meeting #2')
  check((await itemRow('1.1').innerText()).includes('↺'), 'carried marker shown')

  // New item in #2 numbers from the new meeting: 2.1
  await page.locator('[data-testid="add-item-0"]').click({ force: true })
  await page.waitForTimeout(800)
  check(await itemRow('2.1').count() === 1, 'new item in meeting #2 numbered 2.1')

  // ── Close-carried-item isolation ─────────────────────────────────────────
  await itemRow('1.1').locator('select').nth(1).selectOption('closed')
  await page.waitForTimeout(800)
  const { data: m1items } = await sb.from('meeting_items')
    .select('item_number, status').eq('meeting_id', mtg1.id)
  const orig11 = (m1items ?? []).find(i => i.item_number === '1.1')
  check(orig11?.status === 'open', 'ISOLATION: closing carried 1.1 in #2 leaves #1 frozen (still open)')

  // ── Self-clean via ADMIN (issued meeting #1 is a frozen record for employees —
  // its delete correctly requires owner rights under access control) ─────────
  await adm.from('meetings').delete().eq('project_id', ZZ)
  const { data: left } = await adm.from('meetings').select('id').eq('project_id', ZZ)
  check((left ?? []).length === 0, 'self-clean: no meetings left on ZZ-TEST')
} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-meetings-fail.png', fullPage: true }).catch(() => {})
  // best-effort DB clean
  await adm.from('meetings').delete().eq('project_id', ZZ)
}

await browser.close()
console.log('\n' + '='.repeat(60))
console.log(fails.length === 0 ? 'PASS — meeting minutes verified end-to-end.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
