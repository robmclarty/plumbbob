import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, phase, readSidecar, runCli, sidecarExists } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function git(dir: string, args: ReadonlyArray<string>): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}
function write(dir: string, rel: string, content: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
function read(dir: string, rel: string): string {
  return readFileSync(join(dir, rel), 'utf8')
}
function fileExists(dir: string, rel: string): boolean {
  return existsSync(join(dir, rel))
}
function writeIntent(dir: string, stepsBody: string): void {
  writeFileSync(join(dir, '.plumbbob', 'intent.md'), `# Fix\n\n## Steps\n\n${stepsBody}\n`)
}
function setCheck(dir: string, command: string): void {
  writeFileSync(join(dir, '.plumbbob', 'config'), `check=${command}\n`)
}
// A started session with a real one-step intent and a stub check command.
function startedSession(options: { seam: string; check?: string } = { seam: '`src/`' }): string {
  const dir = makeFixtureRepo()
  runCli(dir, ['start', 'Fixing things'])
  writeIntent(dir, `1. [ ] Do the thing — **done when:** ok\n   - seam: ${options.seam}`)
  setCheck(dir, options.check ?? 'true')
  return dir
}

describe('plumbbob build', () => {
  it('writes the normalized SEAM + STEP and enters BUILD', () => {
    const dir = startedSession({ seam: '`src/a.ts`, `notes/`' })
    const result = runCli(dir, ['build', '1'])
    expect(result.status).toBe(0)
    expect(readSidecar(dir, 'SEAM')).toBe('src/a.ts\nnotes/\n')
    expect(readSidecar(dir, 'STEP').trim()).toBe('1')
    expect(phase(dir)).toBe('BUILD')
  })

  it('refuses a step whose seam is a glob, leaving DESIGN intact', () => {
    const dir = startedSession({ seam: '`src/*.ts`' })
    const result = runCli(dir, ['build', '1'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('glob')
    expect(sidecarExists(dir, 'SEAM')).toBe(false)
    expect(phase(dir)).toBe('DESIGN')
  })
})

describe('plumbbob revert', () => {
  it('resets --hard to baseline and removes untracked files under SEAM only', () => {
    const dir = makeFixtureRepo()
    write(dir, 'src/thing.ts', 'export const thing = 0\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'add thing'])
    runCli(dir, ['start', 'Reverting'])
    writeIntent(dir, '1. [ ] Edit — **done when:** ok\n   - seam: `src/`')
    setCheck(dir, 'true')
    runCli(dir, ['build', '1'])

    write(dir, 'src/thing.ts', 'export const thing = 999\n') // tracked change
    write(dir, 'src/extra.ts', 'export const extra = 1\n') // untracked, in seam
    write(dir, 'outside.txt', 'keep me\n') // untracked, out of seam

    const result = runCli(dir, ['revert'])
    expect(result.status).toBe(0)
    expect(read(dir, 'src/thing.ts')).toBe('export const thing = 0\n') // tracked change discarded
    expect(fileExists(dir, 'src/extra.ts')).toBe(false) // untracked-in-seam removed
    expect(fileExists(dir, 'outside.txt')).toBe(true) // untracked-out-of-seam kept
    expect(phase(dir)).toBe('DESIGN')
    expect(sidecarExists(dir, 'SEAM')).toBe(false)
  })

  it('PINNED (C4): mid-step park lines survive a revert', () => {
    const dir = makeFixtureRepo()
    write(dir, 'src/thing.ts', 'export const thing = 0\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'add thing'])
    runCli(dir, ['start', 'Reverting'])
    writeIntent(dir, '1. [ ] Edit — **done when:** ok\n   - seam: `src/`')
    setCheck(dir, 'true')
    runCli(dir, ['build', '1'])

    runCli(dir, ['park', 'survive me'])
    write(dir, 'src/half.ts', 'half done\n') // untracked-in-seam, will be discarded

    expect(runCli(dir, ['revert']).status).toBe(0)
    expect(readSidecar(dir, 'build-log.md')).toContain('- [ ] survive me')
    expect(fileExists(dir, 'src/half.ts')).toBe(false)
    expect(phase(dir)).toBe('DESIGN')
  })

  it("preserves plumbbob's own installed skills across the reset, but reverts other files", () => {
    const dir = makeFixtureRepo()
    write(dir, 'src/thing.ts', 'export const thing = 0\n')
    write(dir, '.claude/skills/pb-revert/SKILL.md', 'name: pb-revert\noriginal\n') // a plumbbob driver
    write(dir, '.claude/skills/mine/SKILL.md', 'name: mine\noriginal\n') // a user-authored skill
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'add thing + installed skills'])
    runCli(dir, ['start', 'Reverting'])
    writeIntent(dir, '1. [ ] Edit — **done when:** ok\n   - seam: `src/`')
    setCheck(dir, 'true')
    runCli(dir, ['build', '1'])

    write(dir, 'src/thing.ts', 'export const thing = 999\n') // in-seam work
    write(dir, '.claude/skills/pb-revert/SKILL.md', 'name: pb-revert\nupgraded\n') // e.g. a `pnpm up plumbbob` re-setup
    write(dir, '.claude/skills/mine/SKILL.md', 'name: mine\nedited\n') // out-of-seam, NOT plumbbob's

    expect(runCli(dir, ['revert']).status).toBe(0)
    expect(read(dir, 'src/thing.ts')).toBe('export const thing = 0\n') // step work discarded
    expect(read(dir, '.claude/skills/pb-revert/SKILL.md')).toBe('name: pb-revert\nupgraded\n') // plumbbob's own file kept
    expect(read(dir, '.claude/skills/mine/SKILL.md')).toBe('name: mine\noriginal\n') // user's file follows the reset
  })

  it('reverts --to a recorded step checkpoint', () => {
    const dir = startedSession({ seam: '`src/`', check: 'true' })
    runCli(dir, ['build', '1'])
    write(dir, 'src/a.ts', 'export const a = 1\n')
    runCli(dir, ['checkpoint']) // checkpoint step 1 (v2 tick)
    // a second round of uncommitted work
    runCli(dir, ['build', '1'])
    write(dir, 'src/a.ts', 'export const a = 2\n')

    const result = runCli(dir, ['revert', '--to', '1'])
    expect(result.status).toBe(0)
    expect(read(dir, 'src/a.ts')).toBe('export const a = 1\n')
    expect(phase(dir)).toBe('DESIGN')
  })
})
