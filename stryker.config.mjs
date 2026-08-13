// TYPESCRIPT 7 IS BLOCKED HERE. Read this before trying the upgrade again.
//
// TypeScript 7 is the Go port: the `typescript` package ships a native binary
// plus a launcher, and `lib/` holds only tsc.js, getExePath.js and version.cjs.
// The JS compiler API is gone, so `require('typescript').createProgram` is
// undefined. Stryker's TSConfigPreprocessor calls `ts.parseConfigFileTextToJson`
// through `await import('typescript')` to rewrite tsconfig paths for its sandbox,
// and dies about a second in, before instrumentation, before any test runs:
//
//   TypeError: ts.parseConfigFileTextToJson is not a function
//     at TSConfigPreprocessor.rewriteTSConfigFile
//
// Checked on 2026-08-12 against typescript 7.0.2 and @stryker-mutator/core 9.6.1
// (the newest published). Nothing in this repo can fix it: the call is inside
// Stryker, the import is dynamic so no static grep finds it, and the failure is
// upstream of every knob here. It needs a Stryker release that stops using the
// removed API. Re-test by bumping typescript and running `pnpm exec stryker run`;
// if it still throws the line above, put the pin back.
//
// Nothing ELSE in the repo objects to TS 7. Verified the same day: `pnpm check`
// green, emit semantically identical to TS 6 (byte-identical once quote style is
// normalised, same file list), `erasableSyntaxOnly` and `noUncheckedIndexedAccess`
// both still enforced, and no dependency or source file touches the compiler API
// (lint is oxlint, not typescript-eslint; dev runs on Node type-stripping, not
// ts-node). So the pin in package.json exists for this one reason and no other.

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
  incremental: true,
  reporters: ['clear-text', 'progress', 'html', 'json'],
}

export default config
