// `plumbbob doctor` — the sidecar-migration half (the plugin-link half is covered by
// the subprocess suite in test/integration/doctor.test.ts, which pins HOME). These
// tests build a pre-restructure LEGACY flat sidecar in a throwaway repo (D14/C6) and
// assert the move into the tracked builds/ layout: archive + active session become
// build folders, config becomes settings.json, and the result is STAGED but never
// committed (Q8), losing nothing on the way (C4).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { doctor, inspectLegacy, migrateSidecar } from '../doctor.ts'
import { buildDir, intentPath } from '../../lib/sidecar.ts'
import { localSetting, settingsPath } from '../../lib/settings.ts'
import { headSha } from '../../lib/git.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function git(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function staged(dir: string): ReadonlyArray<string> {
  const out = git(dir, ['diff', '--cached', '--name-only'])
  return out.length === 0 ? [] : out.split('\n')
}

// A repo carrying the legacy flat sidecar: a flat active session, two archived builds,
// a `config`, and the blanket `.plumbbob/` exclude the old layout wrote.
function legacyRepo(): string {
  const dir = makeTempRepo()
  const sc = join(dir, '.plumbbob')
  mkdirSync(sc, { recursive: true })
  writeFileSync(join(sc, 'config'), 'check=pnpm run check\n')
  writeFileSync(join(sc, 'STATE'), 'active\n')
  writeFileSync(join(sc, 'intent.md'), '# My Legacy Build\n\n## Steps\n\n1. [ ] Do it.\n')
  writeFileSync(join(sc, 'build-log.md'), '- parked: keep me\n')
  writeFileSync(join(sc, 'checkpoints'), `baseline ${headSha(dir)}\n`)
  writeFileSync(join(sc, 'STEP'), '1\n')
  mkdirSync(join(sc, 'archive', 'old-one'), { recursive: true })
  writeFileSync(join(sc, 'archive', 'old-one', 'report.md'), '# done long ago\n')
  mkdirSync(join(sc, 'archive', 'old-two'), { recursive: true })
  writeFileSync(join(sc, 'archive', 'old-two', 'intent.md'), '# old two\n')
  writeFileSync(join(dir, '.git', 'info', 'exclude'), '.plumbbob/\n')
  return dir
}

describe('doctor — legacy detection', () => {
  it('detects a legacy flat sidecar and reports its parts', () => {
    const legacy = inspectLegacy(legacyRepo())
    expect(legacy).not.toBeNull()
    expect(legacy?.session).toBe(true)
    expect(legacy?.config).toBe(true)
    expect(legacy?.archive).toEqual(['old-one', 'old-two'])
  })

  it('returns null for an already-migrated (builds/ + settings.json) layout', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'x'), { recursive: true })
    writeFileSync(settingsPath(dir), '{}\n')
    expect(inspectLegacy(dir)).toBeNull()
  })

  it('returns null for a --local layout (flat intent.md but settings.json present, no config)', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(join(dir, '.plumbbob', 'intent.md'), '# local\n')
    writeFileSync(settingsPath(dir), '{"check":"true"}\n')
    expect(inspectLegacy(dir)).toBeNull()
  })

  it('returns null when there is no sidecar at all', () => {
    expect(inspectLegacy(makeTempRepo())).toBeNull()
  })
})

describe('doctor — migration', () => {
  it('moves the active session into builds/<slug> and points the cursor at it', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(existsSync(intentPath(dir, 'my-legacy-build'))).toBe(true)
    expect(readFileSync(intentPath(dir, 'my-legacy-build'), 'utf8')).toContain('My Legacy Build')
    expect(localSetting(dir, 'activeBuild')).toBe('my-legacy-build')
  })

  it('moves archive entries into builds/ (done: not the cursor) and removes archive/', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(existsSync(join(buildDir(dir, 'old-one'), 'report.md'))).toBe(true)
    expect(readFileSync(join(buildDir(dir, 'old-one'), 'report.md'), 'utf8')).toContain('done long ago')
    expect(existsSync(join(buildDir(dir, 'old-two'), 'intent.md'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'archive'))).toBe(false)
  })

  it('turns config into settings.json carrying the check, and deletes config', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(existsSync(join(dir, '.plumbbob', 'config'))).toBe(false)
    const settings = JSON.parse(readFileSync(settingsPath(dir), 'utf8')) as { check?: string }
    expect(settings.check).toBe('pnpm run check')
  })

  it('stages the moved artifacts but never commits (Q8)', () => {
    const dir = legacyRepo()
    const before = headSha(dir)
    migrateSidecar(dir)
    expect(headSha(dir)).toBe(before) // no commit made
    const files = staged(dir)
    expect(files).toContain('.plumbbob/builds/my-legacy-build/intent.md')
    expect(files).toContain('.plumbbob/settings.json')
    expect(files).toContain('.plumbbob/builds/old-one/report.md')
    // control files stay excluded → never staged
    expect(files.some((f) => f.endsWith('/STEP'))).toBe(false)
    expect(files).not.toContain('.plumbbob/settings.local.json')
  })

  it('preserves park lines through the move (C4 — never destroy)', () => {
    const dir = legacyRepo()
    migrateSidecar(dir)
    expect(readFileSync(join(buildDir(dir, 'my-legacy-build'), 'build-log.md'), 'utf8')).toContain('keep me')
  })
})

describe('doctor — the verb', () => {
  it('offers the migration and exits 1 when a legacy sidecar is present', async () => {
    const { code, stdout } = await captureIoAsync(() => doctor(legacyRepo(), []))
    expect(code).toBe(1)
    expect(stdout).toContain('legacy flat sidecar')
    expect(stdout).toContain('plumbbob doctor --migrate')
  })

  it('performs the move under --migrate and reports what it did', async () => {
    const dir = legacyRepo()
    const { stdout } = await captureIoAsync(() => doctor(dir, ['--migrate']))
    expect(stdout).toContain('migrated')
    expect(existsSync(intentPath(dir, 'my-legacy-build'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'archive'))).toBe(false)
  })

  it('says nothing about the sidecar when the repo is not legacy', async () => {
    const { stdout } = await captureIoAsync(() => doctor(makeTempRepo(), []))
    expect(stdout).not.toContain('legacy flat sidecar')
  })

  // D32 — the check-gate section.
  it('names a configured `check` setting as the gate and asks nothing more', async () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    const { stdout } = await captureIoAsync(() => doctor(dir, []))
    expect(stdout).toContain('check gate')
    expect(stdout).toContain(`gate: 'true' — the "check" setting overrides checkride`)
    expect(stdout).not.toContain('○ types') // no slot table on the override path
  })

  it("prints checkride's slot/adapter table when checkride is the gate", async () => {
    const { stdout } = await captureIoAsync(() => doctor(makeTempRepo(), []))
    expect(stdout).toContain('check gate')
    expect(stdout).toContain('types') // an empty slot row from checkride's doctor
  })
})
