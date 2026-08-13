// `plumbbob recover`: the control-plane reconciliation verb. Each test plants
// one inconsistency a real session can land in (crash, context loss, a switched
// build, a rewritten plan) and pins both halves of the contract: bare `recover`
// reports and changes nothing, `--fix` repairs exactly the untracked control
// files it claims to and never a tracked artifact.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { recover } from '../recover.ts'
import { start } from '../start.ts'
import {
  activeBuild,
  buildDir,
  checkpointsPath,
  grantPath,
  handoffPath,
  intentPath,
  markSpike,
  seamPath,
  stepPath,
  tickPath,
  turnPath,
} from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Recover test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
`

/** A started session with a two-step plan and the plan commit already recorded. */
async function started(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Recover test', '--slug', 'recover-test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(checkpointsPath(dir), 'baseline abc123\nplan def456\n')
  return dir
}

/** Plant a second resumable build folder. */
function seedBuild(dir: string, slug: string): void {
  const d = buildDir(dir, slug)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'intent.md'), `# ${slug}\n\n## Steps\n\n1. [ ] Do it — **done when:** ok\n`)
}

describe('recover — a consistent control plane', () => {
  it('reports every check green and exits 0', async () => {
    const dir = await started()
    const { code, stdout } = captureIo(() => recover(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('✓ cursor: build "recover-test" resolves')
    expect(stdout).toContain('✓ phase: at the boundary')
    expect(stdout).toContain('control plane consistent — nothing to recover.')
    expect(stdout).not.toContain('✗')
  })

  it('says there is nothing to reconcile with no session, rather than refusing', () => {
    const dir = makeTempRepo()
    const { code, stdout } = captureIo(() => recover(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('✓ session: none open')
  })

  it('refuses outside a git repository', () => {
    const { code, stderr } = captureIo(() => recover('/', []))
    expect(code).toBe(1)
    expect(stderr).toContain('not a git repository')
  })

  it('reads a step in flight as the phase, not a problem', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '1\n')
    writeFileSync(tickPath(dir), '3\n') // legitimately stamped when the step was entered
    const { code, stdout } = captureIo(() => recover(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('✓ phase: step 1 in flight')
    expect(stdout).toContain('✓ latch tick: stamped for the step in flight')
  })
})

describe('recover — the cursor points nowhere', () => {
  it('names the empty-dashboard failure and repairs when exactly one build survives', async () => {
    const dir = await started()
    seedBuild(dir, 'other-build')
    rmSync(buildDir(dir, 'recover-test'), { recursive: true, force: true })

    const reported = captureIo(() => recover(dir, []))
    expect(reported.code).toBe(1)
    expect(reported.stdout).toContain('✗ cursor: points at "recover-test"')
    expect(reported.stdout).toContain('status will render an empty dashboard rather than refuse')
    expect(reported.stdout).toContain('1 problem still standing')
    expect(activeBuild(dir)).toBe('recover-test') // reporting changed nothing

    const fixed = captureIo(() => recover(dir, ['--fix']))
    expect(fixed.code).toBe(0)
    expect(fixed.stdout).toContain('✓ cursor: re-pointed at "other-build"')
    expect(activeBuild(dir)).toBe('other-build')
  })

  it('refuses to guess when several builds survive — it names them instead', async () => {
    const dir = await started()
    seedBuild(dir, 'build-a')
    seedBuild(dir, 'build-b')
    rmSync(buildDir(dir, 'recover-test'), { recursive: true, force: true })

    const { code, stdout } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(1)
    expect(stdout).toContain('pick the one you meant: plumbbob use <slug>')
    expect(stdout).toContain('build-a, build-b')
  })

  it('points at finish when no build folder survives at all', async () => {
    const dir = await started()
    rmSync(buildDir(dir, 'recover-test'), { recursive: true, force: true })
    const { code, stdout } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(1)
    expect(stdout).toContain('no build folder survives here')
  })
})

describe('recover — contradictory phase markers', () => {
  it('flags a spike and a step marked in flight at once', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    markSpike(dir)
    const { code, stdout } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(1)
    expect(stdout).toContain('both a spike and step 2 are marked in flight')
    expect(stdout).toContain('status shows the spike and hides the step')
    // Never auto-resolved: closing a spike destroys worktrees, so it stays the human's call.
    expect(existsSync(stepPath(dir))).toBe(true)
  })

  it('flags a STEP the plan no longer contains (a refine rewrote it underneath)', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '5\n')
    const { code, stdout } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(1)
    expect(stdout).toContain('step 5 is in flight but the plan has no step 5')
    expect(stdout).toContain('planned: 1, 2')
  })
})

describe('recover — leftovers only --fix clears', () => {
  it('clears an orphaned handoff ledger that would leak into the next step', async () => {
    const dir = await started()
    writeFileSync(handoffPath(dir), JSON.stringify([{ status: 'done' }, { status: 'done' }]))

    const reported = captureIo(() => recover(dir, []))
    expect(reported.code).toBe(1)
    expect(reported.stdout).toContain('2 agent envelopes left over at the boundary')
    expect(existsSync(handoffPath(dir))).toBe(true) // reporting is not repairing

    const fixed = captureIo(() => recover(dir, ['--fix']))
    expect(fixed.code).toBe(0)
    expect(fixed.stdout).toContain('cleared 2 leftover envelopes')
    expect(existsSync(handoffPath(dir))).toBe(false)
  })

  it('leaves the ledger alone while a step is in flight — it is in scope then', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '1\n')
    writeFileSync(handoffPath(dir), JSON.stringify([{ status: 'done' }]))
    const { code, stdout } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(0)
    expect(stdout).toContain('✓ handoff ledger: in scope for the step in flight')
    expect(existsSync(handoffPath(dir))).toBe(true)
  })

  it('clears a TICK stranded at the boundary by a revert', async () => {
    const dir = await started()
    writeFileSync(tickPath(dir), '4\n') // revert clears STEP/SEAM but not TICK
    const reported = captureIo(() => recover(dir, []))
    expect(reported.code).toBe(1)
    expect(reported.stdout).toContain('a TICK stamp survives at the boundary')
    expect(existsSync(tickPath(dir))).toBe(true)

    const fixed = captureIo(() => recover(dir, ['--fix']))
    expect(fixed.code).toBe(0)
    expect(existsSync(tickPath(dir))).toBe(false)
  })

  it('leaves the plan-pause TICK alone before the plan has landed', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'baseline abc123\n') // no plan line yet
    writeFileSync(tickPath(dir), '2\n')
    const { code } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(0)
    expect(existsSync(tickPath(dir))).toBe(true)
  })

  it('drops a GRANT stranded with no turn ledger to clear it', async () => {
    const dir = await started()
    writeFileSync(grantPath(dir), 'auto\n')
    rmSync(turnPath(dir), { force: true }) // the hook is not wired: nothing will ever clear it

    const reported = captureIo(() => recover(dir, []))
    expect(reported.code).toBe(1)
    expect(reported.stdout).toContain('the latch would honor it as self-approval')

    const fixed = captureIo(() => recover(dir, ['--fix']))
    expect(fixed.code).toBe(0)
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('leaves a GRANT alone while the ledger is live — the next tick rewrites it', async () => {
    const dir = await started()
    writeFileSync(grantPath(dir), 'auto\n')
    writeFileSync(turnPath(dir), '7\n')
    const { code, stdout } = captureIo(() => recover(dir, ['--fix']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('self-approval grant')
    expect(existsSync(grantPath(dir))).toBe(true)
  })
})

describe('recover — what --fix must never touch', () => {
  it('repairs control state without editing a single tracked artifact', async () => {
    const dir = await started()
    writeFileSync(handoffPath(dir), '[{"status":"done"}]')
    writeFileSync(tickPath(dir), '4\n')
    writeFileSync(seamPath(dir), 'src/a.ts\n')
    const intentBefore = readFileSync(intentPath(dir), 'utf8')
    const ledgerBefore = readFileSync(checkpointsPath(dir), 'utf8')

    const { code } = captureIo(() => recover(dir, ['--fix']))

    expect(code).toBe(0)
    // The artifact plane is untouched: recover reconciles the control plane only.
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(intentBefore)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toBe(ledgerBefore)
    // And SEAM is not its business: a seam without a step is what `build` writes next.
    expect(existsSync(seamPath(dir))).toBe(true)
  })
})
