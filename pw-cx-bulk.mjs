// pw-cx-bulk — the bulk gesture writes N rows in ONE confirmed act, attributably.
// [ATLAS] 2026-08-17, Phase 1 of the Cx Index client-facing build (ruled Q5).
//
// THE CLAIMS, in the guard family's order:
//   · PREMISE — ZZ-TEST paints; a column exists whose scope this leg flips to
//     'type' through the real editor UI (the §4.3 per-project editability,
//     exercised rather than assumed); the by-type stat cell appears in the
//     footer row and is the gesture's door.
//   · THE OFFER NAMES ITS COUNT — the confirm dialog's text must contain the
//     exact unit count the popover row promised. An offer that says "mark all"
//     without the number is the anonymous-evidence problem at the offer stage.
//   · ONE ACT, N ROWS — a REST diff (admin JWT, ZZ-TEST only) brackets the
//     click: exactly the promised rows changed, every one to 'done', and every
//     one carries updated_by = the acting user (attributable writes, ruled).
//   · THE DISPLAY MOVES — the footer K/N reflects the completed type.
//
// Cleanup in `finally`, never as a trailing statement: written rows are
// removed / restored from the pre-snapshot by id, the scope flips back to
// 'unit', and a final REST read asserts the column's rows match the snapshot
// exactly — ZZ-TEST leaves as it arrived.
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

// ── Resolve ZZ-TEST + its first group's first column, entirely by name ───────
const [proj] = await rest(`projects?name=eq.${encodeURIComponent(TEST_PROJECT)}&select=id`)
if (!proj) { console.error('ZZ-TEST not found — refusing.'); process.exit(1) }
const groupsRows = await rest(
  `project_cx_stage_groups?project_id=eq.${proj.id}&select=id,name,sort_order,project_cx_columns(id,label,sort_order,scope)&order=sort_order`)
const g0 = groupsRows[0]
const col = [...(g0?.project_cx_columns ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
if (!col) { console.error('ZZ-TEST has no Cx columns — refusing.'); process.exit(1) }
console.log(`  target: "${g0.name}" / "${col.label}" (scope today: ${col.scope})`)
check(col.scope === 'unit', `premise: the target column starts unit-scoped (found: ${col.scope})`)

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

  // ── Flip the column to 'type' through the real editor ─────────────────────
  await page.getByRole('button', { name: 'Edit Structure' }).click()
  const scopeBtn = page.locator('button', { hasText: /^unit$/ }).first()
  await waitUntil(async () => await scopeBtn.count() > 0 ? true : null,
    { timeout: 8000, what: 'the structure editor to list scope toggles' })
  await scopeBtn.click()
  undo.push(async () => {           // scope back to unit, by id — never by guess
    await rest(`project_cx_columns?id=eq.${col.id}`, {
      method: 'PATCH', body: JSON.stringify({ scope: 'unit' }) })
  })
  const flipped = await waitUntil(async () =>
    (await rest(`project_cx_columns?id=eq.${col.id}&select=scope`))[0]?.scope === 'type' ? true : null,
    { timeout: 8000, what: "the scope write to land as 'type'" })
  check(!!flipped, `the editor toggle flipped "${col.label}" to type scope (§4.3 exercised)`)
  // The panel closes by clicking its backdrop; the drawer sits on the right,
  // so a click on the left half of the screen always lands on the backdrop.
  await page.mouse.click(200, 450)
  await waitUntil(async () =>
    await page.getByRole('heading', { name: 'Edit Cx Index Structure' }).count() === 0 ? true : null,
    { timeout: 8000, what: 'the structure panel to close' })

  // ── The by-type stat cell is the door ─────────────────────────────────────
  const statCell = page.locator(`td[data-col-stat="${col.id}"]`)
  await waitUntil(async () => await statCell.count() === 1 ? true : null,
    { timeout: 10000, what: 'the footer stat cell to render for the flipped column' })
  const statBefore = (await statCell.innerText()).trim()
  check(/\d+\/\d+/.test(statBefore), `the stat reads K/N (found "${statBefore}")`)
  await statCell.click()

  // ── Pick the first actionable type from the popover ───────────────────────
  // Resolve the ROW first and hold it by its stable key: a locator derived
  // from the button's text re-resolves after the re-render — when this
  // button flips to 'complete', a text-matched locator would silently drift
  // to a DIFFERENT type's row (the first pw run failed exactly there).
  const anyMark = page.locator('button', { hasText: /^mark \d+ done$/ }).first()
  await waitUntil(async () => await anyMark.count() > 0 ? true : null,
    { timeout: 8000, what: 'a type row with units to mark' })
  const typeKey = await anyMark.evaluate(b => b.closest('[data-bulk-row]')?.getAttribute('data-bulk-row'))
  const typeRow = page.locator(`[data-bulk-row="${typeKey}"]`)
  const markBtn = typeRow.locator('button')
  const promised = parseInt((await markBtn.innerText()).match(/mark (\d+) done/)[1], 10)
  const typeName = typeKey.toUpperCase()
  console.log(`  acting on type "${typeName}" — the offer promises ${promised} units`)

  // ── The confirm must NAME the count; accept it ────────────────────────────
  let dialogText = ''
  page.once('dialog', d => { dialogText = d.message(); void d.accept() })
  await markBtn.click()
  await waitUntil(async () => dialogText ? true : null, { timeout: 8000, what: 'the confirm dialog' })
  check(dialogText.includes(`${promised} ${typeName.toUpperCase()} unit`),
    `the confirmation names the exact count ("…${promised} ${typeName.toUpperCase()} unit…")`)

  // ── One act, N rows, attributable ─────────────────────────────────────────
  const arrived = await waitUntil(async () => {
    const rows = await snapshot()
    return rows.length !== before.length || rows.some(r =>
      !before.find(b => b.equipment_id === r.equipment_id && b.status === r.status)) ? rows : null
  }, { timeout: 10000, what: 'the bulk write to land' })
  const after = arrived ?? await snapshot()
  const beforeById = new Map(before.map(r => [r.equipment_id, r]))
  const changed = after.filter(r => beforeById.get(r.equipment_id)?.status !== r.status)
  check(changed.length === promised,
    `exactly the promised rows changed (${changed.length} of ${promised})`)
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

  // ── The display moves: the row completes AND the footer K/N increments ────
  const completed = await waitUntil(async () =>
    (await markBtn.innerText()).trim() === 'complete' ? true : null,
    { timeout: 8000, what: "the type row's button to read 'complete'" })
  check(!!completed, `the popover row for "${typeName}" reads complete after the act`)
  await page.mouse.click(200, 450)          // close the popover via its backdrop
  const statAfter = await waitUntil(async () => {
    const t = (await statCell.innerText()).trim()
    return t !== statBefore ? t : null
  }, { timeout: 8000, what: 'the footer K/N to move' })
  const bump = (s) => s && `${parseInt(s, 10) + 1}${s.slice(String(parseInt(s, 10)).length)}`
  check(statAfter === bump(statBefore),
    `the footer stat moved ${statBefore} → ${statAfter} (one more type complete)`)
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
  ? `PASS — ${pass} checks. One confirmed act, N named rows, every one attributed.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
