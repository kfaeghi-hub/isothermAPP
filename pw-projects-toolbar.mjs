// pw-projects-toolbar — "+ New Project" is reachable at desktop-narrow widths.
// [RIVET] 2026-08-14, T1 of the first maintenance triage.
//
// THE DEFECT THIS PINS: the /projects toolbar was flex-wrap below lg and
// flex-nowrap at lg+, inside a page root that is overflow-hidden. With the
// firm's three classification filters plus the client filter, the row's
// natural width was ~1700px — so the "+ New Project" button (last child,
// ml-auto) was CLIPPED at every viewport width from 1024 to 1600px, with no
// scrollbar and no wrap. Below 1024 the phone wrap saved it; the failure band
// was exactly desktop-narrow. Measured pre-fix: button x=1587 at every width
// in the band.
//
// The ruled fix: the filter group is a real shrinkable flex child
// (flex-1 min-w-0 basis-0 flex-wrap) so filters wrap internally; tabs, search
// and the button hold row one. The ruling names the legs: 1280px and 1024px,
// the band's edge.
//
// Honesty note: the overflow was data-dependent (filter option labels widen
// the selects). The no-overflow leg is meaningful while the firm config
// carries its three surfaced filter dimensions; if those were ever emptied the
// leg would pass trivially — stated here rather than discovered.
//
// Read-only: navigates and measures as the admin (the button is owner-gated).
// It writes nothing and seeds nothing.
import { chromium } from '@playwright/test'
import { BASE_URL, adminCredentials, loginAs, waitUntil } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-projects-toolbar')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 900 })
  await loginAs(page, adminCredentials())

  await page.goto(`${BASE_URL}/projects`)
  const btn = page.getByRole('button', { name: '+ New Project' })
  const rendered = await waitUntil(async () => await btn.count() > 0 ? btn : null,
    { timeout: 15000, what: 'the projects toolbar to render the + New Project button' })
  check(!!rendered, 'the projects page rendered with the toolbar button in the DOM')

  for (const w of [1280, 1024]) {
    await page.setViewportSize({ width: w, height: 900 })
    // ── the claim, bounded: the button's box settles fully inside the viewport.
    const inView = await waitUntil(async () => {
      const box = await btn.first().boundingBox()
      return box && box.x >= 0 && box.x + box.width <= w ? box : null
    }, { timeout: 8000, what: `the + New Project button inside the ${w}px viewport` })
    check(!!inView,
      `${w}px: "+ New Project" sits fully inside the viewport` +
      (inView ? ` (x=${Math.round(inView.x)}, right edge ${Math.round(w - inView.x - inView.width)}px in)` : ' — it never did'))

    // ── the mechanism: the toolbar itself no longer overflows horizontally.
    const overflow = await page.evaluate(() => {
      // The toolbar is the search input's flex-shrink-0 ancestor — anchored to
      // a real landmark, not a class guess that could match another band.
      const bar = document.querySelector('input[placeholder^="Search name"]')?.closest('.flex-shrink-0')
      return bar ? bar.scrollWidth - bar.clientWidth : null
    })
    check(overflow !== null && overflow <= 0,
      `${w}px: the toolbar's content fits its box (overflow ${overflow}px) — pre-fix this read ~${1700 - w}px`)
  }
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await browser.close()
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. The toolbar wraps; the button holds the row.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
