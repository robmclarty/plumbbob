import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // eval-helpers.test.ts drives the built plugin (dist/cli.js). CI runs
    // `pnpm check` before `pnpm build`, so this setup builds dist once when it's
    // absent — the gate no longer depends on a stale dist being left behind.
    globalSetup: ['./test/global-setup.ts'],
    // The eval tier drives real (money-burning) claude sessions and reports
    // pass RATES, not booleans — it must be structurally unrunnable by
    // `pnpm test`. Its files are *.eval.ts (never matched by the include
    // above); this exclude is defense in depth. Run it via `pnpm eval:*`.
    exclude: ['**/node_modules/**', 'test/evals/**'],
    // The integration/e2e tests spawn real subprocesses (the CLI, checkride, git);
    // under full-suite parallel load they blow the 5s default even when green —
    // doctor's checkride-table tests and the e2e drive pass alone but flaked the
    // gate. Headroom, not a license for slow unit tests.
    testTimeout: 20000,
  },
})
