import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkpoint } from '../checkpoint.ts'
import { start } from '../start.ts'
import { buildLogPath, checkpointsPath, grantPath, handoffPath, hasSession, intentPath, readStats, stampStepStat, stepPath, tickPath, turnPath } from '../../lib/sidecar.ts'
import { gitPath } from '../../lib/git.ts'
import { setLocalSetting, settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { cleanupFixtures, makeFixtureRepo, runCli } from '../../../test/helpers/fixture-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'
import { runCliWithSocketStdin } from '../../../test/helpers/socket-stdin.ts'

afterAll(cleanupTempRepos)
afterAll(cleanupFixtures)

const INTENT = `# Checkpoint test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
`

// A started session with one planned step and a green stub gate. In the tracked
// layout the build folder rides the tree, so overwriting intent/settings
// dirties it — checkpoint stages that alongside the step's work.
async function startedGreen(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Checkpoint test', '--slug', 'checkpoint-test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

describe('checkpoint', () => {
  it('commits pending work, records the SHA, flips the step, stays at the boundary', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n') // dirty the tracked tree
    const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(true)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/step 1 [0-9a-f]{40}/)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
    // The SHA is shortened to exactly 9 hex chars — a full 40-char SHA here
    // would mean the slice was dropped.
    expect(stdout).toMatch(/step 1 checkpointed — [0-9a-f]{9}\. Back at the boundary/)
  })

  it('refreshes a stale info/exclude so an in-flight control file never rides the step commit — D33 (info-exclude)', async () => {
    const dir = await startedGreen()
    // A session started by an older plumbbob, upgraded mid-build: its exclude
    // predates the control file the new version writes.
    const exclude = gitPath(dir, 'info/exclude')
    const stale = readFileSync(exclude, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '.plumbbob/builds/*/handoff.json')
    writeFileSync(exclude, stale.join('\n'))
    writeFileSync(handoffPath(dir), '{}\n')
    writeFileSync(join(dir, 'work.txt'), 'pending\n')

    const { code } = await captureIoAsync(() => checkpoint(dir, ['1']))

    expect(code).toBe(0)
    // stageAll's `-A` would have swept the handoff ledger into the commit.
    const tracked = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' })
    expect(tracked).not.toContain('handoff.json')
    expect(tracked).toContain('work.txt') // the step's actual work still landed
  })

  it('flips the build-log mirror to ☑ and returns Current step to the boundary — D69 (cli-owned-buildlog)', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain('- ☑ 1. First')
    expect(log).toContain('**Current step:** none (at the boundary)')
    expect(log).not.toContain('- ☐ 1. <step>')
  })

  it('titles the commit subject `type(scope): description` from intent.md, keeping plumbbob/step in the body — D68 (conventional-subjects)', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n') // ensure a fresh commit is made
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    // Conventional subject: scope is the build slug, type defaults to `feat`, the
    // sentence-case title is de-capitalised. No `plumbbob`/`step N` in the subject.
    expect(subject).toBe('feat(checkpoint-test): first')
    expect(subject).not.toMatch(/plumbbob|step 1/)
    const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
    expect(body).toContain('plumbbob step 1') // the relocated identifier keeps `git log --grep` working
  })

  it('composes a deterministic body — marker, done-when, seam, diffstat — when no --body is given', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
    expect(body.startsWith('plumbbob step 1')).toBe(true) // the marker leads the body
    expect(body).toContain('done when: a works.')
    expect(body).toContain('seam: src/a.ts')
    expect(body).toContain('work.txt') // the staged diffstat names the changed file
  })

  it('falls back to `chore(scope): checkpoint` when intent carries no title', async () => {
    const dir = await startedGreen()
    writeFileSync(intentPath(dir), '# Untitled steps\n\n## Steps\n\n1. [ ] — **done when:** a works.\n')
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    expect(subject).toBe('chore(checkpoint-test): checkpoint')
  })

  // The scope fallback chain: title-scope → build-default `**Scope:**`
  // → build slug → bare. The slug rung is already pinned by the tests above (no
  // `**Scope:**` field — an intent without the header keeps the slug-scope
  // behavior); these pin the other rungs.
  describe('the scope fallback chain — D68 (conventional-subjects)', () => {
    it("a step's own `(scope)` prefix wins over the build-default `**Scope:**` header", async () => {
      const dir = await startedGreen()
      writeFileSync(
        intentPath(dir),
        '# Checkpoint test\n\n**Scope:** build-default\n\n## Steps\n\n1. [ ] fix(widget): correct it — **done when:** a works.\n   - seam: `src/a.ts`\n',
      )
      writeFileSync(join(dir, 'work.txt'), 'pending\n')
      await captureIoAsync(() => checkpoint(dir, ['1']))
      const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('fix(widget): correct it')
    })

    it('a scopeless title falls to the `**Scope:**` header ahead of the build slug', async () => {
      const dir = await startedGreen()
      writeFileSync(
        intentPath(dir),
        '# Checkpoint test\n\n**Scope:** build-default\n\n## Steps\n\n1. [ ] First — **done when:** a works.\n   - seam: `src/a.ts`\n',
      )
      writeFileSync(join(dir, 'work.txt'), 'pending\n')
      await captureIoAsync(() => checkpoint(dir, ['1']))
      const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('feat(build-default): first')
    })

    it('an unfilled `**Scope:**` placeholder parses as absent and falls to the slug rung', async () => {
      const dir = await startedGreen()
      writeFileSync(
        intentPath(dir),
        '# Checkpoint test\n\n**Scope:** <scope>\n\n## Steps\n\n1. [ ] First — **done when:** a works.\n   - seam: `src/a.ts`\n',
      )
      writeFileSync(join(dir, 'work.txt'), 'pending\n')
      await captureIoAsync(() => checkpoint(dir, ['1']))
      const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('feat(checkpoint-test): first') // the placeholder is absent — slug wins
    })

    it('the `--plan` commit subject uses the same build-default `**Scope:**` header', async () => {
      const dir = await startedGreen()
      writeFileSync(
        intentPath(dir),
        '# Checkpoint test\n\n**Scope:** build-default\n\n## Steps\n\n1. [ ] First — **done when:** a works.\n   - seam: `src/a.ts`\n',
      )
      await captureIoAsync(() => checkpoint(dir, ['--plan']))
      const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('chore(build-default): plan')
    })
  })

  it("appends a dated history line to the build-log's Log, naming the step", async () => {
    const dir = await startedGreen()
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toMatch(/- \d{4}-\d{2}-\d{2} — step 1 checkpointed · [0-9a-f]{9} — First/)
  })

  it('whitelists its own staged artifact writes — no scope-drift warning (step 7)', async () => {
    const dir = await startedGreen()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n') // matches the step's `src/a.ts` seam
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    // The build folder (intent.md, build-log.md) is staged too, but it lives under
    // `.plumbbob/` and must never read as drift.
    expect(stderr).not.toContain('outside step')
  })

  it('warns (but still commits) when staged work reaches outside the step seam', async () => {
    const dir = await startedGreen()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n')
    writeFileSync(join(dir, 'stray.ts'), 'out of seam\n') // not in `src/a.ts`, not artifact
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0) // guidance, not a gate — the checkpoint still lands
    expect(stderr).toContain("outside step 1's seam")
    expect(stderr).toContain('stray.ts')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]') // committed despite the drift
  })

  it('clears the entry stamp alongside STEP/SEAM — the next build re-stamps — D64 (approval-latch)', async () => {
    const dir = await startedGreen()
    writeFileSync(tickPath(dir), '4\n') // as `build <n>` stamps when the ledger is live
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    const { code } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(existsSync(tickPath(dir))).toBe(false)
    // The stamp is excluded control — stageAll must not have swept it into the commit.
    const names = execFileSync('git', ['show', '--pretty=format:', '--name-only', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
    })
    expect(names).not.toContain('TICK')
  })

  it('refuses on a red check', async () => {
    const dir = await startedGreen()
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'false' }))
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('check failed')
  })

  it('refuses distinctly when the gate itself breaks (checkride exit 2)', async () => {
    const dir = await startedGreen()
    writeFileSync(settingsPath(dir), JSON.stringify({ auto: false })) // no check key → checkride
    writeFileSync(join(dir, 'checkride.config.json'), '{not json')
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('gate itself broke')
  })

  it('resolves the first undone step when none is given (clean tree records HEAD)', async () => {
    const dir = await startedGreen()
    const { code } = await captureIoAsync(() => checkpoint(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
  })

  it('refuses with no active session — and says so, not some later error', async () => {
    const { code, stderr } = await captureIoAsync(() => checkpoint(makeTempRepo(), ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })

  it('refuses when no step can be resolved — all steps already done', async () => {
    const dir = await startedGreen()
    writeFileSync(intentPath(dir), '# Done\n\n## Steps\n\n1. [x] First — **done when:** a works.\n')
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('no step to checkpoint')
  })

  it('prefers the explicit arg — multi-digit — over the first undone step', async () => {
    const dir = await startedGreen()
    writeFileSync(
      intentPath(dir),
      '# Two\n\n## Steps\n\n1. [ ] First — **done when:** a.\n10. [ ] Tenth — **done when:** j.\n',
    )
    await captureIoAsync(() => checkpoint(dir, ['10']))
    const intent = readFileSync(intentPath(dir), 'utf8')
    expect(intent).toContain('10. [x]')
    expect(intent).toContain('1. [ ]')
  })

  it('does not mistake digits inside a -m message for the step number', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['-m', 'fix part 2']))
    expect(code).toBe(0)
    expect(stdout).toContain('step 1 checkpointed')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    expect(subject).toBe('fix part 2')
  })

  it('reads the in-flight STEP file (trailing newline and all) when no arg is given', async () => {
    const dir = await startedGreen()
    writeFileSync(
      intentPath(dir),
      '# Two\n\n## Steps\n\n1. [ ] First — **done when:** a.\n2. [ ] Second — **done when:** b.\n',
    )
    writeFileSync(stepPath(dir), '2\n') // as `build` writes it — must survive the trim
    await captureIoAsync(() => checkpoint(dir, []))
    const intent = readFileSync(intentPath(dir), 'utf8')
    expect(intent).toContain('2. [x]')
    expect(intent).toContain('1. [ ]')
  })

  it('records the existing HEAD without a new commit when the tree is truly clean', async () => {
    const dir = await startedGreen()
    execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' })
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'work already committed'], { stdio: 'ignore' })
    const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const { code } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    const after = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    expect(after).toBe(head) // no synthetic commit on a clean tree
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toContain(`step 1 ${head}`)
  })

  it('omits done-when and seam from the fallback body when the step declares neither', async () => {
    const dir = await startedGreen()
    writeFileSync(intentPath(dir), '# Bare\n\n## Steps\n\n1. [ ] Bare step\n')
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
    expect(body).not.toContain('done when:')
    expect(body).not.toContain('seam:')
    expect(body).toContain('work.txt') // the diffstat still lands
  })

  it('reads a numeric -m value as the message, never the step', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    const { code } = await captureIoAsync(() => checkpoint(dir, ['-m', '2']))
    expect(code).toBe(0)
    // The step resolves from intent (step 1); the "2" lands as the commit subject.
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/step 1 [0-9a-f]{40}/)
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
    expect(subject).toBe('2')
  })

  it('--body on an interactive TTY degrades to the fallback body instead of blocking', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const hadTty = stdin.isTTY
    stdin.isTTY = true // a terminal never sends EOF — the read must be skipped, not hung
    try {
      const { code } = await captureIoAsync(() => checkpoint(dir, ['1', '--body']))
      expect(code).toBe(0)
    } finally {
      stdin.isTTY = hadTty
    }
    const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
    expect(body).toContain('done when: a works.') // the deterministic fallback took over
  })

  it('warns when the intent flip fails, instead of letting the dashboard lie', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n')
    chmodSync(intentPath(dir), 0o444) // the flip's write will fail
    try {
      const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
      expect(code).toBe(0) // the checkpoint itself still lands — the SHA is the source of truth
      expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/step 1 [0-9a-f]{40}/)
      expect(stderr).toContain('could not flip step 1')
    } finally {
      chmodSync(intentPath(dir), 0o644)
    }
  })

  // Latch row 1 lives here rather than in the subprocess suite below: a child of
  // runCli always gets a piped stdin, so a real TTY row needs the in-process
  // patch (the same plumbing the `--body` TTY test uses).
  it('latch row 1: a TTY stdin is its own approval — allows with no turn since entry — D64 (approval-latch)', async () => {
    const dir = await startedGreen()
    writeFileSync(turnPath(dir), '2\n')
    writeFileSync(tickPath(dir), '2\n')
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const hadTty = stdin.isTTY
    stdin.isTTY = true
    try {
      const { code } = await captureIoAsync(() => checkpoint(dir, ['1']))
      expect(code).toBe(0)
    } finally {
      stdin.isTTY = hadTty
    }
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
  })

  // The plan-approval commit: its own commit, before any step, carrying only
  // the build's scaffold so the first step's diff stays clean.
  describe('--plan', () => {
    it('commits as `chore(scope): plan` with a `plumbbob plan` body marker and records a `plan <sha>` line', async () => {
      const dir = await startedGreen()
      const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['--plan']))
      expect(code).toBe(0)
      expect(stdout).toMatch(/plan committed — [0-9a-f]{9}\./) // short SHA, not the full 40
      const subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('chore(checkpoint-test): plan')
      const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
      expect(body).toContain('plumbbob plan') // the identifier rides the body, not the subject
      expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/plan [0-9a-f]{40}/)
    })

    it('commits only the build folder — not settings.json or code, and no step flip', async () => {
      const dir = await startedGreen()
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
    it("consumes start's entry stamp — a later hand-built diff finds no stale TICK — D64 (approval-latch)", async () => {
      const dir = await startedGreen()
      writeFileSync(tickPath(dir), '2\n') // as `start` stamps when the ledger is live
      const { code } = await captureIoAsync(() => checkpoint(dir, ['--plan']))
      expect(code).toBe(0)
      expect(existsSync(tickPath(dir))).toBe(false)
    })
    // `--body` reads fd 0, which an in-process unit test can't feed — the subprocess
    // integration test (verify.test.ts) covers the plan commit's `--body` path.
  })
})

