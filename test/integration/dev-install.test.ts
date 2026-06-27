import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupTempRepos, makeTempDir } from '../helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

const SCRIPT = fileURLToPath(new URL('../../scripts/dev-install.sh', import.meta.url))

// Run dev-install.sh with `pnpm` and `node` shadowed by PATH stubs that only log
// their args. This smoke-tests the script's ORCHESTRATION (the build/link/init
// wiring and the --uninstall branch) without a real build, a global pnpm link, or
// touching ~/.claude. The actual `plumbbob init` symlink behavior is covered
// separately by test/integration/init.test.ts.
function runDevInstall(args: ReadonlyArray<string>): { status: number; log: string } {
  const stubDir = makeTempDir()
  const home = makeTempDir()
  const logPath = join(makeTempDir(), 'calls.log')
  for (const bin of ['pnpm', 'node']) {
    const stub = join(stubDir, bin)
    writeFileSync(stub, `#!/bin/sh\necho "${bin} $*" >> "${logPath}"\n`)
    chmodSync(stub, 0o755)
  }
  const result = spawnSync('sh', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}`, HOME: home },
  })
  return { status: result.status ?? -1, log: existsSync(logPath) ? readFileSync(logPath, 'utf8') : '' }
}

describe('dev-install.sh (orchestration, commands stubbed)', () => {
  it('builds, links the bin, and runs plumbbob init', () => {
    const { status, log } = runDevInstall([])
    expect(status).toBe(0)
    expect(log).toContain('pnpm build')
    expect(log).toContain('pnpm link --global')
    expect(log).toMatch(/node .*cli\.ts init$/m)
  })

  it('--uninstall reverses the plugin link and the global bin', () => {
    const { status, log } = runDevInstall(['--uninstall'])
    expect(status).toBe(0)
    expect(log).toMatch(/node .*cli\.ts init --uninstall/m)
    expect(log).toContain('pnpm uninstall --global plumbbob')
  })
})
