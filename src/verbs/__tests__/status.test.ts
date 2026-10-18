import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { status } from '../status.ts'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { buildDir, checkpointsPath, detailPath, sidecarDir, stepPath } from '../../lib/sidecar.ts'
import { commit, headSha, stageAll } from '../../lib/git.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// A started build carrying a harness.json: status reports the active build's
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

describe('status — the build ranges', () => {
  const RANGED = [
    '# Ranged',
    '',
    '## Steps',
    '',
    '1. [x] First — **done when:** ok',
    '   - seam: `src/a.ts`',
    '2. [ ] Second — **done when:** ok',
    '   - seam: `src/b.ts`',
    '3. [ ] Third — **done when:** ok',
    '   - seam: `src/c.ts`',
    '',
    '## Build ranges',
    '',
    "1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the schema",
    '2. `/plumbbob:build 2-3`, **stop:** review the parser',
    '   - model: opus',
    '',
  ].join('\n')

  it('lists the ranges beneath the steps and names the range to type next', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Ranged', '--slug', 'ranged']))
    writeFileSync(join(buildDir(dir, 'ranged'), 'intent.md'), RANGED)
    const { code, stdout } = captureIo(() => status(dir))
    expect(code).toBe(0)
    expect(stdout).toContain(
      ['  ranges  1 of 2 done', '  ✓ 1  /plumbbob:build 1', '  ▸ 2  /plumbbob:build 2-3 · opus   ← next', '        stop: review the parser'].join('\n'),
    )
    expect(stdout).toContain('next → build range 2 of 2 — `/plumbbob:build 2-3`')
  })

  it('renders a plan without ranges exactly as before', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Plain', '--slug', 'plain']))
    writeFileSync(join(buildDir(dir, 'plain'), 'intent.md'), RANGED.replace(/## Build ranges[\s\S]*$/, ''))
    const { stdout } = captureIo(() => status(dir))
    expect(stdout).not.toContain('ranges')
    expect(stdout).toContain('next → build step 2 — `/plumbbob:build`')
  })
})

describe('status — --invoked repoints the dashboard at the requested step', () => {
  const STEPS_INTENT = [
    '# Invoked',
    '',
    '## Steps',
    '',
    '1. [x] First — **done when:** a works.',
    '   - seam: `src/a.ts`',
    '2. [ ] Second — **done when:** b works.',
    '   - seam: `src/b.ts`',
    '3. [ ] Third — **done when:** c works.',
    '   - seam: `src/c.ts`',
    '',
  ].join('\n')

  async function startedWithSteps(): Promise<string> {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Invoked', '--slug', 'invoked']))
    writeFileSync(join(buildDir(dir, 'invoked'), 'intent.md'), STEPS_INTENT)
    return dir
  }

  it('an explicit step number in the raw invocation takes the one arrow', async () => {
    const dir = await startedWithSteps()
    const { code, stdout } = captureIo(() => status(dir, ['--invoked', '3 --auto']))
    expect(code).toBe(0)
    expect(stdout).toContain('▸ 3  Third   ← requested')
    expect(stdout).toContain('next → build step 3 — explicitly requested (skips 1 undone step)')
    // The derived suggestion must not survive alongside the request.
    expect(stdout).not.toContain('← next')
  })

  it('an invocation with no step number renders exactly the default dashboard', async () => {
    const dir = await startedWithSteps()
    const plain = captureIo(() => status(dir)).stdout
    expect(captureIo(() => status(dir, ['--invoked', '--auto'])).stdout).toBe(plain)
    expect(captureIo(() => status(dir, ['--invoked', ''])).stdout).toBe(plain)
    expect(plain).toContain('← next')
  })

  it('composes with --build, whichever order the flags arrive in', async () => {
    const dir = await startedWithSteps()
    const { stdout } = captureIo(() => status(dir, ['--invoked', '2', '--build', 'invoked']))
    expect(stdout).toContain('▸ 2  Second   ← requested')
  })
})

describe('status — out-of-band receipts — D66 (oob-commits-surfaced)', () => {
  it('surfaces commits landed since the last checkpoint outside the ledger', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Receipts']))
    // Record the current HEAD as the last checkpoint, then let two commits land on
    // top of it the way a human's own `git commit` would (outside plumbbob's ledger).
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

  it('leaves a hand-made plan commit out of the count, the way handoff does', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Plan Marker']))
    writeFileSync(checkpointsPath(dir), `step 1 ${headSha(dir)}\n`)
    // One commit declaring itself a plan commit in its body, one that does not:
    // the pair a harvest and a human's own commit leave behind.
    for (const [name, body] of [['plan', 'plumbbob plan'], ['plain', undefined]] as const) {
      writeFileSync(join(dir, `${name}.txt`), `${name}\n`)
      stageAll(dir)
      commit(dir, `chore: ${name}`, body)
    }
    const { stdout } = captureIo(() => status(dir))
    expect(stdout).toContain("1 commit since the last checkpoint landed outside plumbbob's ledger.")

    // The Verdict counts that same one commit: both surfaces drop the marker.
    writeFileSync(stepPath(dir), '1\n')
    writeFileSync(detailPath(dir), '# Detail · Step 1 · Plan Marker\n\n## Summary\n\nDone.\n')
    const { stdout: pause } = captureIo(() => handoff(dir, []))
    expect(pause).toContain('(1 commit outside the ledger)')
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
    // The ledger holds only baseline + plan: exactly the window where a routed-
    // around commit would otherwise be invisible (no step line to anchor on).
    writeFileSync(checkpointsPath(dir), `baseline ${headSha(dir)}\nplan ${headSha(dir)}\n`)
    writeFileSync(join(dir, 'sneaky.txt'), 'landed by hand\n')
    stageAll(dir)
    commit(dir, 'raw commit mid-window')
    const { stdout } = captureIo(() => status(dir))
    expect(stdout).toContain("1 commit since the last checkpoint landed outside plumbbob's ledger.")
  })
})

describe('status — harness bindings — D48 (doctor-validates-agents)', () => {
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
