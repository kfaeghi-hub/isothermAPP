// pw-schedule-finder — the schedule-page finder (Update 1.02, item 3).
//
//   node --env-file=.env pw-schedule-finder.mjs           (BARE — no spend)
//   node --env-file=.env pw-schedule-finder.mjs --real-ai (one real sort, ~2c)
//
// Bare in the battery, same reason as pw-extractor and pw-drafter.
//
// WHAT THIS SUITE DOES NOT COVER, said plainly rather than left to be assumed:
// the deterministic text-layer filter itself (src/lib/schedulePages.ts) needs a
// real multi-page drawing set and a browser PDF engine to exercise. There is no
// ZZ-TEST fixture set, and a synthetic PDF would test the synthesiser. That leg
// is a render-and-look step on a real set, and it is named in RELEASES as such.
// A suite that silently omitted it would read as covering it.
//
// The claims here:
//   1. The sorter's contract is minimal ON PURPOSE — terminology only, cheapest
//      viable budget class — and says so.
//   2. The endpoint refuses: not staff, no pages, over the ceiling — and the
//      ceiling refusal NAMES the alternative rather than truncating quietly.
//   3. Law 9: a page with neither text nor an image is refused at the contract.
//   4. A sort failure fails OPEN into the human's hands, never into an extraction.
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { adminCredentials, BASE_URL } from './pw-config.mjs'

const REAL = process.argv.includes('--real-ai')
const fails = []
let passed = 0
const check = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg)
}

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: sess } = await adm.auth.signInWithPassword(adminCredentials())
const token = sess?.session?.access_token

const post = async (body, tok = token) => {
  const r = await fetch(`${BASE_URL}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// ── 1. the contract is minimal on purpose ───────────────────────────────────
const contract = await readFile('firm-knowledge/agents/sorter.md', 'utf8')
const fm = contract.slice(0, contract.indexOf('---', 4))

check(/slices:\s*\[terminology\]/.test(fm),
  'the sorter takes terminology ONLY — identity and style cannot change whether a ' +
  'page is a table, and context that cannot change the answer is cost')
check(/budget_class:\s*extraction/.test(fm),
  'the cheapest viable budget class, per the ruling')
check(/autonomy_tier:\s*1/.test(fm) && /proposal_categories:\s*\[page-sort\]/.test(fm),
  'tier 1, with its own proposal category')
check(/Return shape/.test(contract) && /"is_schedule"/.test(contract),
  'the contract carries its RETURN SHAPE — the drafter shipped without one and ' +
  'every call failed contract-output')
check(/door, window, or room finish schedule/i.test(contract),
  'the contract names the near-misses that matter (door/window/finish schedules ' +
  'are real schedules and the wrong discipline)')

// ── 2. Law 9 at the shape ───────────────────────────────────────────────────
const schemas = await readFile('api/_shared/agent-schemas.ts', 'utf8')
const v = schemas.slice(schemas.indexOf('export const PageSortInput')).slice(0, 500)
check(/text_excerpt/.test(v) && /has_image/.test(v),
  'LAW 9 — PageSortInput requires text OR an image, never neither: an agent asked ' +
  'to judge a page must be GIVEN the page')

// ── 3. the refusals ─────────────────────────────────────────────────────────
const noAuth = await post({ action: 'find-pages', pages: [{ page: 1, text_excerpt: 'x' }] }, null)
check(noAuth.status === 401 || noAuth.status === 403,
  `an unauthenticated sort is refused (${noAuth.status})`)

const empty = await post({ action: 'find-pages', pages: [] })
check(empty.status === 400,
  `an empty page list is refused rather than answered (${empty.status})`)

const over = await post({
  action: 'find-pages',
  pages: Array.from({ length: 60 }, (_, i) => ({ page: i + 1, text_excerpt: 'PUMP SCHEDULE' })),
})
check(over.status === 413,
  `over the ceiling is refused (${over.status})`)
check(/ceiling/i.test(over.body.error ?? '') && /drag/i.test(over.body.error ?? ''),
  'the ceiling refusal NAMES the alternative — a silent truncation would read as ' +
  '"we looked at your whole set"')

// LAW 9 REACHING THE RUNTIME, not just the type. A page with neither text nor an
// image must be refused BEFORE a token is spent.
const naked = await post({ action: 'find-pages', pages: [{ page: 1 }] })
check(naked.status === 200 && Array.isArray(naked.body.sorted) && naked.body.sorted.length === 0,
  `a page with no text and no image yields NO sort rather than a guess ` +
  `(${naked.status}, failure: ${naked.body.failure ?? 'none'})`)
check(naked.body.failure === 'contract-input',
  `and it is refused at the CONTRACT boundary, before any spend (${naked.body.failure})`)

// ── 4. fail open, into the human's hands ────────────────────────────────────
check(naked.status === 200,
  'a failed sort returns 200 with the pages undecided — it fails OPEN into the ' +
  'confirmation screen, never into an extraction and never into silence')

if (REAL) {
  const real = await post({
    action: 'find-pages',
    pages: [
      { page: 41, text_excerpt: 'PUMP SCHEDULE — MARK, SERVICE, GPM, HEAD (FT), HP, RPM, MANUFACTURER, MODEL, REMARKS. P-1 HEATING 120 45 3 1750 ARMSTRONG 4380. P-2 HEATING 120 45 3 1750 ARMSTRONG 4380.' },
      { page: 42, text_excerpt: 'DOOR SCHEDULE — DOOR NO., ROOM, WIDTH, HEIGHT, MATERIAL, FRAME, HARDWARE SET, FIRE RATING. 101 LOBBY 900 2100 HM HM 3 45MIN.' },
      { page: 43, text_excerpt: 'LEVEL 2 MECHANICAL FLOOR PLAN — SCALE 1:100. KEY PLAN. NORTH.' },
    ],
  })
  check(real.status === 200 && (real.body.sorted ?? []).length === 3,
    `a real sort answers every page it was given (${real.status}, ${real.body.sorted?.length ?? 0}/3)`)

  const by = Object.fromEntries((real.body.sorted ?? []).map(p => [p.page, p]))
  // ARRIVAL FIRST. Every assertion below reads a field off `by[n]`, and all of
  // them would pass vacuously on an empty sort — the pw-drafter lesson, applied
  // rather than relearned.
  if (!by[41] || !by[42] || !by[43]) {
    throw new Error('the sort returned no usable entries — refusing to assert properties of nothing')
  }
  check(by[41].is_schedule === true, `the pump schedule is a schedule (${by[41].reason ?? ''})`.slice(0, 110))
  check(by[42].is_schedule === false,
    `the DOOR schedule is refused — a real schedule, the wrong discipline (${by[42].reason ?? ''})`.slice(0, 130))
  check(by[43].is_schedule === false, `the floor plan is not a schedule (${by[43].reason ?? ''})`.slice(0, 110))
} else {
  console.log('\n  (bare run — the sorting leg needs --real-ai and costs ~2c)')
}

console.log(`\n  ${passed} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1) }
