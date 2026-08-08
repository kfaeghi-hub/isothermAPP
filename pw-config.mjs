// Shared config for the Playwright scripts.
//
// HARD RULE: automated tests run ONLY against the dedicated test project. They create and
// destroy checklist instances, findings and responses, and a finding is an audit-trail
// record — that must never happen inside a real client project. (It did once, on Parkdale
// Chiller; hence this file.)

/** The only project Playwright is allowed to touch. */
import { assertHarnessFree } from './harness-lock.mjs'

// EVERY SUITE IMPORTS THIS FILE, which makes it the one place a harness-wide
// refusal can live — the same reason the ZZ-TEST guard lives here. A suite the
// battery spawned carries the battery's token and proceeds; anything else
// started while a battery is running refuses and names the run holding the lock.
assertHarnessFree(`suite ${process.argv[1]?.split(/[\/]/).pop() ?? 'unknown'}`)

export const TEST_PROJECT = 'ZZ-TEST — Do Not Use'

/** Its equipment fixture. */
export const TEST_EQUIPMENT = 'TEST-HP-1'

// Production is the custom domain (cx.isothermengineering.com); the vercel.app
// URL still works and can be passed via PW_BASE_URL as a fallback.
export const BASE_URL = process.env.PW_BASE_URL ?? 'https://cx.isothermengineering.com'

/** Credentials come from .env (gitignored). Never hardcode them. */
export function credentials() {
  const email = process.env.email
  const password = process.env.password
  if (!email || !password) {
    console.error('Missing `email` / `password`. Run with: node --env-file=.env <script>')
    process.exit(1)
  }
  return { email, password }
}

/** Admin credentials (dev.admin) — used ONLY for privileged seed/cleanup steps
 *  that access control now correctly forbids employees (proposal §6.1). */
export function adminCredentials() {
  const email = process.env.admin_email
  const password = process.env.admin_password
  if (!email || !password) {
    console.error('Missing `admin_email` / `admin_password` in .env.')
    process.exit(1)
  }
  return { email, password }
}

/**
 * Access token for direct api/ endpoint calls (generate-* now require a Bearer
 * JWT — GENERATE-AUTH build, 2026-07-22). Signs in with supabase-js and returns
 * the session access token. Scripts fix themselves, not the endpoint.
 * Env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (already in .env).
 */
export async function apiToken({ email, password }) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data?.session) {
    console.error(`apiToken: sign-in failed for ${email}: ${error?.message ?? 'no session'}`)
    process.exit(1)
  }
  return data.session.access_token
}

/**
 * Mint a signed URL the way the app does (storage privacy pass, 2026-07-24).
 * DB columns store bucket-relative paths; suites that need to fetch a generated
 * document go through the row-anchored endpoint like every other consumer.
 */