// The approval latch, driven through the real CLI so each matrix row is proven
// at the process boundary: a runCli child gets a piped (non-TTY) stdin, and the
// tests write TURN/TICK/GRANT directly, standing in for the hook tick and the
// entry stamp. Row 1 (a real TTY) is the in-process test above.
describe('checkpoint (subprocess) — D64 (approval-latch)', () => {
  const LATCH_INTENT = `# Latch test

## Steps

1. [ ] First — **done when:** a works.
2. [ ] Second — **done when:** b works.
`

  // A started fixture with the ledger live and no human turn since entry:
  // TURN == TICK, no grant — the strictest state, refused unless a row above
  // row 5 speaks (the five-row matrix of D64 (approval-latch), as amended by
  // D67 (auto-not-a-grant)). Tests relax exactly the file their row reads.
  function latchedRepo(): string {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Latch test', '--slug', 'latch-test'])
    writeFileSync(intentPath(dir), LATCH_INTENT)
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    writeFileSync(turnPath(dir), '2\n')
    writeFileSync(tickPath(dir), '2\n')
    return dir
  }

  it('row 5: refuses with exit 1 and the pause affordance when no human turn intervened', async () => {
    const dir = latchedRepo()
    const { status, stderr } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(1)
    expect(stderr).toContain('checkpoint refused — no human turn since this step began')
    expect(stderr).toContain('present the diff and the self-review')
    expect(stderr).toContain('`/plumbbob:build --auto`')
    // Nothing landed: the step is still open.
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [ ]')
  })

  it('the latch precedes the check gate — D64 (approval-latch): a latched repo refuses as the pause, not as red', async () => {
    const dir = latchedRepo()
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'false' })) // red gate
    const { status, stderr } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(1)
    expect(stderr).toContain('no human turn since this step began')
    expect(stderr).not.toContain('check failed')
  })

  it('row 4: a human turn since entry allows the land', async () => {
    const dir = latchedRepo()
    writeFileSync(turnPath(dir), '3\n') // the hook ticked after entry
    const { status } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
  })

  it('row 2: a host with no hooks grows no ledger and lands exactly as today (dormant)', async () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Latch test', '--slug', 'latch-test'])
    writeFileSync(intentPath(dir), LATCH_INTENT)
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    const { status } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(0)
  })

  it('row 2: a hand-built diff (no entry stamp) stays guidance-governed', async () => {
    const dir = latchedRepo()
    rmSync(tickPath(dir)) // no `build <n>` ran — TURN alone does not latch
    const { status } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(0)
  })

  it('D67 (auto-not-a-grant): a standing `auto: true` in settings is ignored — checkpoint still refuses', async () => {
    const dir = latchedRepo()
    setLocalSetting(dir, 'auto', true) // a model can write this file, so the latch does not honor it as a grant
    const { status, stderr } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(1)
    expect(stderr).toContain('no longer a grant — D67 (auto-not-a-grant)')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [ ]') // nothing landed
  })

  it('the model-forgeable route is closed but the human-typed one still lands: a one-turn `auto` grant allows — D65 (human-typed-grants)', async () => {
    const dir = latchedRepo()
    writeFileSync(grantPath(dir), 'auto\n')
    const { status } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(0)
  })

  it('row 3: a range grant allows steps at or under its ceiling', async () => {
    const dir = latchedRepo()
    writeFileSync(grantPath(dir), 'range 2\n')
    const { status } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(0)
  })

  it('row 3: a range grant refuses past its ceiling with the top-of-range affordance', async () => {
    const dir = latchedRepo()
    writeFileSync(grantPath(dir), 'range 1\n')
    const { status, stderr } = runCli(dir, ['checkpoint', '2'])
    expect(status).toBe(1)
    expect(stderr).toContain('the range you granted ends at step 1')
    expect(stderr).toContain('run it again to continue')
  })

  it('a malformed GRANT contributes nothing — the latch still refuses — D27 (settings-ladder)', async () => {
    const dir = latchedRepo()
    writeFileSync(grantPath(dir), 'garbage\n')
    const { status, stderr } = runCli(dir, ['checkpoint', '1'])
    expect(status).toBe(1)
    expect(stderr).toContain('no human turn since this step began')
  })

  it("--plan latches on start's stamp: refused same-turn, landed after a human turn", async () => {
    const dir = latchedRepo() // TICK stands in for the stamp `start` writes when TURN exists
    const refused = runCli(dir, ['checkpoint', '--plan'])
    expect(refused.status).toBe(1)
    // The plan refusal speaks plan, not step — there is no diff or self-review yet.
    expect(refused.stderr).toContain('no human turn since `start` stamped this plan')
    expect(refused.stderr).toContain('present the plan')
    writeFileSync(turnPath(dir), '3\n') // the human's next message ticks the ledger
    const landed = runCli(dir, ['checkpoint', '--plan'])
    expect(landed.status).toBe(0)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/plan [0-9a-f]{40}/)
  })
})

