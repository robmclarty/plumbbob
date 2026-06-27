import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { runCheck } from '../check.ts'
import { configPath, sidecarDir } from '../sidecar.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// Point the check at a shell stub. A real `pnpm run check` would recurse into
// vitest (D14), so the no-config default path is intentionally not exercised.
function writeCheck(root: string, command: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(configPath(root), `check=${command}\n`)
}

describe('runCheck', () => {
  it('returns 0 when the configured check passes', () => {
    const dir = makeTempDir()
    writeCheck(dir, 'true')
    expect(runCheck(dir)).toBe(0)
  })

  it('returns non-zero when the configured check fails', () => {
    const dir = makeTempDir()
    writeCheck(dir, 'false')
    expect(runCheck(dir)).toBe(1)
  })

  it('propagates the check command exit code', () => {
    const dir = makeTempDir()
    writeCheck(dir, 'exit 3')
    expect(runCheck(dir)).toBe(3)
  })

  it('reads the check= line among other config lines', () => {
    const dir = makeTempDir()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(configPath(dir), 'other=x\ncheck=true\n')
    expect(runCheck(dir)).toBe(0)
  })
})
