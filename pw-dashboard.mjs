// Dashboard verification (ZZ-TEST family only, self-cleaning).
//
// Seeds one state per widget — all via INSERT-TIME timestamps (updated_at /
// created_at supplied on insert stick; only updates get trigger-stamped):
//   overdue meeting item · finding aged 40d · draft meeting 10d old ·
//   in-progress checklist idle 20d · never-visited project (ZZ-TEST-DASH).
// Asserts chips, every Attention Queue row, a deep link, portfolio card chip,
// responsible-party company grouping (matrix seat + finding on ONE company key),
// My Items, Recent Activity, and the project Overview stat header. Then cleans.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-dashboard.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const MARK = 'ZZ-DASH'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
const isoDate = (daysAgo) => iso(daysAgo).slice(0, 10)

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
// Admin client for privileged seed/cleanup (project create/delete, issued-meeting +
// finding deletes are owner-only under access control — §6.1 credential split).
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
const { data: { user: empUser } } = await sb.auth.getUser()

// ── Pre-clean leftovers from a failed prior run (admin) ─────────────────────
async function cleanup() {
  await adm.from('findings').delete().eq('project_id', ZZ).like('title', `${MARK}%`)
  const { data: mtgs } = await adm.from('meetings').select('id').eq('project_id', ZZ).gte('meeting_number', 900)
  for (const m of mtgs ?? []) await adm.from('meetings').delete().eq('id', m.id)
  await adm.from('checklist_instances').delete().eq('project_id', ZZ).like('source_template_name_snapshot', `${MARK}%`)
  const { data: projs } = await adm.from('projects').select('id').like('name', 'ZZ-TEST-DASH%')
  for (const p of projs ?? []) await adm.from('projects').delete().eq('id', p.id)
}
await cleanup()

// ── Seed ────────────────────────────────────────────────────────────────────
const { data: recurType } = await sb.from('meeting_types').select('id').eq('name', 'Recurring Cx Meeting').single()
const { data: basSeat } = await sb.from('project_team_assignments')
  .select('id, contact_id, company_id').eq('project_id', ZZ).limit(1).single()

// 1 · meeting with an overdue open item, matrix-attributed (issued → seeded as admin;
//     dev.test still SEES it as a ZZ-TEST member)
const { data: mtg1 } = await adm.from('meetings').insert({
  project_id: ZZ, meeting_type_id: recurType.id, meeting_number: 900,
  meeting_date: isoDate(30), status: 'issued', issued_at: iso(30),
}).select('id').single()
const { data: topic1 } = await sb.from('meeting_topics').insert({
  meeting_id: mtg1.id, title: 'Old Business', sort_order: 0,
}).select('id').single()
await sb.from('meeting_items').insert({
  meeting_id: mtg1.id, topic_id: topic1.id, item_number: '900.1',
  discussion: `${MARK} overdue action item`, due_date: isoDate(5), status: 'open',
  responsible_assignment_id: basSeat.id, created_at: iso(30), sort_order: 0,
})

// 2 · aged finding (40d), mine (Dev Test), responsible = matrix contact's company
const { data: finding } = await sb.from('findings').insert({
  project_id: ZZ, title: `${MARK} aged finding`, category: 'INFO', status: 'open',
  date_raised: isoDate(40), identified_by: 'Dev Test',
  responsible_party_id: basSeat.contact_id,
}).select('id, number').single()

// 3 · stale draft meeting (created 10d ago)
await sb.from('meetings').insert({
  project_id: ZZ, meeting_type_id: recurType.id, meeting_number: 901,
  meeting_date: isoDate(10), status: 'draft', created_at: iso(10),
})

// 4 · in-progress checklist idle 20d (bare instance row is enough for the queue)
await sb.from('checklist_instances').insert({
  project_id: ZZ, source_template_name_snapshot: `${MARK} stale checklist`,
  source_template_type_snapshot: 'pfc', type: 'pfc', status: 'in_progress',
  created_at: iso(25), updated_at: iso(20),
})

// 5 · never-visited active project — created by ADMIN (C1: employees cannot create
//     projects), then dev.test added as member so the employee dashboard shows it
const { data: neverProj } = await adm.from('projects').insert({
  name: 'ZZ-TEST-DASH Never Visited', status: 'active',
}).select('id').single()
await adm.from('project_members').insert({ project_id: neverProj.id, profile_id: empUser.id })