// The 2026-08-07 hang: an agent harness hands the CLI a socket for stdin, not
// a TTY or a pipe. `readFileSync(0)` never sees EOF from one, so `--body`
// used to block forever and silently drop the body. `runCliWithSocketStdin`
// gives the child process a real socket so this is proven at the same fd-0
// shape that actually hangs, not just in the pure fd-shape unit tests.
describe('checkpoint (subprocess) — --body on a socket stdin', () => {
  it('refuses instead of blocking, naming the heredoc form, and lands nothing', async () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Checkpoint test', '--slug', 'checkpoint-test'])
    writeFileSync(intentPath(dir), INTENT)
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    writeFileSync(join(dir, 'work.txt'), 'pending\n')

    const { status, stderr } = await runCliWithSocketStdin(dir, ['checkpoint', '1', '--body'])

    expect(status).toBe(1)
    expect(stderr).toContain('--body refuses')
    expect(stderr).toContain("<<'BODY'")
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [ ]') // nothing landed
  })

  it('the plan commit refuses the same way', async () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Checkpoint test', '--slug', 'checkpoint-test'])

    const { status, stderr } = await runCliWithSocketStdin(dir, ['checkpoint', '--plan', '--body'])

    expect(status).toBe(1)
    expect(stderr).toContain('--body refuses')
    expect(stderr).toContain("<<'BODY'")
  })
})

