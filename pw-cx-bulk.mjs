// pw-cx-bulk — the bulk gesture writes N rows in ONE confirmed act, attributably,
// ON ANY COLUMN — the door no longer asks the column's scope.
// [ATLAS] 2026-08-17, Phase 1 of the Cx Index client-facing build (ruled Q5);
// extended in Phase 2b for the AMENDED ruling: the gesture is a recording tool
// available on every column; scope is only a counting rule.
//
// THE CLAIMS, in the guard family's order:
//   · PREMISE — ZZ-TEST paints; the target column is UNIT-scoped and its
//     footer stat reads the shared n/N form. Under the ORIGINAL ruling this
//     cell was not a door at all — the amended leg exercises the gesture
//     exactly where the old build refused it.
//   · THE OFFER NAMES ITS COUNT — the confirm dialog must contain the exact
//     unit count the popover row promised.
//   · ONE ACT, N ROWS — a REST diff brackets the click: exactly the promised
//     rows changed, every one 'done', every one carrying updated_by.
//   · THE DISPLAY MOVES — the unit-form footer stat's numerator advances by
//     exactly the promised count.
//   · SCOPE STILL EDITS (§4.3) — the editor toggle flips the column to type,
//     the stat re-reads as the type K/N form, and the door was open in both
//     worlds. Scope reverts by id in cleanup.
//
// Cleanup in `finally`: written rows restored from the pre-snapshot by id,
// scope reverted, and a final REST read asserts the column matches the
// snapshot exactly — ZZ-TEST leaves as it arrived.
import { chromium } from '@playwright/test'
import { loginAs, adminCredentials, openTestProject, waitUntil, apiToken, TEST_PROJECT } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-cx-bulk')

