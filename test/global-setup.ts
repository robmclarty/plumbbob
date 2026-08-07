// The default suite includes eval-tier helper coverage (eval-helpers.test.ts)
// that runs the built plugin's bin shim, which resolves dist/cli.js via
// resolvePluginDir. On a fresh checkout dist/ does not exist yet — CI (and the
// publish gate) run `pnpm check` BEFORE `pnpm build` — so build it once here,
// before any worker imports the plugin helper. This is what makes `pnpm check`
// self-contained on a clean clone instead of silently relying on a stale dist
// left behind by a previous build.
//
// Absent, not stale: we only build when dist/cli.js is missing, so local runs
// (dist already present) stay a no-op existsSync check and pay nothing. The
// eval sweeps guarantee dist a different way — `pnpm eval:*` runs `pnpm build`
// first — and never go through vitest, so this setup does not touch them.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

// Named `setup` (not a default export) so it satisfies the C1 (functional-only) no-default-exports
// rule; vitest's globalSetup honors a named setup export just as it would default.
export function setup(): void {
  if (existsSync(join(REPO_ROOT, 'dist', 'cli.js'))) return
  // Fail closed: a broken build throws here and fails the suite that depends on
  // it, exactly as the dedicated Build step would.
  execFileSync('pnpm', ['build'], { cwd: REPO_ROOT, stdio: 'inherit' })
}