export async function signedFileUrl(creds, ref) {
  const token = await apiToken(creds)
  const r = await fetch(`${BASE_URL}/api/get-file-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(ref),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || !body.url) throw new Error(`get-file-url failed (${r.status}): ${body.error ?? ''}`)
  return body.url
}

/** Log in with explicit credentials and land on the home route.
 *  Targets /login — unauthenticated "/" is the public landing page (2026-07-22). */
export async function loginAs(page, { email, password }) {
  await page.goto(`${BASE_URL}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(3000)
}

/** Log in as dev.test (the employee account — verification content runs as this). */
export async function login(page) {
  await loginAs(page, credentials())
}

/**
 * Open the test project — and refuse to proceed against anything else.
 * The guard is the point: a stale selector must fail loudly, not quietly start
 * writing test data into a client's commissioning record.
 */
export async function openTestProject(page) {
  // GO TO THE PROJECTS LIST FIRST. This used to be called from wherever login()
  // happened to land, which was fine while the dashboard's first ZZ-TEST mention
  // was a link to the project. It is not any more: the dashboard now names the
  // test project 72 times — portfolio table cells, attention queue rows, chart
  // labels — and the first visible one is a <td> that does not navigate. The
  // guard then reported "did not land on ZZ-TEST (visible: true, detail: false)",
  // which is true and useless.
  //
  // The refusal message always said "the projects LIST". Now the function looks
  // there, so the message and the behaviour describe the same surface.
  if (!/\/projects(|$)/.test(page.url())) {
    await page.goto(`${BASE_URL}/projects`)
    await page.waitForLoadState('domcontentloaded')
  }

  const target = page.getByText(TEST_PROJECT, { exact: false })

  // WAIT BEFORE JUDGING. This used to be a bare `count() === 0`, an INSTANT
  // check against a list that renders asynchronously — so a slow load failed the
  // guard and reported "the test project was not found. Create the test project
  // first" about a project that plainly exists.
  //
  // It cost two battery reds in three runs, in two different suites, and both
  // times the message sent the investigation somewhere the bug was not. A guard
  // that cries wolf gets explained away, and this one exists to protect client
  // data from test writes.
  //
  // The refusal still stands — absence after a bounded wait is still a refusal —
  // but the two states are now told apart and the message says which happened.
  // AND WAIT FOR A VISIBLE MATCH, NOT THE FIRST MATCH. `.first()` resolves to the
  // first node in DOM order, which on the dashboard is a hidden <span> (no box,
  // visible=false) among 72 matches. Waiting for THAT to become visible times out
  // while the project is plainly on screen — so the guard refused with "either it
  // does not exist, or this account cannot see it" about a project the same page
  // was displaying three times over.
  //
  // It cost nine suites in two consecutive batteries, and the first explanation
  // reached for was concurrency, because that had been the cause the day before.
  // The refusal is NOT weakened: absence after a bounded wait is still a refusal.
  // What changed is that a hidden node can no longer mask the visible ones.
  const visible = await waitUntil(async () => {
    const n = await target.count()
    for (let i = 0; i < n; i++) if (await target.nth(i).isVisible()) return target.nth(i)
    return null
  }, { timeout: 15000, what: `a VISIBLE "${TEST_PROJECT}"` })

  if (!visible) {
    const total = await target.count()
    throw new Error(
      `Refusing to run: "${TEST_PROJECT}" had no VISIBLE match within 15s ` +
      `(${total} match(es) in the DOM, none visible). Either it does not exist, or this ` +
      `account cannot see it. Playwright must never run against a real project, so this ` +
      `stops here either way.`,
    )
  }
  await visible.click()
  await page.waitForTimeout(1800)

  // Belt and braces: the open project detail must show the ZZ-TEST name AND the
  // Checklists tab. If a selector ever goes stale, fail loudly here rather than
  // quietly start writing test data into a client's commissioning record.
  const onTestProject = await page.getByText('ZZ-TEST').count() > 0
  const onProjectDetail = await page.getByRole('button', { name: 'Checklists', exact: true }).count() > 0
  if (!onTestProject || !onProjectDetail) {
    throw new Error(
      `Refusing to run: did not land on "${TEST_PROJECT}" ` +
      `(zz-test visible: ${onTestProject}, project detail: ${onProjectDetail}).`,
    )
  }
}

// ── Bounded condition-waits ─────────────────────────────────────────────────
//
// THE FLAKE CLASS THESE EXIST FOR. A suite acts, then reads:
//
//   await save()
//   const n = await locator.count()      // ← instant. The UI may not have caught up.
//   check(n === 3, '...')
//
// The read cannot tell "not there" from "NOT THERE YET", so it fails whenever the
// machine is slow — and the message blames the feature. It cost four battery reds
// in one week, in four different suites, and every one of them sent the
// investigation somewhere the bug was not.
//
// THE COUSIN IS THE SAME DISEASE FACING THE OTHER WAY. After a delete or a drain:
//
//   await remove()
//   check(await locator.count() === 0, 'gone')   // ← "gone" vs "NOT GONE YET"
//
// Both directions are one predicate that has to become true within a bound. A
// fixed `waitForTimeout` before the read is not a fix — it is a bet on the
// machine's speed, and it slows every green run to pay for the rare slow one.
//
// These do not weaken any assertion. A condition that never becomes true still
// fails, with the same verdict and a better message: what was expected, what was
// last seen, and how long it waited.

/**
 * Poll `fn` until it returns truthy, or the bound expires.
 * Returns the last value — truthy on success, falsy on timeout — so the caller
 * still does its own `check()` and still goes red when the condition never held.
 */
export async function waitUntil(fn, { timeout = 12000, interval = 200, what = 'condition' } = {}) {
  const started = Date.now()
  let last
  for (;;) {
    last = await fn()
    if (last) return last
    if (Date.now() - started > timeout) {
      console.log(`      (waited ${((Date.now() - started) / 1000).toFixed(1)}s for ${what}; last: ${JSON.stringify(last)})`)
      return last
    }
    await new Promise(r => setTimeout(r, interval))
  }
}

/** Wait for a count to satisfy `pred`. Covers appearance AND disappearance —
 *  `n => n === 3` and `n => n === 0` are the same shape. */
export async function waitForCount(read, pred, opts = {}) {
  const out = await waitUntil(async () => {
    const n = await read()
    return pred(n) ? { n } : null
  }, { what: opts.what ?? 'a count', ...opts })
  return out ? out.n : await read()   // on timeout, report what is actually there
}

/** Wait for text to appear on the page (or for a predicate over it to hold). */
export async function waitForText(page, pred, opts = {}) {
  const test = typeof pred === 'string' ? (t => t.includes(pred)) : pred
  return !!(await waitUntil(async () => {
    const t = await page.locator('body').innerText()
    return test(t) ? t : null
  }, { what: opts.what ?? `text ${typeof pred === 'string' ? JSON.stringify(pred) : 'predicate'}`, ...opts }))
}
