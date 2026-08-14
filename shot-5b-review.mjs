// shot-5b-review — render-and-look for the widened IntakeReview, against the
// seeded ZZ-5B fixture. Runs on the LOCAL build (vite preview), because the
// point is to look at the change before it ships.
//   npx vite preview --port 4173 &  then:
//   PW_BASE_URL=http://localhost:4173 node --env-file=.env shot-5b-review.mjs
import { chromium } from 'playwright'
import { loginAs, adminCredentials, openTestProject, waitUntil } from './pw-config.mjs'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
try {
  await loginAs(page, adminCredentials())
  await openTestProject(page)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await waitUntil(async () => await page.getByText('zz-5b-review-fixture.xlsx').count() >= 1,
    { timeout: 15000, what: 'the seeded fixture in the staged-uploads list' })
  await page.getByText('zz-5b-review-fixture.xlsx').first().click()
  await waitUntil(async () => await page.getByText('THE READERS ASKED').count() >= 1,
    { timeout: 15000, what: 'the widened review surface' })
  await page.screenshot({ path: 'out/5b-review.png', fullPage: true })
  console.log('shot -> out/5b-review.png')
} catch (e) {
  console.log('FAIL:', e.message)
  await page.screenshot({ path: 'out/5b-review-fail.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
