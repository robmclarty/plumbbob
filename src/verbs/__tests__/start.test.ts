import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { start } from '../start.ts'
import { activeBuild, buildDir, excludeControl, grantPath, hasSession, sidecarDir, tickPath, turnPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Derived slugs are date-prefixed (local time, matching datedSlug in start.ts).
const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

describe('start', () => {
  it('scaffolds a tracked builds/<slug>/ folder and opens the session on a clean repo', async () => {
    const dir = makeTempRepo()
    const { code, stdout } = await captureIoAsync(() => start(dir, ['My Feature']))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(true)
    const build = join(dir, '.plumbbob', 'builds', `${TODAY}-my-feature`)
    expect(existsSync(join(build, 'intent.md'))).toBe(true)
    expect(existsSync(join(build, 'build-log.md'))).toBe(true)
    expect(readFileSync(join(build, 'checkpoints'), 'utf8')).toMatch(/^baseline [0-9a-f]{40}\n$/)
    expect(stdout).toContain('started "My Feature"')
    expect(stdout).toContain(`.plumbbob/builds/${TODAY}-my-feature/intent.md`)
  })

  it('points the STATE cursor at the new build — D28 (state-cursor)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature']))
    expect(activeBuild(dir)).toBe(`${TODAY}-my-feature`)
  })

  it('narrows info/exclude to the control patterns, tracking the artifact plane', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature']))
    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(exclude).toContain('.plumbbob/settings.local.json')
    expect(exclude).toContain('.plumbbob/builds/*/SEAM')
    expect(exclude).not.toContain('.plumbbob/')
  })

  it('stamps the plan entry TICK from a surviving turn ledger — D64 (approval-latch)', async () => {
    const dir = makeTempRepo()
    // A prior session left the ledger and its excludes behind — TURN is excluded
    // control, so it must not read as the dirty tree `start` refuses on.
    excludeControl(dir)
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(turnPath(dir), '3\n')
    const { code } = await captureIoAsync(() => start(dir, ['My Feature']))
    expect(code).toBe(0)
    expect(readFileSync(tickPath(dir), 'utf8')).toBe('3\n')
  })

  it('stamps no TICK when the ledger is absent — the first-session plan stays guidance-governed', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature']))
    expect(existsSync(tickPath(dir))).toBe(false)
  })

  it('clears a stale GRANT left behind by an earlier session — D65 (human-typed-grants), one-turn lifetime', async () => {
    const dir = makeTempRepo()
    excludeControl(dir)
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(turnPath(dir), '3\n')
    writeFileSync(grantPath(dir), 'auto\n') // an abandoned session's last tick minted this
    const { code } = await captureIoAsync(() => start(dir, ['My Feature']))
    expect(code).toBe(0)
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('warns at plan time when the gate sees no code checks, with the exact fix (research/07 Build 2a)', async () => {
    const dir = makeTempRepo() // bare: no tsconfig, no test runner — only always-on repo checks
    const { code, stderr } = await captureIoAsync(() => start(dir, ['Bare Repo']))
    expect(code).toBe(0) // the warning is guidance, never the exit code
    expect(stderr).toContain('the check gate sees no code checks')
    expect(stderr).toContain('add {"check": "npm test"} to .plumbbob/settings.json')
  })

  it('probes silently when checkride can see the code', async () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'tsconfig.json'), '{}\n')
    execFileSync('git', ['-C', dir, 'add', '-A'])
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'tsconfig'])
    const { code, stderr } = await captureIoAsync(() => start(dir, ['Typed Repo']))
    expect(code).toBe(0)
    expect(stderr).not.toContain('no code checks')
  })

  it('probes silently when a check is already configured (settings.local.json)', async () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(join(sidecarDir(dir), 'settings.local.json'), JSON.stringify({ check: 'true' }))
    excludeControl(dir) // keep the untracked overlay from reading as a dirty tree
    const { code, stderr } = await captureIoAsync(() => start(dir, ['Configured Repo']))
    expect(code).toBe(0)
    expect(stderr).not.toContain('no code checks')
  })

  it('refuses when the derived slug collides with an existing build — D38 (cli-owns-slugs)', async () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, `${TODAY}-my-feature`), { recursive: true }) // a prior build already owns the slug
    const { code, stderr } = await captureIoAsync(() => start(dir, ['My Feature']))
    expect(code).toBe(1)
    expect(stderr).toContain('already exists')
    expect(hasSession(dir)).toBe(false)
  })

  it('honors an explicit --slug over the title', async () => {
    const dir = makeTempRepo()
    const { code } = await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'custom-name']))
    expect(code).toBe(0)
    expect(existsSync(join(dir, '.plumbbob', 'builds', 'custom-name', 'intent.md'))).toBe(true)
    expect(activeBuild(dir)).toBe('custom-name')
  })

  it('refuses when the title yields an empty slug and no --slug is given', async () => {
    const dir = makeTempRepo()
    const { code, stderr } = await captureIoAsync(() => start(dir, ['!!! ???']))
    expect(code).toBe(1)
    expect(stderr).toContain('could not derive a build slug')
    expect(hasSession(dir)).toBe(false)
  })

  it('--local scaffolds the fully-untracked flat layout with no cursor — D26 (build-folders)', async () => {
    const dir = makeTempRepo()
    const { code, stdout } = await captureIoAsync(() => start(dir, ['My Feature', '--local']))
    expect(code).toBe(0)
    expect(existsSync(join(dir, '.plumbbob', 'intent.md'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'builds'))).toBe(false)
    expect(activeBuild(dir)).toBeNull() // STATE present but empty; no builds/ to fall back to
    expect(stdout).toContain('.plumbbob/intent.md')
    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(exclude).toContain('.plumbbob/')
  })

  it('scaffolds an empty settings.json — no check, no auto; absence is the default — D32 (checkride-gate)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature']))
    expect(existsSync(join(dir, '.plumbbob', 'config'))).toBe(false)
    const settings = JSON.parse(readFileSync(join(dir, '.plumbbob', 'settings.json'), 'utf8')) as {
      check?: string
      auto?: boolean
    }
    // No plumbbob-injected opinions in the tracked file: absence of `check` means
    // checkride, absence of `auto` means false. The human owns this file.
    expect(settings).toEqual({})
  })

  it('preserves an existing settings.json — a re-start never clobbers a hand-added check', async () => {
    const dir = makeTempRepo()
    // A prior session left a tracked settings.json carrying the human's custom
    // gate. Commit it so the tree is clean (exactly what a re-start faces); `start`
    // must scaffold write-if-absent, not overwrite it.
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(join(dir, '.plumbbob', 'settings.json'), `${JSON.stringify({ check: 'fascicle run check', auto: true }, null, 2)}\n`)
    execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' })
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'seed settings'], { stdio: 'ignore' })
    await captureIoAsync(() => start(dir, ['My Feature']))
    const settings = JSON.parse(readFileSync(join(dir, '.plumbbob', 'settings.json'), 'utf8')) as {
      check?: string
      auto?: boolean
    }
    expect(settings.check).toBe('fascicle run check')
    expect(settings.auto).toBe(true)
  })

  it('echoes the checkride gate into the scaffolded build-log (documentation only)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature']))
    const log = readFileSync(join(dir, '.plumbbob', 'builds', `${TODAY}-my-feature`, 'build-log.md'), 'utf8')
    expect(log).toContain('checkride')
  })

  it('rejects an empty title', async () => {
    const dir = makeTempRepo()
    const { code, stderr } = await captureIoAsync(() => start(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('needs a title')
    expect(hasSession(dir)).toBe(false)
  })

  it('rejects a non-git directory', async () => {
    const { code, stderr } = await captureIoAsync(() => start(makeTempDir(), ['x']))
    expect(code).toBe(1)
    expect(stderr).toContain('not a git repository')
  })

  it('rejects a repo with no commits', async () => {
    const { code, stderr } = await captureIoAsync(() => start(makeTempRepo({ commit: false }), ['x']))
    expect(code).toBe(1)
    expect(stderr).toContain('no commits yet')
  })

  it('refuses a dirty tree unless --allow-dirty', async () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'README.md'), '# dirty\n')
    expect((await captureIoAsync(() => start(dir, ["x"]))).code).toBe(1)
    const { code, stderr } = await captureIoAsync(() => start(dir, ['--allow-dirty', 'x']))
    expect(code).toBe(0)
    expect(stderr).toContain('--allow-dirty')
    expect(hasSession(dir)).toBe(true)
  })

  it('refuses a second session', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['first']))
    const { code, stderr } = await captureIoAsync(() => start(dir, ['second']))
    expect(code).toBe(1)
    expect(stderr).toContain('already active')
  })
})
