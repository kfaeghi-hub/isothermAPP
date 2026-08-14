// pw-cx-sticky-header — the Cx Index header holds while the matrix scrolls.
// [RIVET] 2026-08-14, T7 of the first maintenance triage.
//
// THE DEFECT THIS PINS: the matrix's thead scrolled away with the rows (measured
// y: 309 → −891 on a real register), so one screen of scroll left 88 status
// columns with no identity anywhere. The tag column was already pinned
// (sticky left); the header rows were never pinned (sticky top), and the table
// was border-collapse — under which Chromium drops a stuck cell's borders
// (crbug 702927), which is why the fix converts to border-separate.
//
// What is asserted, in the order the guard family demands:
//   · PREMISE — the matrix is actually scrollable here (scrollHeight exceeds
//     the viewport by a real margin). A sticky assertion on an unscrollable
//     table passes whether or not the feature exists.
//   · ARRIVAL — the scroll happened: a real unit row moved up by at least the
//     amount asserted about the header. "The header did not move" is a negative
//     and proves nothing until something else demonstrably did.
//   · THE CLAIM — after scrolling, the thead's box still sits at the scroller's
//     top edge: row 1 at the top, row 2 (rotated labels) seamed at +24px.
//   · BOTH AXES — after a horizontal scroll on top of the vertical one, the
//     Tag/Descriptor corner cell holds both its left pin and its top pin.
//
// Read-only: navigates and measures. It writes nothing and seeds nothing.
// ZZ-TEST only via openTestProject's guard.
import { chromium } from '@playwright/test'
import { login, openTestProject, waitUntil } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-cx-sticky-header')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 900 })

  await login(page)
  await openTestProject(page)

  await page.getByRole('button', { name: 'Cx Index', exact: true }).click()
  const rows = page.locator('[data-unit-row]')
  const painted = await waitUntil(async () => await rows.count() >= 20 ? rows : null,
    { timeout: 20000, what: 'the Cx Index matrix to paint at least 20 unit rows' })
  check(!!painted, `the matrix painted (${await rows.count()} unit rows)`)

  const scroller = async () => await page.evaluate(() => {
    const el = document.querySelector('thead')?.closest('.overflow-auto')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, scrollTop: el.scrollTop, scrollLeft: el.scrollLeft,
             scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  })

  // ── PREMISE: this table can scroll far enough for the claim to mean anything.
  const s0 = await scroller()
  check(!!s0, 'the matrix scroll container exists (thead has an .overflow-auto ancestor)')
  const scrollable = !!s0 && s0.scrollHeight > s0.clientHeight + 600
  check(scrollable,
    `the matrix is scrollable by a real margin (scrollHeight ${s0?.scrollHeight} vs client ${s0?.clientHeight}) — ` +
    `an unscrollable table would make every later check vacuous`)

  if (scrollable) {
    const firstRowYBefore = (await rows.first().boundingBox())?.y ?? NaN

    // ── ACT + ARRIVAL: scroll, and prove the content moved.
    await page.evaluate(() => {
      const el = document.querySelector('thead').closest('.overflow-auto')
      el.scrollTop = 800
    })
    const arrived = await waitUntil(async () => {
      const s = await scroller()
      return s && s.scrollTop >= 700 ? s : null
    }, { timeout: 8000, what: 'the matrix to report scrollTop ≥ 700' })
    check(!!arrived, `the scroll landed (scrollTop ${arrived?.scrollTop ?? 'never'})`)
    const firstRowYAfter = (await rows.first().boundingBox())?.y ?? NaN
    check(firstRowYBefore - firstRowYAfter >= 600,
      `a real unit row moved up ≥600px (${Math.round(firstRowYBefore)} → ${Math.round(firstRowYAfter)}) — the arrival the header claim leans on`)

    // ── THE CLAIM: the header held at the scroller's top edge. Measured on a
    // STUCK CELL, not on <thead>: position:sticky pins the th boxes while the
    // thead element itself keeps its place in table flow — asserting the
    // container would go red over a working header (calibrated against the
    // real artifact on this suite's first run, where exactly that happened).
    const s1 = await scroller()
    const groupTh = page.locator('thead tr').nth(0).locator('th').nth(2) // 0=#, 1=Tag/Descriptor, 2=first stage-group band
    const groupBox = await groupTh.boundingBox()
    check(!!groupBox && groupBox.y >= s1.top - 1 && groupBox.y <= s1.top + 2,
      `the stage-group band holds the scroller top after scrolling (band y=${Math.round(groupBox?.y ?? NaN)}, scroller top=${Math.round(s1.top)})`)

    // Row 2 seams at +24px — a wrong offset lets the label row slide under row 1.
    const labelTh = page.locator('thead tr').nth(1).locator('th[title]').first()
    const labelBox = await labelTh.boundingBox()
    check(!!labelBox && Math.abs(labelBox.y - (s1.top + 24)) <= 3,
      `the rotated-label row holds its 24px seam under row 1 (y=${Math.round(labelBox?.y ?? NaN)}, expected ≈${Math.round(s1.top + 24)})`)

    // ── BOTH AXES: horizontal scroll on top; the corner keeps left AND top pins.
    const corner = page.getByRole('columnheader', { name: 'Tag / Descriptor' })
    const cornerBefore = await corner.boundingBox()
    await page.evaluate(() => {
      const el = document.querySelector('thead').closest('.overflow-auto')
      el.scrollLeft = 600
    })
    const hArrived = await waitUntil(async () => {
      const s = await scroller()
      return s && s.scrollLeft >= 500 ? s : null
    }, { timeout: 8000, what: 'the matrix to report scrollLeft ≥ 500' })
    check(!!hArrived, `the horizontal scroll landed (scrollLeft ${hArrived?.scrollLeft ?? 'never'})`)
    const cornerAfter = await corner.boundingBox()
    check(!!cornerBefore && !!cornerAfter &&
          Math.abs(cornerAfter.x - cornerBefore.x) <= 2 && cornerAfter.y >= s1.top - 2,
      `the Tag/Descriptor corner holds both pins under a diagonal scroll ` +
      `(x ${Math.round(cornerBefore?.x ?? NaN)} → ${Math.round(cornerAfter?.x ?? NaN)}, y=${Math.round(cornerAfter?.y ?? NaN)})`)
  }
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await browser.close()
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. The header holds; the matrix scrolls under it.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
