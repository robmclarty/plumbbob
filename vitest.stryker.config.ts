// The vitest config the `mutation` slot runs under. Two deviations from the
// real config, both forced by Stryker, both narrow.
//
// 1. `isolate: false`. Stryker's vitest runner hands the worker a global
//    namespace and reads mutant coverage back out of it, so every test file has
//    to run in the SAME environment. It used to guarantee that with
//    `poolOptions.threads.singleThread`, which vitest 4 removed (the runner
//    still sets it, and every run logs the deprecation). Nothing replaced it, so
//    the runner silently inherits vitest 4's default `isolate: true`, each file
//    gets a fresh environment, the namespace never arrives, and the initial test
//    run hangs with the event loop idle instead of failing.
//
// 2. `src/__tests__/cli-core.test.ts` is excluded. `isolate: false` puts all 47
//    files in one process, and that file deadlocks against the three that import
//    `checkpoint.ts` (agent, checkpoint, revert). Measured, not guessed: each of
//    the four passes alone, `src/lib` + `test/` (31 files) passes, `src/**` (29)
//    hangs, and pairing cli-core with each verb test in turn hangs on exactly
//    those three and no others. Sampling the stuck worker shows the main thread
//    parked in `uv_run` -> `uv__io_poll` -> `kevent`: an idle event loop waiting
//    on an IPC message that never comes, not plumbbob code blocking. Dropping
//    this one file clears all three pairs and the suite mutates in ~3 minutes.
//
// Neither belongs in vitest.config.ts. `isolate: false` would put the whole
// suite in one process for `pnpm test` too, and these tests chdir, write temp
// repos, and capture io; cli-core.test.ts must keep running there, since it is
// the dispatcher's only coverage. `pnpm test` keeps both.
//
// stryker.config.mjs drops `src/cli-core.ts` from `mutate` to match: with its
// test excluded, mutating it would report unkillable mutants as survivors and
// quietly understate the score. Not measured beats measured wrong.
//
// Revisit when the runner speaks vitest 4's pool API. If `isolate: true` works
// again, the exclusion goes too, since it is a consequence of the shared
// process rather than a fault in the test. Until then it stays: re-tested with
// the exclusion removed on 2026-08-12, all 47 files, and the dry run timed out
// exactly as before. Do not drop it speculatively, and re-test it the same way
// (remove the line, `pnpm exec stryker run`, watch for "Initial test run timed
// out") rather than reasoning about whether it is still needed.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'test/evals/**', 'src/__tests__/cli-core.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 20000,
    isolate: false,
  },
})
