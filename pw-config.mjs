// Shared config for the Playwright scripts.
//
// HARD RULE: automated tests run ONLY against the dedicated test project. They create and
// destroy checklist instances, findings and responses, and a finding is an audit-trail
// record — that must never happen inside a real client project. (It did once, on Parkdale
// Chiller; hence this file.)

/** The only project Playwright is allowed to touch. */
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
  try {
    await target.first().waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    throw new Error(
      `Refusing to run: "${TEST_PROJECT}" did not appear in the projects list within 15s. ` +
      `Either it does not exist, or this account cannot see it. Playwright must never ` +
      `run against a real project, so this stops here either way.`,
    )
  }
  await target.first().click()
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
