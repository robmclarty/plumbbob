// `plumbbob setup`, in-process: it readies a repo for its first build by adding
// only what is missing (the sidecar folder, an empty settings.json, the
// control-file excludes), and a second run adds nothing. The refusals, the
// `--local` clone, and the advisories for what setup cannot fix are pinned
// here too.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { setup } from '../setup.ts'
import { start } from '../start.ts'
import { gitPath } from '../../lib/git.ts'
import { advisory, ending, transition } from '../../lib/notice.ts'
import { settingsPath } from '../../lib/settings.ts'
import { excludeSidecar, hasSession, sidecarDir, unignoredControl } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function excludeFile(dir: string): string {
  return readFileSync(gitPath(dir, 'info/exclude'), 'utf8')
}

function git(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

describe('setup', () => {
  it('adds the folder, an empty settings.json, and every control exclude to a fresh repo', () => {
    const dir = makeTempRepo()
    const { code, stdout, stderr } = captureIo(() => setup(dir))
    expect(code).toBe(0)
    expect(stderr).toBe('')
    expect(existsSync(sidecarDir(dir))).toBe(true)
    expect(readFileSync(settingsPath(dir), 'utf8')).toBe('{}\n')
    expect(unignoredControl(dir)).toEqual([])
    for (const file of ['.plumbbob/STATE', '.plumbbob/TURN', '.plumbbob/PROMPT', '.plumbbob/RELAY', '.check/']) {
      expect(excludeFile(dir)).toContain(`${file}\n`)
    }
    expect(stdout).toBe(
      ending({
        lead: transition({
          label: 'Setup',
          fact: 'ready to plan',
          detail: ['added .plumbbob/', 'settings.json', '16 control excludes'],
          remedy: '/plumbbob:plan frames the first build',
        }),
      }),
    )
  })

  it('fits its lead line in 80 columns whole, nothing collapsed to a count', () => {
    const { stdout } = captureIo(() => setup(makeTempRepo()))
    const lead = stdout.split('\n')[0] ?? ''
    expect([...lead].length).toBeLessThanOrEqual(80)
    expect(lead).not.toContain('other')
  })

  it('adds nothing on a second run, and says so', () => {
    const dir = makeTempRepo()
    captureIo(() => setup(dir))
    const before = excludeFile(dir)
    const { code, stdout } = captureIo(() => setup(dir))
    expect(code).toBe(0)
    expect(excludeFile(dir)).toBe(before)
    expect(stdout).toBe(
      ending({
        lead: transition({
          label: 'Setup',
          fact: 'already in place, nothing added',
          remedy: '/plumbbob:plan frames the first build',
        }),
      }),
    )
  })

  it('never touches a settings.json that already exists', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), '{ "check": "npm test" }\n')
    const { stdout } = captureIo(() => setup(dir))
    expect(readFileSync(settingsPath(dir), 'utf8')).toBe('{ "check": "npm test" }\n')
    expect(stdout).toContain('(added 16 control excludes)')
  })

  it('adds only the exclude lines that are missing, leaving foreign lines alone', () => {
    const dir = makeTempRepo()
    writeFileSync(gitPath(dir, 'info/exclude'), 'secrets.txt\n.plumbbob/STATE\n.plumbbob/TURN\n')
    const { stdout } = captureIo(() => setup(dir))
    expect(stdout).toContain('14 control excludes')
    const lines = excludeFile(dir).split('\n')
    expect(lines.filter((line) => line === '.plumbbob/STATE')).toHaveLength(1)
    expect(lines[0]).toBe('secrets.txt')
  })

  it('keeps a local clone local: no narrow lines under the blanket one', () => {
    const dir = makeTempRepo()
    excludeSidecar(dir)
    const before = excludeFile(dir)
    const { code, stdout } = captureIo(() => setup(dir))
    expect(code).toBe(0)
    expect(excludeFile(dir)).toBe(before)
    expect(stdout).toContain('.plumbbob/ kept local in this clone')
    expect(stdout).not.toContain('gitignores')
  })

  it('leaves the tree clean enough for start to open the first build', async () => {
    const dir = makeTempRepo()
    captureIo(() => setup(dir))
    const { code } = await captureIoAsync(() => start(dir, ['first build']))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(true)
  })

  it('sets up a repo with no commits, and says start still needs one', () => {
    const dir = makeTempRepo({ commit: false })
    const { code, stdout } = captureIo(() => setup(dir))
    expect(code).toBe(0)
    expect(existsSync(settingsPath(dir))).toBe(true)
    expect(stdout).toContain(
      advisory({ fact: 'this repository has no commits yet', remedy: 'make an initial commit, so start can record a baseline' }),
    )
  })

  it('names a control file git still sees, which an exclude line cannot cover', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(join(sidecarDir(dir), 'TURN'), '3\n')
    git(dir, ['add', '.plumbbob/TURN'])
    git(dir, ['commit', '-q', '-m', 'tracked by mistake'])
    const { code, stdout } = captureIo(() => setup(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('Git still sees 1 control file ⚠ (.plumbbob/TURN)')
    expect(stdout).toContain('→ untrack each with git rm --cached')
  })

  it('warns when the repo ignores .plumbbob/ whole by its own rules', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, '.gitignore'), '.plumbbob/\n')
    const { stdout } = captureIo(() => setup(dir))
    expect(stdout).toContain('This repo gitignores .plumbbob/ ⚠')
  })

  it('refuses outside a git repo, writing nothing', () => {
    const dir = makeTempDir()
    const { code, stdout, stderr } = captureIo(() => setup(dir))
    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('plumbbob: not a git repository')
    expect(existsSync(sidecarDir(dir))).toBe(false)
  })

  it('refuses over a legacy flat sidecar, so the migration still carries its config', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(join(sidecarDir(dir), 'config'), 'check=pnpm run check\n')
    const { code, stderr } = captureIo(() => setup(dir))
    expect(code).toBe(1)
    expect(stderr).toContain('a legacy flat sidecar is here')
    expect(stderr).toContain('plumbbob doctor --migrate')
    expect(existsSync(settingsPath(dir))).toBe(false)
  })
})
