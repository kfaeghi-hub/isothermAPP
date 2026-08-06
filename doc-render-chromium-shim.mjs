// LOCAL-ONLY shim for @sparticuz/chromium-min, used by doc-render-local.
// The real package downloads a LINUX Lambda pack; on Windows it asserts
// "protocol mismatch" and never launches. Aliased at bundle time so the
// generators themselves stay untouched.
//
// NAMED SEAM: local PDFs render in Playwright's Chromium, not Lambda's. That is
// fine for the question this harness asks — colour lives in the HTML the
// generator built, and the DOCX leg (which is what the sweep actually greps)
// never touches a browser at all. It is NOT fine for any question about
// pagination, font fallback, or PDF byte output. Do not reuse this shim for one.
import { chromium } from 'playwright'
export default {
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  async executablePath() { return chromium.executablePath() },
}
