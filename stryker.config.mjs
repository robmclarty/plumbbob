/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  // pnpm's isolated node_modules breaks the default '@stryker-mutator/*'
  // plugin glob inside worker processes; name the runner explicitly.
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/__tests__/**'],
  coverageAnalysis: 'perTest',
  incremental: true,
  reporters: ['clear-text', 'progress', 'html', 'json'],
}

export default config
