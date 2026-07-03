import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { runCheck } from '../check.ts'
import { sidecarDir } from '../sidecar.ts'
import { settingsPath, localSettingsPath } from '../settings.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// Point the check at a shell stub. A real `pnpm run check` would recurse into
// vitest (D14), so the no-settings default path is exercised in settings.test.ts
// (pure resolution) rather than by executing runCheck.
function writeSettings(root: string, check: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(settingsPath(root), JSON.stringify({ check }))
}

function writeLocalSettings(root: string, check: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(localSettingsPath(root), JSON.stringify({ check }))
}

describe('runCheck', () => {
  it('returns 0 when the settings check passes', () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    expect(runCheck(dir)).toBe(0)
  })

  it('returns non-zero when the settings check fails', () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    expect(runCheck(dir)).toBe(1)
  })

  it('propagates the check command exit code', () => {
    const dir = makeTempDir()
    writeSettings(dir, 'exit 3')
    expect(runCheck(dir)).toBe(3)
  })

  it('lets settings.local.json override settings.json', () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    writeLocalSettings(dir, 'true')
    expect(runCheck(dir)).toBe(0)
  })

  it('lets the CLI flag override both files', () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    writeLocalSettings(dir, 'false')
    expect(runCheck(dir, 'true')).toBe(0)
  })
})
