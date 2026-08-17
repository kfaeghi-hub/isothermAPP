// pw-cx-counting — the collapsed-group % and the row % answer with ONE rule.
// [ATLAS] 2026-08-17, Phase 1 commit 1 of the Cx Index client-facing build
// (CX-INDEX-EXPORT-PROPOSAL.md §1.2 defect, ruled fixed first — Q7).
//
// THE DEFECT THIS PINS: the collapsed-group summary cell carried its own copy
// of the counting rule which consulted only the deprecated legacy 'na' STATUS,
// never the cx_cell_applicability overlay. An overlay-N/A cell stayed in its
// denominator as not-done; a done-but-overlay-N/A'd cell stayed in its
// numerator. Since ruling D1 every NEW not-applicable is overlay-only, the
// collapsed number disagreed with the row % beside it for any unit carrying
// overlay rows, and drifted further with every ratified rule. The fix routes
// all three counting sites through src/lib/cxCounting.ts (unit-tested there);
// this leg is the SIGHTED proof the rendered summary consults the overlay.
//
// The sibling rule governs the shape: under the OLD code the summary answered
// THE SAME in the two states this leg constructs (done-and-applicable vs
// done-under-overlay both kept the cell in the arithmetic); under the fix it
// answers differently. A guard that answers the same in both states is not a
// guard — so the leg asserts both values, exactly, from observed cell states.
//
// What is asserted, in the guard family's order:
//   · PREMISE — the matrix painted; TEST-HP-1's row exists; the first stage
//     group has at least one blank applicable cell to use as the target.
//   · ARRIVAL — each click landed: the cell's rendered state changed to what
//     the click means (✓, then struck-✓) before anything is measured.
//   · THE CLAIM — collapsed % with the target done == expected-with-done;
//     after overlay-N/A'ing the same cell, collapsed % == expected-without —
//     overlay excluded from BOTH sides — and the two differ.
//
// Writes: target cell blank → done → (overlay on, overlay off) → blank, all on
// ZZ-TEST via the UI's own handlers, restored in `finally` (cleanup belongs in
// finally, never as a trailing statement). If every other cell in the group is
// already done (the degenerate state where the two expectations coincide), one
// done cell is stepped to in_progress for the measurement and stepped back.
import { chromium } from '@playwright/test'
import { loginAs, adminCredentials, openTestProject, waitUntil } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-cx-counting')

