import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { revert } from '../revert.ts'
import { start } from '../start.ts'
import { build } from '../build.ts'
import { checkpoint } from '../checkpoint.ts'
import { park } from '../park.ts'
import { buildDir, buildLogPath, checkpointsPath, intentPath, seamPath, stepPath } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { headSha } from '../../lib/git.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Revert test

## Steps

1. [ ] First — **done when:** it works.
   - seam: \`feature.txt\`
`

function git(dir: string, args: ReadonlyArray<string>): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

// A started session with one planned step and a green stub gate.
async function startedGreen(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Revert test', '--slug', 'revert-test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

describe('revert', () => {
  it('rewinds tracked work to the last step checkpoint and clears the in-flight step', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'feature.txt'), 'v1\n')
    await captureIoAsync(() => checkpoint(dir, ['1'])) // commits feature.txt=v1, records step 1
    captureIo(() => build(dir, ['1'])) // go in-flight: writes SEAM + STEP
    writeFileSync(join(dir, 'feature.txt'), 'v2\n') // uncommitted drift
    const { code, stdout } = captureIo(() => revert(dir, []))
    expect(code).toBe(0)
    expect(existsSync(stepPath(dir))).toBe(false) // back at the boundary
    expect(readFileSync(join(dir, 'feature.txt'), 'utf8')).toBe('v1\n')
    expect(stdout).toMatch(/reverted to [0-9a-f]{9} — back at the boundary/) // short SHA, not the full 40
  })

  it('reverts --to a multi-digit step by its recorded SHA', async () => {
    const dir = await startedGreen()
    const first = headSha(dir)
    writeFileSync(join(dir, 'feature.txt'), 'later\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'past step 10'])
    // Hand-written ledger: step 10 points at the first commit. Multi-digit on
    // purpose — the parser must read the whole number, not one digit.
    writeFileSync(checkpointsPath(dir), `baseline ${first}\nstep 10 ${first}\n`)
    const { code } = captureIo(() => revert(dir, ['--to', '10']))
    expect(code).toBe(0)
    expect(headSha(dir)).toBe(first)
  })

  it('falls back to the baseline when no step checkpoint exists', async () => {
    const dir = await startedGreen()
    const baseline = headSha(dir)
    writeFileSync(join(dir, 'feature.txt'), 'drift\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'a commit past baseline'])
    expect(headSha(dir)).not.toBe(baseline)
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(headSha(dir)).toBe(baseline)
  })

  it('removes untracked files in the seam but leaves out-of-seam files', async () => {
    const dir = await startedGreen()
    captureIo(() => build(dir, ['1'])) // writes SEAM=feature.txt, STEP=1 (in-flight)
    writeFileSync(join(dir, 'feature.txt'), 'scratch\n') // untracked, in seam
    writeFileSync(join(dir, 'other.txt'), 'keep\n') // untracked, out of seam
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(existsSync(join(dir, 'feature.txt'))).toBe(false)
    expect(existsSync(join(dir, 'other.txt'))).toBe(true)
  })

  it('a directory seam token sweeps untracked files under it by prefix', async () => {
    const dir = await startedGreen()
    writeFileSync(seamPath(dir), 'stuff/\n') // a directory seam token
    mkdirSync(join(dir, 'stuff'))
    writeFileSync(join(dir, 'stuff', 'scratch.txt'), 'wip\n')
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    // ls-files reports files, not dirs — the file goes; an empty dir may linger.
    expect(existsSync(join(dir, 'stuff', 'scratch.txt'))).toBe(false)
  })

  it('carries an installed driver skill across a baseline reset', async () => {
    // The skill was committed after the baseline, so a bare reset --hard would
    // delete it with the work; revert protects plumbbob's own machinery.
    const dir = await startedGreen()
    const skill = join(dir, '.claude', 'skills', 'pb-verify')
    mkdirSync(skill, { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '# pb-verify\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'work + installed skill, past baseline'])
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(readFileSync(join(skill, 'SKILL.md'), 'utf8')).toBe('# pb-verify\n')
  })

  it('refuses when the ledger records no baseline at all', async () => {
    const dir = await startedGreen()
    rmSync(checkpointsPath(dir), { force: true })
    const { code, stderr } = captureIo(() => revert(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('no baseline recorded')
  })

  it('preserves sidecar edits (intent/park) across the reset (C4)', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'feature.txt'), 'v1\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    writeFileSync(intentPath(dir), `${readFileSync(intentPath(dir), 'utf8')}\n<!-- note made after the checkpoint -->\n`)
    captureIo(() => revert(dir, []))
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('note made after the checkpoint')
  })

  // Q7 / D10: the artifact plane is tracked now, so revert must snapshot + restore
  // the whole build folder across the reset — both when reverting to a step (the
  // folder exists at the target SHA but with older content) and to the baseline
  // (the folder does not exist at the target SHA at all).
  it('revert-to-step: the whole build folder and park lines survive (Q7)', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'feature.txt'), 'v1\n')
    await captureIoAsync(() => checkpoint(dir, ['1'])) // commits feature.txt=v1 AND the tracked build folder; records step 1
    captureIo(() => build(dir, ['1'])) // in-flight
    captureIo(() => park(dir, ['survive the step revert'])) // uncommitted tracked artifact edit
    writeFileSync(join(dir, 'feature.txt'), 'v2\n') // uncommitted code drift
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(readFileSync(join(dir, 'feature.txt'), 'utf8')).toBe('v1\n') // code rewound
    expect(existsSync(buildDir(dir, 'revert-test'))).toBe(true) // folder intact
    expect(existsSync(intentPath(dir))).toBe(true)
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('survive the step revert') // park line kept (C4)
  })

  it('revert-to-baseline: the build folder survives even when it does not exist at the baseline SHA (Q7)', async () => {
    const dir = await startedGreen()
    const baseline = headSha(dir) // predates any commit of the build folder
    writeFileSync(join(dir, 'feature.txt'), 'work\n')
    captureIo(() => park(dir, ['survive the baseline revert']))
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'work + tracked build folder, past baseline'])
    // No step checkpoints recorded → revert falls back to the baseline, where the
    // build folder is absent; a bare reset --hard would delete it outright.
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(headSha(dir)).toBe(baseline)
    expect(existsSync(buildDir(dir, 'revert-test'))).toBe(true)
    expect(existsSync(intentPath(dir))).toBe(true)
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('survive the baseline revert')
  })

  it('rejects --to without a numeric step — including mixed digit shapes', async () => {
    for (const bad of ['abc', 'x2', '2x']) {
      const dir = await startedGreen()
    const { code, stderr } = captureIo(() => revert(dir, ['--to', bad]))
      expect(code).toBe(1)
      expect(stderr).toContain('--to needs a step number')
    }
  })

  it('rejects --to for a step with no recorded checkpoint — echoing the full number', async () => {
    const dir = await startedGreen()
    const { code, stderr } = captureIo(() => revert(dir, ['--to', '15']))
    expect(code).toBe(1)
    expect(stderr).toContain('no checkpoint recorded for step 15')
  })

  it('refuses with no active session — and says so', async () => {
    const { code, stderr } = captureIo(() => revert(makeTempRepo(), []))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
