import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { revert } from '../revert.ts'
import { start } from '../start.ts'
import { build } from '../build.ts'
import { checkpoint } from '../checkpoint.ts'
import { park } from '../park.ts'
import { buildDir, buildLogPath, intentPath, stepPath } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { headSha } from '../../lib/git.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

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
function startedGreen(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Revert test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

describe('revert', () => {
  it('rewinds tracked work to the last step checkpoint and clears the in-flight step', () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'feature.txt'), 'v1\n')
    captureIo(() => checkpoint(dir, ['1'])) // commits feature.txt=v1, records step 1
    captureIo(() => build(dir, ['1'])) // go in-flight: writes SEAM + STEP
    writeFileSync(join(dir, 'feature.txt'), 'v2\n') // uncommitted drift
    const { code, stdout } = captureIo(() => revert(dir, []))
    expect(code).toBe(0)
    expect(existsSync(stepPath(dir))).toBe(false) // back at the boundary
    expect(readFileSync(join(dir, 'feature.txt'), 'utf8')).toBe('v1\n')
    expect(stdout).toContain('reverted to')
  })

  it('falls back to the baseline when no step checkpoint exists', () => {
    const dir = startedGreen()
    const baseline = headSha(dir)
    writeFileSync(join(dir, 'feature.txt'), 'drift\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'a commit past baseline'])
    expect(headSha(dir)).not.toBe(baseline)
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(headSha(dir)).toBe(baseline)
  })

  it('removes untracked files in the seam but leaves out-of-seam files', () => {
    const dir = startedGreen()
    captureIo(() => build(dir, ['1'])) // writes SEAM=feature.txt, STEP=1 (in-flight)
    writeFileSync(join(dir, 'feature.txt'), 'scratch\n') // untracked, in seam
    writeFileSync(join(dir, 'other.txt'), 'keep\n') // untracked, out of seam
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(existsSync(join(dir, 'feature.txt'))).toBe(false)
    expect(existsSync(join(dir, 'other.txt'))).toBe(true)
  })

  it('preserves sidecar edits (intent/park) across the reset (C4)', () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'feature.txt'), 'v1\n')
    captureIo(() => checkpoint(dir, ['1']))
    writeFileSync(intentPath(dir), `${readFileSync(intentPath(dir), 'utf8')}\n<!-- note made after the checkpoint -->\n`)
    captureIo(() => revert(dir, []))
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('note made after the checkpoint')
  })

  // Q7 / D10: the artifact plane is tracked now, so revert must snapshot + restore
  // the whole build folder across the reset — both when reverting to a step (the
  // folder exists at the target SHA but with older content) and to the baseline
  // (the folder does not exist at the target SHA at all).
  it('revert-to-step: the whole build folder and park lines survive (Q7)', () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'feature.txt'), 'v1\n')
    captureIo(() => checkpoint(dir, ['1'])) // commits feature.txt=v1 AND the tracked build folder; records step 1
    captureIo(() => build(dir, ['1'])) // in-flight
    captureIo(() => park(dir, ['survive the step revert'])) // uncommitted tracked artifact edit
    writeFileSync(join(dir, 'feature.txt'), 'v2\n') // uncommitted code drift
    expect(captureIo(() => revert(dir, [])).code).toBe(0)
    expect(readFileSync(join(dir, 'feature.txt'), 'utf8')).toBe('v1\n') // code rewound
    expect(existsSync(buildDir(dir, 'revert-test'))).toBe(true) // folder intact
    expect(existsSync(intentPath(dir))).toBe(true)
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('survive the step revert') // park line kept (C4)
  })

  it('revert-to-baseline: the build folder survives even when it does not exist at the baseline SHA (Q7)', () => {
    const dir = startedGreen()
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

  it('rejects --to without a numeric step', () => {
    const { code, stderr } = captureIo(() => revert(startedGreen(), ['--to', 'abc']))
    expect(code).toBe(1)
    expect(stderr).toContain('--to needs a step number')
  })

  it('rejects --to for a step with no recorded checkpoint', () => {
    const { code, stderr } = captureIo(() => revert(startedGreen(), ['--to', '5']))
    expect(code).toBe(1)
    expect(stderr).toContain('no checkpoint recorded for step 5')
  })

  it('refuses with no active session', () => {
    expect(captureIo(() => revert(makeTempRepo(), [])).code).toBe(1)
  })
})
