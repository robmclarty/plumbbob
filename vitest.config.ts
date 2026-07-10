import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The integration/e2e tests spawn real subprocesses (the CLI, checkride, git);
    // under full-suite parallel load they blow the 5s default even when green —
    // doctor's checkride-table tests and the e2e drive pass alone but flaked the
    // gate. Headroom, not a license for slow unit tests.
    testTimeout: 20000,
  },
})
