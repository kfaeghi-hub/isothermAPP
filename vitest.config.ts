import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // happy-dom gives us localStorage + window, which the outbox depends on.
    environment: 'happy-dom',
    // `api/` JOINED THE UNIT SUITE 2026-08-12. It had been unreachable: the
    // include was src-only, so a test written beside a serverless module was
    // silently never run — which is the same shape as a gate that reports a pass
    // on a corpus that was not there. The extraction boundary is a pure function
    // over a parsed payload and is exactly the kind of thing that belongs here.
    // Harness modules at the repo root are testable too — the transient guard is a
    // pure classifier and is exactly the kind of thing that must be proven by
    // injection rather than by having never fired.
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', '*.test.ts'],
  },
})
