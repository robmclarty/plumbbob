import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkpoint } from '../checkpoint.ts'
import { start } from '../start.ts'
import { buildLogPath, checkpointsPath, hasSession, intentPath } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Checkpoint test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
`

// A started session with one planned step and a green stub gate. In the tracked
// layout the build folder rides the tree (D2), so overwriting intent/settings
// dirties it — checkpoint stages that alongside the step's work.
function startedGreen(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Checkpoint test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

describe('checkpoint', () => {
  it('commits pending work, records the SHA, flips the step, stays at the boundary', async () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n') // dirty the tracked tree
    const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(true)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/step 1 [0-9a-f]{40}/)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
    expect(stdout).toContain('step 1 checkpointed')
  })

  it('titles the commit subject `plumbbob: step N — <title>` from intent.md', async () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n') // ensure a fresh commit is made
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    expect(subject).toBe('plumbbob: step 1 — First')
  })

  it('composes a deterministic body — done-when, seam, diffstat — when no --body is given', async () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
    expect(body).toContain('done when: a works.')
    expect(body).toContain('seam: src/a.ts')
    expect(body).toContain('work.txt') // the staged diffstat names the changed file
  })

  it('falls back to `plumbbob: step N done` when intent carries no title', async () => {
    const dir = startedGreen()
    writeFileSync(intentPath(dir), '# Untitled steps\n\n## Steps\n\n1. [ ] — **done when:** a works.\n')
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    expect(subject).toBe('plumbbob: step 1 done')
  })

  it("appends a dated history line to the build-log's Log, naming the step", async () => {
    const dir = startedGreen()
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toMatch(/- \d{4}-\d{2}-\d{2} — step 1 checkpointed · [0-9a-f]{9} — First/)
  })

  it('whitelists its own staged artifact writes — no scope-drift warning (step 7)', async () => {
    const dir = startedGreen()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n') // matches the step's `src/a.ts` seam
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    // The build folder (intent.md, build-log.md) is staged too, but it lives under
    // `.plumbbob/` and must never read as drift.
    expect(stderr).not.toContain('outside step')
  })

  it('warns (but still commits) when staged work reaches outside the step seam', async () => {
    const dir = startedGreen()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n')
    writeFileSync(join(dir, 'stray.ts'), 'out of seam\n') // not in `src/a.ts`, not artifact
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0) // guidance, not a gate — the checkpoint still lands
    expect(stderr).toContain("outside step 1's seam")
    expect(stderr).toContain('stray.ts')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]') // committed despite the drift
  })

  it('refuses on a red check', async () => {
    const dir = startedGreen()
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'false' }))
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('check failed')
  })

  it('refuses distinctly when the gate itself breaks (checkride exit 2)', async () => {
    const dir = startedGreen()
    writeFileSync(settingsPath(dir), JSON.stringify({ auto: false })) // no check key → checkride
    writeFileSync(join(dir, 'checkride.config.json'), '{not json')
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('gate itself broke')
  })

  it('resolves the first undone step when none is given (clean tree records HEAD)', async () => {
    const dir = startedGreen()
    const { code } = await captureIoAsync(() => checkpoint(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
  })

  it('refuses with no active session', async () => {
    expect((await captureIoAsync(() => checkpoint(makeTempRepo(), ['1']))).code).toBe(1)
  })

  // Step 8 — the plan-approval commit (D11): its own commit, before any step,
  // carrying only the build's scaffold so the first step's diff stays clean.
  describe('--plan', () => {
    it('commits as `plumbbob: plan — <title>` and records a `plan <sha>` line', async () => {
      const dir = startedGreen()
      const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['--plan']))
      expect(code).toBe(0)
      expect(stdout).toContain('plan committed')
      const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('plumbbob: plan — Checkpoint test')
      expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/plan [0-9a-f]{40}/)
    })

    it('commits only the build folder — not settings.json or code, and no step flip', async () => {
      const dir = startedGreen()
      writeFileSync(join(dir, 'work.txt'), 'code, not plan\n') // stray dirt outside the build folder
      await captureIoAsync(() => checkpoint(dir, ['--plan']))
      const names = execFileSync('git', ['show', '--pretty=format:', '--name-only', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
      })
        .split('\n')
        .filter((l) => l.length > 0)
      expect(names.every((n) => n.startsWith('.plumbbob/builds/checkpoint-test/'))).toBe(true)
      expect(names).not.toContain('work.txt')
      expect(names).not.toContain('.plumbbob/settings.json')
      expect(readFileSync(intentPath(dir), 'utf8')).not.toContain('1. [x]') // no step marked done
    })
    // `--body` reads fd 0, which an in-process unit test can't feed — the subprocess
    // integration test (verify.test.ts) covers the plan commit's `--body` path (C6).
  })
})
