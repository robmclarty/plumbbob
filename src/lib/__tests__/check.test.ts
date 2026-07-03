import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runCheck } from '../check.ts'
import { sidecarDir } from '../sidecar.ts'
import { settingsPath, localSettingsPath } from '../settings.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Point the check at a shell stub. A real gate would recurse into vitest (D14),
// so these cover the spawn-override path; the checkride path below uses custom
// checks (a bare `node -e` command) so no real tool ever runs.
function writeSettings(root: string, check: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(settingsPath(root), JSON.stringify({ check }))
}

function writeLocalSettings(root: string, check: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(localSettingsPath(root), JSON.stringify({ check }))
}

// A checkride.config.json whose only active check is a custom `node -e` stub —
// built-in slots all skip (no tools in a bare tmp dir), so the stub alone
// decides green/red without spawning any real adapter (D14).
function writeCheckrideStub(root: string, exitCode: number): void {
  const config = {
    checks: { stub: { command: 'node', args: ['-e', `process.exit(${exitCode})`] } },
  }
  writeFileSync(join(root, 'checkride.config.json'), JSON.stringify(config))
}

describe('runCheck (spawn override, D24)', () => {
  it('returns 0 when the settings check passes', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    expect(await runCheck(dir)).toBe(0)
  })

  it('returns non-zero when the settings check fails', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    expect(await runCheck(dir)).toBe(1)
  })

  it('propagates the check command exit code', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'exit 3')
    expect(await runCheck(dir)).toBe(3)
  })

  it('lets settings.local.json override settings.json', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    writeLocalSettings(dir, 'true')
    expect(await runCheck(dir)).toBe(0)
  })

  it('lets the CLI flag override both files', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    writeLocalSettings(dir, 'false')
    expect(await runCheck(dir, {}, 'true')).toBe(0)
  })

  it('warns and ignores narrowing flags — an opaque command has no slots', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    const { code, stderr } = await captureIoAsync(() => runCheck(dir, { bail: true, only: ['types'] }))
    expect(code).toBe(0)
    expect(stderr).toContain('ignored for the configured command')
  })
})

describe('runCheck (checkride, D32)', () => {
  it('returns 0 when the checkride run is green', async () => {
    const dir = makeTempDir()
    writeCheckrideStub(dir, 0)
    const { code } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(0)
  })

  it('returns 1 and names the failing slot with its raw-output pointer', async () => {
    const dir = makeTempDir()
    writeCheckrideStub(dir, 1)
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(1)
    expect(stderr).toContain('failing slots')
    expect(stderr).toContain('stub')
    expect(stderr).toContain('.check/summary.json')
  })

  it('returns 2 when the harness itself breaks (malformed config)', async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'checkride.config.json'), '{not json')
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(2)
    expect(stderr).toContain('the check gate itself failed')
  })

  it('refuses an all-slots-skipped run instead of a vacuous green', async () => {
    const dir = makeTempDir()
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(1)
    expect(stderr).toContain('found nothing to check')
  })

  it('honors narrowing flags — --skip on the stub empties the run into a refusal', async () => {
    const dir = makeTempDir()
    writeCheckrideStub(dir, 1)
    const { code, stderr } = await captureIoAsync(() => runCheck(dir, { skip: ['stub'] }))
    expect(code).toBe(1)
    expect(stderr).toContain('found nothing to check')
  })
})