const TAG = 'TEST-HP-1'
let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const browser = await chromium.launch()
const cleanup = []            // LIFO of async undo steps, run in finally
try {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 900 })

  await loginAs(page, adminCredentials())
  await openTestProject(page)
  await page.getByRole('button', { name: 'Cx Index', exact: true }).click()

  const rows = page.locator('[data-unit-row]')
  await waitUntil(async () => await rows.count() >= 20 ? rows : null,
    { timeout: 20000, what: 'the Cx Index matrix to paint' })

  // ── The first stage group: name + column count from its band cell ──────────
  const band = page.locator('thead tr').first().locator('th').nth(2)
  const groupName = (await band.innerText()).replace(/^[▼▶]\s*/, '').trim()
  const groupCols = parseInt(await band.getAttribute('colspan') ?? '1', 10)
  check(groupCols > 1, `premise: first group "${groupName}" is expanded with ${groupCols} columns`)

  const row = rows.filter({ has: page.getByRole('button', { name: TAG, exact: true }) }).first()
  check(await row.count() === 1, `premise: ${TAG}'s unit row exists`)

  // Classify the group's cells exactly as the page renders them. Body td order:
  // 0 = #, 1 = tag, then status cells in group order — group 1 starts at 2.
  const readStates = () => row.evaluate((tr, n) => {
    const tds = [...tr.querySelectorAll('td')].slice(2, 2 + n)
    return tds.map(td => {
      const cls = td.className
      if (cls.includes('bg-gray-100')) return 'na'
      if (cls.includes('bg-teal-700')) return 'done'
      if (cls.includes('bg-amber-400')) return 'in_progress'
      return 'blank'
    })
  }, groupCols)

  const states = await readStates()
  const targetIdx = states.indexOf('blank')
  check(targetIdx >= 0,
    `premise: the group has a blank applicable cell to use (states: ${states.join(',')})`)
  if (targetIdx < 0) throw new Error('no blank cell — refusing to guess')

  const cellTd = (idx) => row.locator('td').nth(2 + idx)
  const waitCellState = (idx, want) => waitUntil(async () =>
    (await readStates())[idx] === want ? true : null,
    { timeout: 8000, what: `cell ${idx} to render as ${want}` })

  // ── Degenerate-state guard: if every OTHER cell is done, the two collapsed
  // expectations coincide (both 100%) and the leg could pass vacuously. Step
  // one done cell to in_progress for the measurement; restore after.
  const others = states.filter((_, i) => i !== targetIdx)
  if (others.length && others.every(s => s === 'na' || s === 'done')
      && others.some(s => s === 'done')) {
    const stepIdx = states.findIndex((s, i) => i !== targetIdx && s === 'done')
    await cellTd(stepIdx).click()                    // done → in_progress
    await waitCellState(stepIdx, 'in_progress')
    cleanup.push(async () => {                       // in_progress → blank → done
      await cellTd(stepIdx).click(); await waitCellState(stepIdx, 'blank')
      await cellTd(stepIdx).click(); await waitCellState(stepIdx, 'done')
    })
    console.log(`  (degenerate state: stepped cell ${stepIdx} done → in_progress for distinctness)`)
  }

  // Expected values from OBSERVED states of the other cells, under the one rule.
  const obs = await readStates()
  const d0 = obs.filter((s, i) => i !== targetIdx && s === 'done').length
  const o0 = obs.filter((s, i) => i !== targetIdx && (s === 'blank' || s === 'in_progress')).length
  const pctWithDone = Math.round(((d0 + 1) / (d0 + o0 + 1)) * 100)
  const pctWithout  = (d0 + o0) === 0 ? 100 : Math.round((d0 / (d0 + o0)) * 100)
  check(pctWithDone !== pctWithout,
    `premise: the two states are distinguishable (${pctWithDone}% vs ${pctWithout}%)`)

  // ── ARRIVAL: target blank → done ───────────────────────────────────────────
  await cellTd(targetIdx).click()
  check(!!(await waitCellState(targetIdx, 'done')), 'the target cell renders ✓ done')
  cleanup.push(async () => {                         // done → in_progress → blank
    await cellTd(targetIdx).click(); await waitCellState(targetIdx, 'in_progress')
    await cellTd(targetIdx).click(); await waitCellState(targetIdx, 'blank')
  })

  const summaryPct = async () => {
    const td = row.locator('td').nth(2)              // collapsed group renders one summary td at the same offset
    const txt = await td.innerText()
    const m = txt.match(/(\d+)%/)
    return m ? parseInt(m[1], 10) : NaN
  }
  const collapse = async () => { await band.click(); await waitUntil(async () =>
    /%/.test(await row.locator('td').nth(2).innerText()) ? true : null,
    { timeout: 8000, what: 'the collapsed summary cell to render' }) }
  const expand = async () => {
    await page.locator('thead tr').first().locator('th').nth(2).click()
    await waitUntil(async () => (await row.locator('td').count()) > groupCols ? true : null,
      { timeout: 8000, what: 'the group to expand back' })
  }

  // ── CLAIM 1: collapsed % counts the done cell ──────────────────────────────
  await collapse()
  const a = await summaryPct()
  check(a === pctWithDone, `collapsed "${groupName}" reads ${a}% with the target done (expected ${pctWithDone}%)`)
  await expand()

  // ── The overlay: alt-click the done cell → N/A, struck-through ✓ ──────────
  await cellTd(targetIdx).click({ modifiers: ['Alt'] })
  check(!!(await waitCellState(targetIdx, 'na')), 'the overlay landed (cell renders N/A)')
  cleanup.unshift(async () => {                      // overlay off BEFORE status cleanup
    if ((await readStates())[targetIdx] === 'na') {
      await cellTd(targetIdx).click({ modifiers: ['Alt'] })
      await waitUntil(async () => (await readStates())[targetIdx] !== 'na' ? true : null,
        { timeout: 8000, what: 'the overlay to clear' })
    }
  })
  const struck = await cellTd(targetIdx).locator('span.line-through').count()
  check(struck === 1, 'the done-under-overlay cell renders the struck-through ✓ (the record survives)')

  // ── CLAIM 2: collapsed % now excludes it from BOTH sides ──────────────────
  await collapse()
  const b = await summaryPct()
  check(b === pctWithout,
    `collapsed "${groupName}" reads ${b}% with the same cell overlay-N/A'd (expected ${pctWithout}% — ` +
    `the old rule would still have read ${pctWithDone}%)`)
  await expand()
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  try { for (const undo of cleanup) await undo() }
  catch (err) { check(false, `cleanup failed — ZZ-TEST may hold leftovers: ${err.message}`) }
  await browser.close()
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. One counting rule; the summary consults the overlay.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
