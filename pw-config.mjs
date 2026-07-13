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

export const BASE_URL = process.env.PW_BASE_URL ?? 'http://localhost:5173'

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

/** Log in and land on the Projects list. */
export async function login(page) {
  const { email, password } = credentials()
  await page.goto(BASE_URL)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(3000)
}

/**
 * Open the test project — and refuse to proceed against anything else.
 * The guard is the point: a stale selector must fail loudly, not quietly start
 * writing test data into a client's commissioning record.
 */
export async function openTestProject(page) {
  const target = page.getByText(TEST_PROJECT, { exact: false })
  if (await target.count() === 0) {
    throw new Error(
      `Refusing to run: the test project "${TEST_PROJECT}" was not found.\n` +
      `Playwright must never run against a real project. Create the test project first.`,
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