console.log('seeded: overdue item, 40d finding, 10d draft, 20d checklist, never-visited project')

// ── Drive the dashboard ─────────────────────────────────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 1000 })

try {
  await login(page)   // lands on / — the dashboard is home
  await page.waitForTimeout(2500)

  check(await page.locator('[data-testid="chip-active"]').count() === 1, 'dashboard is home: stat chips render')
  const overdueCount = parseInt(await page.locator('[data-testid="chip-overdue"] p').first().innerText(), 10)
  check(overdueCount >= 1, `Overdue Action Items chip counts the seeded item (${overdueCount})`)

  // Attention Queue — all four seeded states present
  const queueText = await page.locator('[data-testid="attention-queue"]').innerText()
  check(queueText.includes(`${MARK} overdue action item`), 'queue: overdue meeting item')
  check(queueText.includes(`${MARK} aged finding`), 'queue: aged finding')
  check(/AGED\s*30\+|AGED\s*60\+|AGED\s*90\+|30\+/.test(queueText), 'queue: age chip (30/60/90+) rendered')
  check(queueText.includes('#901 still draft'), 'queue: stale draft meeting')
  check(queueText.includes(`${MARK} stale checklist untouched`), 'queue: stale checklist')

  // Deep link: the aged finding row → Issues Log
  const fRow = page.locator('[data-testid="attention-queue"] tr', { hasText: `${MARK} aged finding` })
  await fRow.getByRole('link', { name: 'Open' }).click()
  await page.waitForTimeout(2000)
  check(page.url().includes(`/projects/${ZZ}?tab=issues`), 'deep link: URL is /projects/:id?tab=issues')
  check(await page.getByText(`${MARK} aged finding`).count() > 0, 'deep link: Issues Log shows the finding')

  // Overview stat header (same-derivation proof surface)
  await page.goto(page.url().split('?')[0])
  await page.waitForTimeout(2000)
  const header = page.locator('[data-testid="project-stat-header"]')
  check(await header.count() === 1, 'project Overview stat header renders')
  // innerText returns RENDERED text — the label is CSS-uppercased.
  check(/open findings/i.test(await header.innerText()), 'stat header shows Open Findings')

  // Back to the dashboard: portfolio card for the never-visited project
  await page.goto(page.url().replace(/\/projects.*/, '/'))
  await page.waitForTimeout(2500)
  const cards = page.locator('[data-testid="portfolio-cards"]')
  const neverCard = cards.locator('a', { hasText: 'ZZ-TEST-DASH Never Visited' })
  check(await neverCard.count() === 1, 'portfolio card for the never-visited project')
  check((await neverCard.innerText()).includes('Never visited'), 'card shows grey Never visited chip')

  // Responsible rollup: matrix item + finding land in ONE company-keyed group
  const resp = page.locator('[data-testid="responsible-table"]')
  const groupRow = resp.locator('tr', { hasText: 'Automated Logic Controls' }).first()
  check(await groupRow.count() === 1, 'responsible rollup groups by company via the matrix')
  const groupCells = await groupRow.innerText()
  check(/\b2\b/.test(groupCells), `group unions the meeting item AND the finding (got: ${groupCells.replace(/\s+/g, ' ')})`)
  await groupRow.click()
  await page.waitForTimeout(400)
  check((await resp.innerText()).includes('900.1'), 'expanded group lists the meeting item')

  // My Items (name-matched) + Recent Activity
  check((await page.locator('[data-testid="my-items"]').innerText()).includes(`${MARK} aged finding`),
    'My Items lists my identified finding')
  check((await page.locator('[data-testid="recent-activity"]').innerText().catch(() => '')).length > 0,
    'Recent Activity renders')
} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-dashboard-fail.png', fullPage: true }).catch(() => {})
}

await browser.close()

// ── Self-clean (admin) ──────────────────────────────────────────────────────
await cleanup()
const { data: leftover } = await adm.from('findings').select('id').eq('project_id', ZZ).like('title', `${MARK}%`)
check((leftover ?? []).length === 0, 'self-clean: seeded rows removed')

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0 ? 'PASS — dashboard verified end-to-end.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
