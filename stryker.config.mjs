// TypeScript 7 runs here because of `tsconfigFile` below. TypeScript 7 is the Go
// port and ships no JavaScript compiler API, and Stryker rewrites the tsconfig
// chain in its sandbox through that API (`ts.parseConfigFileTextToJson`), so the
// rewrite crashed the run a second in, before any test ran. Stryker skips the
// rewrite when it can't find the file, and the vitest runner never reads a
// tsconfig, so pointing it at a file that doesn't exist is the whole fix. It is
// the one checkride documents in its docs/tools.md.
//
// vitest 5 needs the 10.1.1 runner or later: 10.0.0 filtered tests by name with
// vitest 4's separator, so every mutant ran zero tests and survived, with no
// error to say why (stryker-js #6210).

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  // Not vitest.config.ts: the runner needs `isolate: false`, which the real
  // config must not carry. vitest.stryker.config.ts explains why.
  vitest: { configFile: 'vitest.stryker.config.ts' },
  // pnpm's isolated node_modules breaks the default '@stryker-mutator/*'
  // plugin glob inside worker processes; name the runner explicitly.
  plugins: ['@stryker-mutator/vitest-runner'],
  // `!src/cli-core.ts` pairs with the cli-core.test.ts exclusion in
  // vitest.stryker.config.ts: its test cannot run under the mutation slot, so
  // mutating it would score unkillable mutants as survivors. Not measured beats
  // measured wrong. Both come back together when the exclusion lifts.
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/__tests__/**', '!src/cli-core.ts'],
  coverageAnalysis: 'perTest',
  // The dry run is the whole suite under `perTest` instrumentation, well past
  // vitest's own ~1 minute. 10 gives that real headroom while still failing in
  // reasonable time if the vitest 4 deadlock returns; the default 5 was never the
  // problem, but it was too tight to tell a slow run from a wedged one.
  dryRunTimeoutMinutes: 10,
  // No such file, on purpose: see the note at the top.
  tsconfigFile: 'tsconfig.stryker-skip.json',
  // Only the mutated sources. Stryker 10's default scan also reaches
  // site/index.html, fails to parse it, and warns on every run.
  disableTypeChecks: 'src/**/*.ts',
  incremental: true,
  reporters: ['clear-text', 'progress', 'html', 'json'],
}

export default config