describe('checkpoint — the self-use stats receipt (research/07 2b)', () => {
  it('bumps redChecks on a red gate, not on harness breakage', async () => {
    const dir = await startedGreen()
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'false' }))
    await captureIoAsync(() => checkpoint(dir, ['1']))
    await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(readStats(dir)['1']?.redChecks).toBe(2)
  })

  it('bumps driftWarnings when the seam warning fires', async () => {
    const dir = await startedGreen()
    writeFileSync(join(dir, 'stray.ts'), 'out of seam\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(readStats(dir)['1']?.driftWarnings).toBe(1)
  })

  it('stamps landedAt on land and rides the compact suffix on the Log line', async () => {
    const dir = await startedGreen()
    stampStepStat(dir, 'checkpoint-test', 1, 'startedAt', new Date(Date.now() - 120_000).toISOString())
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'false' }))
    await captureIoAsync(() => checkpoint(dir, ['1'])) // one red attempt
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n') // in-seam, so no drift joins the suffix
    const { code } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(readStats(dir)['1']?.landedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toMatch(/step 1 checkpointed · [0-9a-f]{9} — First \(1 red, (<1m|2m)\)/)
  })

  it('adds no suffix to a clean first-try step with no stamps', async () => {
    const dir = await startedGreen()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'in seam\n')
    await captureIoAsync(() => checkpoint(dir, ['1']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toMatch(/step 1 checkpointed · [0-9a-f]{9} — First\n/)
  })
})