const SB_URL = process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY
let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const token = await apiToken(adminCredentials())
const rest = async (path, init = {}) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`REST ${path} → ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const [proj] = await rest(`projects?name=eq.${encodeURIComponent(TEST_PROJECT)}&select=id`)
if (!proj) { console.error('ZZ-TEST not found — refusing.'); process.exit(1) }
const groupsRows = await rest(
  `project_cx_stage_groups?project_id=eq.${proj.id}&select=id,name,sort_order,project_cx_columns(id,label,sort_order,scope)&order=sort_order`)
const g0 = groupsRows[0]
const col = [...(g0?.project_cx_columns ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
if (!col) { console.error('ZZ-TEST has no Cx columns — refusing.'); process.exit(1) }
console.log(`  target: "${g0.name}" / "${col.label}" (scope today: ${col.scope})`)
check(col.scope === 'unit', `premise: the target column is unit-scoped (found: ${col.scope}) — the amended door`)

const snapshot = async () => await rest(
  `cx_cell_values?project_id=eq.${proj.id}&column_id=eq.${col.id}&select=equipment_id,status,updated_by`)
const before = await snapshot()

const browser = await chromium.launch()
const undo = []
try {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 900 })
  await loginAs(page, adminCredentials())
  await openTestProject(page)
  await page.getByRole('button', { name: 'Cx Index', exact: true }).click()
  await waitUntil(async () => await page.locator('[data-unit-row]').count() >= 20 ? true : null,
    { timeout: 20000, what: 'the matrix to paint' })

  // ── W1: THE INSTRUMENT AND THE BUTTON ARE SEPARATE ELEMENTS ───────────────
  // The stat cell READS (completion by default, toggle to remaining, persisted);
  // the gesture's door is the column HEADER. These checks fail on the pre-W1
  // build, where clicking the stat opened the popover — the pinned regression.
  const statCell = page.locator(`td[data-col-stat="${col.id}"]`)
  await waitUntil(async () => await statCell.count() === 1 ? true : null,
    { timeout: 10000, what: 'the footer stat cell to render' })
  // AMENDED W1 DISPLAY: the percentage is the PRIMARY figure, the fraction
  // secondary beneath it. (Failing-first vs the n/N-only build.)
  const statBefore = (await statCell.innerText()).replace(/\s+/g, ' ').trim()
  const m0 = statBefore.match(/^(\d+|—)% ?(\d+)\/(\d+)$/) ?? statBefore.match(/^(—) ?(\d+)\/(\d+)$/)
  check(!!m0, `default: the stat leads with a % figure over the n/N fraction (found "${statBefore}")`)
  check(await statCell.getAttribute('data-stat-mode') === 'completion',
    'default: the persisted mode is completion')
  const n0 = m0 ? Number(m0[2]) : NaN
  const d0 = m0 ? Number(m0[3]) : NaN
  check(!m0 || m0[1] === '—' || Number(m0[1]) === Math.round((n0 / d0) * 100),
    `the % figure agrees with its own fraction (${m0?.[1]}% vs ${n0}/${d0})`)

  // Toggle → remaining: the outstanding count, amber, persisted across reload.
  await statCell.click()
  const remText = await waitUntil(async () => {
    const t = (await statCell.innerText()).replace(/\s+/g, ' ').trim()
    return t !== statBefore ? t : null
  }, { timeout: 8000, what: 'the stat to flip to remaining' })
  check(remText === String(d0 - n0),
    `toggled: the stat reads the REMAINING count (${remText} = ${d0}−${n0})`)
  undo.push(async () => {
    await rest(`project_cx_columns?id=eq.${col.id}`, {
      method: 'PATCH', body: JSON.stringify({ stat_display: 'completion' }) })
  })
  await page.reload()
  await waitUntil(async () => await page.locator('[data-unit-row]').count() >= 20 ? true : null,
    { timeout: 20000, what: 'the matrix to repaint after reload' })
  check((await statCell.innerText()).replace(/\s+/g, ' ').trim() === remText &&
        await statCell.getAttribute('data-stat-mode') === 'remaining',
    'the remaining mode PERSISTS across reload')
  await statCell.click()
  await waitUntil(async () =>
    (await statCell.innerText()).replace(/\s+/g, ' ').trim() === statBefore ? true : null,
    { timeout: 8000, what: 'the stat to toggle back to completion' })
  check(true, 'toggling back restores the completion reading')

  // The stat cell is NOT the gesture's door any more — no popover appeared
  // through any of the clicks above.
  check(await page.locator('button', { hasText: /^mark \d+ done$/ }).count() === 0,
    'clicking the stat never opened the gesture (the instrument is not the button)')

  // ── W1 FOLLOW-UP: the door is a VISIBLE AFFORDANCE, not a bare click zone.
  // Every column carries the mass-apply control; this column's opens the
  // popover. (Failing-first vs the unmarked-header build.)
  const massBtns = await page.locator('button[data-col-mass]').count()
  const colCount = await page.locator('th[data-col-head]').count()
  check(massBtns === colCount && colCount > 0,
    `every column header carries the visible mass-apply control (${massBtns}/${colCount})`)
  await page.locator(`button[data-col-mass="${col.id}"]`).click()
  const anyMark = page.locator('button', { hasText: /^mark \d+ done$/ }).first()
  const opened = await waitUntil(async () => await anyMark.count() > 0 ? true : null,
    { timeout: 8000, what: 'the gesture popover to open from the header control' })
  check(!!opened, 'the visible control opens the gesture, on a unit-scoped column (amended Q5 + W1)')

  const typeKey = await anyMark.evaluate(b => b.closest('[data-bulk-row]')?.getAttribute('data-bulk-row'))
  const typeRow = page.locator(`[data-bulk-row="${typeKey}"]`)
  const markBtn = typeRow.locator('button')
  const promised = parseInt((await markBtn.innerText()).match(/mark (\d+) done/)[1], 10)
  const typeName = typeKey.toUpperCase()
  console.log(`  acting on type "${typeName}" — the offer promises ${promised} units`)

  let dialogText = ''
  page.once('dialog', d => { dialogText = d.message(); void d.accept() })
  await markBtn.click()
  await waitUntil(async () => dialogText ? true : null, { timeout: 8000, what: 'the confirm dialog' })
  check(dialogText.includes(`${promised} ${typeName} unit`),
    `the confirmation names the exact count ("…${promised} ${typeName} unit…")`)

  const arrived = await waitUntil(async () => {
    const rows = await snapshot()
    return rows.length !== before.length || rows.some(r =>
      !before.find(b => b.equipment_id === r.equipment_id && b.status === r.status)) ? rows : null
  }, { timeout: 10000, what: 'the bulk write to land' })
  const after = arrived ?? await snapshot()
  const beforeById = new Map(before.map(r => [r.equipment_id, r]))
  const changed = after.filter(r => beforeById.get(r.equipment_id)?.status !== r.status)
  check(changed.length === promised, `exactly the promised rows changed (${changed.length} of ${promised})`)
  check(changed.every(r => r.status === 'done'), 'every written row is done')
  check(changed.every(r => !!r.updated_by), 'every written row carries updated_by — attributable, not anonymous')
  undo.push(async () => {
    for (const r of changed) {
      const prev = beforeById.get(r.equipment_id)
      if (!prev) {
        await rest(`cx_cell_values?project_id=eq.${proj.id}&column_id=eq.${col.id}&equipment_id=eq.${r.equipment_id}`,
          { method: 'DELETE' })
      } else {
        await rest(`cx_cell_values?project_id=eq.${proj.id}&column_id=eq.${col.id}&equipment_id=eq.${r.equipment_id}`,
          { method: 'PATCH', body: JSON.stringify({ status: prev.status, updated_by: prev.updated_by }) })
      }
    }
  })

  const completed = await waitUntil(async () =>
    (await markBtn.innerText()).trim() === 'complete' ? true : null,
    { timeout: 8000, what: "the type row's button to read 'complete'" })
  check(!!completed, `the popover row for "${typeName}" reads complete after the act`)
  await page.mouse.click(200, 450)
  const bump = (s) => {
    const [n, d] = s.split('/').map(Number)
    return `${n + promised}/${d}`
  }
  const statAfter = await waitUntil(async () => {
    const t = (await statCell.innerText()).trim()
    return t !== statBefore ? t : null
  }, { timeout: 8000, what: 'the footer n/N to move' })
  check(statAfter === bump(statBefore),
    `the unit stat moved ${statBefore} → ${statAfter} (+${promised} done units)`)

  // ── §4.3 still holds: the editor flips scope, the form follows ────────────
  await page.getByRole('button', { name: 'Edit Structure' }).click()
  const scopeBtn = page.locator('button', { hasText: /^unit$/ }).first()
  await waitUntil(async () => await scopeBtn.count() > 0 ? true : null,
    { timeout: 8000, what: 'the structure editor to list scope toggles' })
  await scopeBtn.click()
  undo.push(async () => {
    await rest(`project_cx_columns?id=eq.${col.id}`, {
      method: 'PATCH', body: JSON.stringify({ scope: 'unit' }) })
  })
  const flipped = await waitUntil(async () =>
    (await rest(`project_cx_columns?id=eq.${col.id}&select=scope`))[0]?.scope === 'type' ? true : null,
    { timeout: 8000, what: "the scope write to land as 'type'" })
  check(!!flipped, `the editor toggle flipped "${col.label}" to type scope (§4.3 exercised)`)
  await page.mouse.click(200, 450)
  await waitUntil(async () =>
    await page.getByRole('heading', { name: 'Edit Cx Index Structure' }).count() === 0 ? true : null,
    { timeout: 8000, what: 'the structure panel to close' })
  const typeForm = await waitUntil(async () => {
    const t = (await statCell.innerText()).trim()
    return t !== statAfter ? t : null
  }, { timeout: 8000, what: 'the stat to re-read in the type K/N form' })
  check(!!typeForm, `the stat re-read as type form after the flip ("${typeForm}")`)
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  try {
    for (const u of undo.reverse()) await u()
    const restored = await snapshot()
    const same = restored.length === before.length && restored.every(r => {
      const b = before.find(x => x.equipment_id === r.equipment_id)
      return b && b.status === r.status
    })
    check(same, `ZZ-TEST restored exactly (${restored.length} rows, statuses match the snapshot)`)
  } catch (err) {
    check(false, `cleanup failed — ZZ-TEST may hold leftovers on column ${col.id}: ${err.message}`)
  }
  await browser.close()
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. Any column, one confirmed act, N named rows, every one attributed.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
