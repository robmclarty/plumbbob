import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { status } from '../status.ts'
import { start } from '../start.ts'
import { buildDir, checkpointsPath, sidecarDir } from '../../lib/sidecar.ts'
import { commit, headSha, stageAll } from '../../lib/git.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// A started build carrying a harness.json — status reports the active build's
// harness bindings. `harness` is written verbatim so tests can exercise valid
// bindings and a broken file alike.
const HARNESS_SLUG = 'harness-status'

async function startedWithHarness(harness: string): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Harness Status', '--slug', HARNESS_SLUG]))
  writeFileSync(join(buildDir(dir, HARNESS_SLUG), 'harness.json'), harness)
  return dir
}

// A resolvable project-tier agent, so a binding to it does NOT warn.
function putAgent(root: string, name: string): void {
  const dir = join(root, '.plumbbob', 'agents', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent.json'), JSON.stringify({ contract: 1, name, command: 'sh run.sh', slots: ['build', 'before', 'after'] }))
}

// status resolves bindings against the personal tier via process.env.HOME; pin it
// to an empty throwaway home so an unresolvable name stays unresolvable regardless
// of the developer's real ~/.plumbbob/agents.
function statusWithHome(home: string, cwd: string): { readonly code: number; readonly stdout: string } {
  const saved = process.env.HOME
  process.env.HOME = home
  try {
    return captureIo(() => status(cwd))
  } finally {
    if (saved === undefined) delete process.env.HOME
    else process.env.HOME = saved
  }
}

describe('status', () => {
  it('prints the NO ACTIVE SESSION sentinel with no session (exit 0)', async () => {
    const { code, stdout } = captureIo(() => status(makeTempRepo()))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('NO ACTIVE SESSION')
  })

  it('prints NO ACTIVE SESSION outside a git repo', async () => {
    const { code, stdout } = captureIo(() => status(makeTempDir()))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('NO ACTIVE SESSION')
  })

  it('prints the orientation dashboard for an active session', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Dashboards']))
    const { code, stdout } = captureIo(() => status(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('[DESIGN]')
    expect(stdout).toContain('Dashboards')
  })

  it('lists the builds instead of a broken dashboard when the session has no resolvable cursor', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['First Build']))
    // a second build folder + no cursor → activeBuild cannot resolve one
    mkdirSync(buildDir(dir, 'second-build'), { recursive: true })
    writeFileSync(join(buildDir(dir, 'second-build'), 'intent.md'), '# Second\n')
    writeFileSync(join(sidecarDir(dir), 'STATE'), '') // clear the cursor (empty STATE content)

    const { code, stdout } = captureIo(() => status(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('NO ACTIVE BUILD')
    expect(stdout).toContain('first-build')
    expect(stdout).toContain('second-build')
  })

  it('renders the dashboard for the build named by --build', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['First Build']))
    mkdirSync(buildDir(dir, 'second-build'), { recursive: true })
    writeFileSync(
      join(buildDir(dir, 'second-build'), 'intent.md'),
      '# Second Feature\n\n## Steps\n\n1. [ ] Go — **done when:** ok\n   - seam: `src/`\n',
    )
    const { code, stdout } = captureIo(() => status(dir, ['--build', 'second-build']))
    expect(code).toBe(0)
    expect(stdout).toContain('Second Feature')
  })
})

describe('status — out-of-band receipts (D66)', () => {
  it('surfaces commits landed since the last checkpoint outside the ledger', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Receipts']))
    // Record the current HEAD as the last checkpoint, then let two commits land on
    // top of it the way a human's own `git commit` would — outside plumbbob's ledger.
    const sha = headSha(dir)
    writeFileSync(checkpointsPath(dir), `baseline ${sha}\nstep 1 ${sha}\n`)
    for (const name of ['one', 'two']) {
      writeFileSync(join(dir, `${name}.txt`), `${name}\n`)
      stageAll(dir)
      commit(dir, `human ${name}`)
    }
    const { code, stdout } = captureIo(() => status(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('2 commits since the last checkpoint landed outside plumbbob\'s ledger.')
  })

  it('stays quiet when HEAD is the last checkpoint (a clean ledger)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Clean Ledger']))
    writeFileSync(checkpointsPath(dir), `step 1 ${headSha(dir)}\n`)
    const { stdout } = captureIo(() => status(dir))
    expect(stdout).not.toContain('outside plumbbob')
  })

  it('surfaces a commit landing after the plan but before the first step checkpoint', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Plan Window']))
    // The ledger holds only baseline + plan — exactly the window where a routed-
    // around commit would otherwise be invisible (no step line to anchor on).
    writeFileSync(checkpointsPath(dir), `baseline ${headSha(dir)}\nplan ${headSha(dir)}\n`)
    writeFileSync(join(dir, 'sneaky.txt'), 'landed by hand\n')
    stageAll(dir)
    commit(dir, 'raw commit mid-window')
    const { stdout } = captureIo(() => status(dir))
    expect(stdout).toContain("1 commit since the last checkpoint landed outside plumbbob's ledger.")
  })
})

describe('status — harness bindings (D48)', () => {
  it('lists the active build\'s defaults and per-step bindings', async () => {
    const home = makeTempDir()
    const dir = await startedWithHarness(
      JSON.stringify({
        contract: 1,
        defaults: { after: ['reviewer'] },
        steps: { '2': { before: ['gather'], build: 'coder', note: 'watch the seam' } },
      }),
    )
    for (const name of ['reviewer', 'gather', 'coder']) putAgent(dir, name)

    const { code, stdout } = statusWithHome(home, dir)
    expect(code).toBe(0)
    expect(stdout).toContain('harness bindings:')
    expect(stdout).toContain('defaults · after: reviewer')
    expect(stdout).toContain('step 2 · before: gather')
    expect(stdout).toContain('step 2 · build: coder')
    expect(stdout).toContain('step 2 · note: watch the seam')
    expect(stdout).not.toContain('⚠') // every bound agent resolves
  })

  it('warns on a bound agent that does not resolve', async () => {
    const home = makeTempDir()
    const dir = await startedWithHarness(JSON.stringify({ contract: 1, defaults: { after: ['ghost'] } }))
    const { code, stdout } = statusWithHome(home, dir)
    expect(code).toBe(0)
    expect(stdout).toContain('defaults · after: ghost')
    expect(stdout).toContain('⚠ bound agent "ghost" does not resolve')
  })

  it('shows no binding section when the build has no harness.json', async () => {
    const home = makeTempDir()
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['No Harness']))
    const { stdout } = statusWithHome(home, dir)
    expect(stdout).not.toContain('harness bindings')
  })

  it('surfaces a broken harness.json rather than hiding it', async () => {
    const home = makeTempDir()
    const dir = await startedWithHarness('{ not json')
    const { code, stdout } = statusWithHome(home, dir)
    expect(code).toBe(0) // status never fails; it reports
    expect(stdout).toContain('harness bindings: ✗')
    expect(stdout).toContain('not valid JSON')
  })
})
