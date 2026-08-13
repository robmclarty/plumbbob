import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../build.ts'
import { start } from '../start.ts'
import { buildDir, buildLogPath, intentPath, readStats, seamPath, stepPath, tickPath, turnPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Build test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`, \`src/c.ts\`
`

async function startedWithSteps(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Build test']))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

describe('build', () => {
  it('writes the seam + step and goes in-flight (the BUILD phase signal)', async () => {
    const dir = await startedWithSteps()
    const { code, stdout } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(readFileSync(seamPath(dir), 'utf8')).toBe('src/b.ts\nsrc/c.ts\n')
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('2')
    expect(stdout).toContain('building step 2')
    // The seam is printed indented, one path per line, under the not-a-lock banner.
    expect(stdout).toContain('not a lock):\n  src/b.ts\n  src/c.ts')
  })

  it('with no argument, enters the next undone step', async () => {
    const dir = await startedWithSteps() // steps 1 and 2 both undone
    const { code, stdout } = captureIo(() => build(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('1')
    expect(readFileSync(seamPath(dir), 'utf8')).toBe('src/a.ts\n')
    expect(stdout).toContain('building step 1 (next undone)')
  })

  it('with no argument and every step checkpointed, refuses and writes nothing', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]').replace('2. [ ]', '2. [x]'))
    const { code, stderr } = captureIo(() => build(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('no undone step to build')
    expect(existsSync(stepPath(dir))).toBe(false)
    expect(existsSync(seamPath(dir))).toBe(false)
  })

  it('rejects a non-numeric, mixed, or sub-1 step with the usage message', async () => {
    // Each shape trips a different validation clause: no digits, digits at the
    // wrong end (both ends), and a number below 1.
    for (const bad of ['nope', 'x2', '2x', '0']) {
      const dir = await startedWithSteps()
      const { code, stderr } = captureIo(() => build(dir, [bad]))
      expect(code).toBe(1)
      expect(stderr).toContain('build needs a step number')
    }
  })

  it('accepts a multi-digit step number as a number, not a stray token', async () => {
    // Step 12 does not exist in the intent, but it must reach seam parsing,
    // not bounce off the step-number validation.
    const dir = await startedWithSteps()
    const { code, stderr } = captureIo(() => build(dir, ['12']))
    expect(code).toBe(1)
    expect(stderr).not.toContain('build needs a step number')
    expect(stderr).toContain('`build 12` again')
  })

  it('rejects a step range, naming it a /plumbbob:build feature (not the generic usage)', async () => {
    // `1-3` looks like a step arg but is a skill-level affordance; the CLI records
    // one in-flight step at a time, so it points back at the skill and a single step.
    const dir = await startedWithSteps()
    const { code, stderr } = captureIo(() => build(dir, ['1-3']))
    expect(code).toBe(1)
    expect(stderr).not.toContain('build needs a step number')
    expect(stderr).toContain('step ranges are a `/plumbbob:build` feature')
    expect(stderr).toContain('plumbbob build 1')
  })

  it('skips flag args when finding the step number', async () => {
    const dir = await startedWithSteps()
    const { code } = captureIo(() => build(dir, ['--quiet', '2']))
    expect(code).toBe(0)
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('2')
  })

  it('reports a step with no parseable seam, pointing at intent.md', async () => {
    const dir = await startedWithSteps()
    const { code, stderr } = captureIo(() => build(dir, ['9']))
    expect(code).toBe(1)
    expect(stderr).toContain("Fix the step's seam in intent.md, then `build 9` again.")
  })

  it('refuses with no active session — and says so', async () => {
    const { code, stderr } = captureIo(() => build(makeTempRepo(), ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })

  it('targets a non-cursor build with --build, landing SEAM/STEP in that folder', async () => {
    const dir = await startedWithSteps() // cursor build is `build-test`
    const alt = buildDir(dir, 'alt-build')
    mkdirSync(alt, { recursive: true })
    writeFileSync(join(alt, 'intent.md'), INTENT)
    writeFileSync(turnPath(dir), '6\n') // the ledger is per-worktree; the stamp follows the build

    const { code } = captureIo(() => build(dir, ['--build', 'alt-build', '2']))
    expect(code).toBe(0)
    // the slug is a bare token after --build; it must not be read as the step number
    expect(readFileSync(join(alt, 'SEAM'), 'utf8')).toBe('src/b.ts\nsrc/c.ts\n')
    expect(readFileSync(join(alt, 'STEP'), 'utf8').trim()).toBe('2')
    expect(readFileSync(join(alt, 'TICK'), 'utf8')).toBe('6\n')
    expect(existsSync(seamPath(dir))).toBe(false) // the cursor build was not touched
    expect(existsSync(tickPath(dir))).toBe(false)
  })

  it('stamps TICK = TURN at entry — the span the checkpoint latch measures — D64 (approval-latch)', async () => {
    const dir = await startedWithSteps()
    writeFileSync(turnPath(dir), '5\n')
    const { code } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(readFileSync(tickPath(dir), 'utf8')).toBe('5\n')
  })

  it('stamps no TICK when TURN is absent — a hookless host grows no ledger', async () => {
    const dir = await startedWithSteps()
    const { code } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(existsSync(tickPath(dir))).toBe(false)
  })
})

describe('build — the build-log mirror — D69 (cli-owned-buildlog)', () => {
  it('sets Current step to `<n> — <title>` and marks the mirror', async () => {
    const dir = await startedWithSteps()
    captureIo(() => build(dir, ['2']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain('**Current step:** 2 — Second')
    expect(log).toContain('- ☐ 1. First')
    expect(log).toContain('- ☐ 2. Second')
    expect(log).not.toContain('- ☐ 1. <step>')
  })

  it('reflects an already-checkpointed step as ☑ in the mirror', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    captureIo(() => build(dir, ['2']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain('- ☑ 1. First')
    expect(log).toContain('- ☐ 2. Second')
  })
})

describe('build — the wall-clock receipt (research/07 2b)', () => {
  it('stamps startedAt for the step on entry', async () => {
    const dir = await startedWithSteps()
    captureIo(() => build(dir, ['1']))
    const started = readStats(dir)['1']?.startedAt
    expect(started).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
