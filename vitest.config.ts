import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // happy-dom gives us localStorage + window, which the outbox depends on.
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
})
