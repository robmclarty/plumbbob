import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { status } from '../status.ts'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { buildDir, checkpointsPath, detailPath, grantPath, markSpike, pausePath, sidecarDir, stepPath, stopPath } from '../../lib/sidecar.ts'
import { formatVerbHelp } from '../../cli-core.ts'
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

describe('status --questions — D118 (questions-table)', () => {
  it('prints the open questions as the plan card tables them, and nothing else', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Ask first', '--slug', 'ask-first']))
    const intent = join(buildDir(dir, 'ask-first'), 'intent.md')
    writeFileSync(
      intent,
      '# Ask first\n\n## Open questions\n\n- <a id="q1"></a>**Q1 (slug)**: Which one?, *resolve by:* decide\n  - *plain:* It matters. A lot.\n  - *lean:* The first.\n',
    )
    const { code, stdout } = captureIo(() => status(dir, ['--questions']))
    expect(code).toBe(0)
    expect(stdout).toBe(
      [
        '**Open questions**: **1** to answer',
        '',
        '| Question | Why it matters | Lean |',
        '| --- | --- | --- |',
        '| **Q1**: [Which one?](.plumbbob/builds/ask-first/intent.md#L5) | It matters | The first |',
        '',
        '',
      ].join('\n'),
    )
    expect(stdout).not.toContain('next →') // the table alone, no dashboard
  })

  it('says so when the plan holds no open question', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Ask first', '--slug', 'ask-first']))
    expect(captureIo(() => status(dir, ['--questions'])).stdout).toBe('plumbbob: no open questions in this plan\n')
  })

  it('prints the Deferred table beneath the questions table, and alone when every open question is deferred — D120 (deferred-questions)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Ask first', '--slug', 'ask-first']))
    const intent = join(buildDir(dir, 'ask-first'), 'intent.md')
    const deferred = '- <a id="q2"></a>**Q2 (budget)**: How fast?, *deferred:* 2026-10-31, until step 4\n'
    writeFileSync(intent, `# Ask first\n\n## Open questions\n\n- <a id="q1"></a>**Q1 (slug)**: Which one?, *resolve by:* decide\n${deferred}`)
    expect(captureIo(() => status(dir, ['--questions'])).stdout).toBe(
      [
        '**Open questions**: **1** to answer · 1 deferred',
        '',
        '| Question | Why it matters | Lean |',
        '| --- | --- | --- |',
        '| **Q1**: [Which one?](.plumbbob/builds/ask-first/intent.md#L5) | not given | no lean proposed |',
        '',
        '**Deferred**: 1 left to the work',
        '',
        '| Deferred | Why it matters | Until |',
        '| --- | --- | --- |',
        '| **Q2**: [How fast?](.plumbbob/builds/ask-first/intent.md#L6) | not given | step 4 |',
        '',
        '',
      ].join('\n'),
    )
    writeFileSync(intent, `# Ask first\n\n## Open questions\n\n${deferred}`)
    expect(captureIo(() => status(dir, ['--questions'])).stdout).toBe(
      '**Deferred**: 1 left to the work\n\n| Deferred | Why it matters | Until |\n| --- | --- | --- |\n| **Q2**: [How fast?](.plumbbob/builds/ask-first/intent.md#L5) | not given | step 4 |\n\n',
    )
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
    expect(stdout).toContain('next → run range 2 of 2 — `/plumbbob:run` (steps 2-3)')
  })

  it("reads a section filled in from the template: the guidance is the reader's, every step in one range", async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Filled', '--slug', 'filled']))
    const path = join(buildDir(dir, 'filled'), 'intent.md')
    // Fill the scaffold the way the plan skill does: real steps, and the
    // placeholder item replaced, the template's italic guidance left in place.
    const steps = RANGED.slice(RANGED.indexOf('1. [x]'), RANGED.indexOf('\n## Build ranges'))
    const ranges = RANGED.slice(RANGED.indexOf('1. `/plumbbob:build 1`'))
    const filled = readFileSync(path, 'utf8')
      .replace(/^1\. \[ \] feat: <step>[\s\S]*?(?=\n## Build order)/m, steps)
      .replace(/^1\. `\/plumbbob:build <N-M>`[\s\S]*?(?=\n## Open questions)/m, ranges)
    expect(filled).toContain('*(Where the build stops for a human call')
    writeFileSync(path, filled)
    const { stdout } = captureIo(() => status(dir))
    expect(stdout).toContain(['  ranges  1 of 2 done', '  ✓ 1  /plumbbob:build 1', '  ▸ 2  /plumbbob:build 2-3 · opus   ← next'].join('\n'))
    expect(stdout).not.toContain('⚠')
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

describe('status — --run prints the run a /plumbbob:run invocation names — D98 (card-names-the-run)', () => {
  const RUN_INTENT = [
    '# Runs',
    '',
    '## Steps',
    '',
    '1. [x] First — **done when:** ok',
    '   - seam: `src/a.ts`',
    '2. [ ] Second — **done when:** ok',
    '   - seam: `src/b.ts`',
    '3. [ ] Third — **done when:** ok',
    '   - seam: `src/c.ts`',
    '4. [ ] Fourth — **done when:** ok',
    '   - seam: `src/d.ts`',
    '',
    '## Build ranges',
    '',
    "1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the schema",
    '2. `/plumbbob:build 2-3`, **stop:** review the parser',
    '   - model: opus',
    "3. `/plumbbob:build 4`, **stop:** at step 4's pause, pick the label",
    '',
  ].join('\n')

  async function runSession(intent = RUN_INTENT): Promise<string> {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Runs', '--slug', 'runs']))
    writeFileSync(join(buildDir(dir, 'runs'), 'intent.md'), intent)
    return dir
  }

  const HEADER = ["run  range 2 of 3 · steps 2-3 · ends at step 3's boundary", '     stop: review the parser']

  it('prints the header above the dashboard, naming the grant the hook minted', async () => {
    const dir = await runSession()
    writeFileSync(grantPath(dir), 'steps 2-3\n')
    const { code, stdout } = captureIo(() => status(dir, ['--run', '']))
    expect(code).toBe(0)
    expect(stdout.startsWith([...HEADER, '     grant: steps 2-3', '', 'PlumbBob — Runs   [DESIGN]'].join('\n'))).toBe(true)
    expect(stdout).toContain('▸ 2  Second   ← requested')
    expect(stdout).toContain('next → run range 2 of 3 — `/plumbbob:run` (steps 2-3)')
  })

  it('names range N, and says when the grant is missing or unlike the run', async () => {
    const dir = await runSession()
    expect(captureIo(() => status(dir, ['--run', '2'])).stdout).toContain([...HEADER, '     grant: none'].join('\n'))
    writeFileSync(grantPath(dir), 'range 3\n') // a hook from before step lists
    expect(captureIo(() => status(dir, ['--run', '2'])).stdout).toContain('     grant: range 3, unlike the run')
    // The typed number never reached the injection: the header resolved the next range, the hook the typed one.
    writeFileSync(grantPath(dir), 'steps 4\n')
    expect(captureIo(() => status(dir, ['--run', '$ARGUMENTS'])).stdout).toContain('     grant: steps 4, unlike the run')
    rmSync(grantPath(dir), { force: true })
    const bare = captureIo(() => status(dir, ['--run', '3'])).stdout
    expect(bare).toContain("run  range 3 of 3 · step 4 · ends at step 4's pause\n     stop: at step 4's pause, pick the label\n     grant: none, as a bare range builds to its pause")
    expect(bare).toContain('▸ 4  Fourth   ← requested')
  })

  it('reads a flag with no value as a run with nothing after the verb', async () => {
    const dir = await runSession()
    expect(captureIo(() => status(dir, ['--run'])).stdout).toBe(captureIo(() => status(dir, ['--run', ''])).stdout)
  })

  it('prints no header for a refusal, only the dashboard with the refusal as its pointer', async () => {
    const dir = await runSession()
    const landed = captureIo(() => status(dir, ['--run', '1'])).stdout
    expect(landed).not.toContain('run  range')
    expect(landed).toContain('← next')
    expect(landed).toContain('next → run range 2 of 3 — `/plumbbob:run` (steps 2-3; range 1 of 3 has landed)')
    expect(captureIo(() => status(dir, ['--run', '9'])).stdout).toContain('(steps 2-3; the plan has no range 9)')
    expect(captureIo(() => status(dir, ['--run', '2-3'])).stdout).toContain('(steps 2-3; a run names one range)')
    writeFileSync(stepPath(dir, 'runs'), '4\n')
    expect(captureIo(() => status(dir, ['--run', '2'])).stdout).toContain(
      'next → finish step 4 — `/plumbbob:verify` (or `/plumbbob:abandon` it; a run names range 3 of 3, which holds it)',
    )
    rmSync(stepPath(dir, 'runs'), { force: true })
    markSpike(dir, 'runs')
    expect(captureIo(() => status(dir, ['--run', ''])).stdout).toContain('next → close the spike — `plumbbob spike done`')
  })

  it('prints no header for a plan without ranges, only the pointer that says to cut them', async () => {
    const dir = await runSession(RUN_INTENT.replace(/## Build ranges[\s\S]*$/, ''))
    const out = captureIo(() => status(dir, ['--run', ''])).stdout
    expect(out).not.toContain('run  range')
    expect(out).toContain('next → cut the ranges — `/plumbbob:refine ranges` (the plan declares none; `/plumbbob:build` builds step 2 alone)')
  })

  it('renders exactly as before without the flag, and with --invoked', async () => {
    const dir = await runSession()
    writeFileSync(grantPath(dir), 'steps 2-3\n')
    const plain = captureIo(() => status(dir)).stdout
    expect(plain).not.toContain('run  range')
    expect(plain).toContain('next → run range 2 of 3 — `/plumbbob:run` (steps 2-3)')
    expect(captureIo(() => status(dir, ['--invoked', ''])).stdout).toBe(plain)
    expect(captureIo(() => status(dir, ['--invoked', '3'])).stdout).toContain('▸ 3  Third   ← requested')
  })

  it('composes with --build, whichever order the flags arrive in', async () => {
    const dir = await runSession()
    expect(captureIo(() => status(dir, ['--build', 'runs', '--run', '3'])).stdout).toContain('run  range 3 of 3')
    expect(captureIo(() => status(dir, ['--run', '3', '--build', 'runs'])).stdout).toContain('run  range 3 of 3')
  })

  /** RUN_INTENT with range 2 landed and its stop card rendered, waiting for its reply. */
  async function atCard(intent = RUN_INTENT): Promise<string> {
    const dir = await runSession(intent.replace('2. [ ] Second', '2. [x] Second').replace('3. [ ] Third', '3. [x] Third'))
    writeFileSync(checkpointsPath(dir, 'runs'), 'step 3 abc1234\n')
    writeFileSync(detailPath(dir), "# Detail · Range 2 · review the parser\n\n## Summary\n\nIt parses.\n")
    expect(captureIo(() => handoff(dir, ['--stop'])).code).toBe(0)
    return dir
  }

  const WAITING_MOVE = "next → reply to range 2 of 3's stop card (`/plumbbob:run` records it, then runs range 3 of 3)"

  it('marks the range whose stop card waits and names the card as the move, the waiting line staying --run only — D103 (stop-latched)', async () => {
    const dir = await atCard()
    const plain = captureIo(() => status(dir)).stdout
    expect(plain).toContain(
      [
        '  ✓ 2  /plumbbob:build 2-3 · opus   ← stop card waiting',
        '        stop: review the parser',
        '  ▸ 3  /plumbbob:build 4',
        "        stop: at step 4's pause, pick the label",
      ].join('\n'),
    )
    expect(plain.endsWith(`${WAITING_MOVE}\n`)).toBe(true)
    expect(plain).not.toContain('waiting:')
    // What /plumbbob:build injects: the step it asked for keeps the marker, and the card keeps the move.
    const invoked = captureIo(() => status(dir, ['--invoked', '4'])).stdout
    expect(invoked).toContain('  ▸ 4  Fourth   ← requested')
    expect(invoked.endsWith(`${WAITING_MOVE}\n`)).toBe(true)
  })

  it('names a stop card still waiting beneath the grant, and drops it with the tail and the move once the record lands — D102 (settle-in-one-reply)', async () => {
    const dir = await atCard()
    const waiting = captureIo(() => status(dir, ['--run', ''])).stdout
    expect(waiting).toContain(
      [
        "run  range 3 of 3 · step 4 · ends at step 4's pause",
        "     stop: at step 4's pause, pick the label",
        '     grant: none, as a bare range builds to its pause',
        "     waiting: range 2 of 3's stop card, recorded before the run",
        '',
      ].join('\n'),
    )
    expect(waiting).toContain('← stop card waiting')
    // The record clears the detail file and the stamp, so nothing waits after it.
    rmSync(detailPath(dir), { force: true })
    rmSync(stopPath(dir, 'runs'), { force: true })
    for (const out of [captureIo(() => status(dir, ['--run', ''])).stdout, captureIo(() => status(dir)).stdout]) {
      expect(out).not.toContain('waiting')
    }
    expect(captureIo(() => status(dir)).stdout).toContain('next → run range 3 of 3 — `/plumbbob:run` (step 4 to its pause)')
  })

  it('stops naming the card once its range no longer reads as landed', async () => {
    const dir = await atCard()
    // A blocker went into range 2 as step 4, which re-cut range 3 away.
    const recut = readFileSync(join(buildDir(dir, 'runs'), 'intent.md'), 'utf8')
      .replace('`/plumbbob:build 2-3`', '`/plumbbob:build 2-4`')
      .replace(/^3\. `\/plumbbob:build 4`.*$/m, '')
    writeFileSync(join(buildDir(dir, 'runs'), 'intent.md'), recut)
    for (const out of [captureIo(() => status(dir, ['--run', ''])).stdout, captureIo(() => status(dir)).stdout]) {
      expect(out).not.toContain('waiting')
      expect(out).not.toContain("range 2 of 2's stop card")
    }
  })

  it('lists the flag in the verb table', () => {
    expect(formatVerbHelp('status')).toContain('--run "<args>"')
  })
})

describe('status --json prints the state as data', () => {
  const INTENT = [
    '# Data',
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
    '',
    '## Open questions',
    '',
    '- <a id="q1"></a>**Q1 (cache)**: Cache the parse? *resolve by:* decide',
    '  - *plain:* It changes the seam.',
    '  - *lean:* No, parse each time.',
    '',
  ].join('\n')

  type State = {
    readonly schema: string
    readonly state: string
    readonly moves: ReadonlyArray<{ readonly id: string; readonly command: string; readonly typed: boolean; readonly primary: boolean }>
    readonly tasks: ReadonlyArray<{ readonly step: number; readonly subject: string; readonly status: string }>
    readonly questions: ReadonlyArray<Record<string, unknown>>
  }

  async function dataSession(): Promise<string> {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Data', '--slug', 'data']))
    writeFileSync(join(buildDir(dir, 'data'), 'intent.md'), INTENT)
    return dir
  }

  function read(dir: string, args: ReadonlyArray<string> = []): State {
    const { code, stdout } = captureIo(() => status(dir, ['--json', ...args]))
    expect(code).toBe(0)
    expect(stdout.endsWith('\n')).toBe(true)
    expect(stdout.trim().split('\n')).toHaveLength(1)
    return JSON.parse(stdout) as State
  }

  it('names the one move with no session, and nothing else', () => {
    expect(read(makeTempRepo())).toEqual({
      schema: 'plumbbob.status/1',
      state: 'no-session',
      moves: [
        {
          id: 'plan',
          label: 'Plan a build',
          description: 'Frames the goal, the decisions and the steps as a plan you approve before anything is built.',
          command: '/plumbbob:plan',
          typed: false,
          primary: true,
        },
      ],
      tasks: [],
      questions: [],
    })
  })

  it('prints the moves, the range in play and the open questions at a boundary', async () => {
    const state = read(await dataSession())
    expect(state.schema).toBe('plumbbob.status/1')
    expect(state.state).toBe('boundary')
    expect(state.moves.map((m) => [m.id, m.command, m.typed, m.primary])).toEqual([
      ['run', '/plumbbob:run', true, true],
      ['build', '/plumbbob:build 2', false, false],
      ['step', '/plumbbob:step', false, false],
      ['refine', '/plumbbob:refine', false, false],
      ['questions', 'what are the open questions?', false, false],
      ['approve-plan', 'looks good', true, false],
      ['park', '/plumbbob:park', false, false],
    ])
    expect(state.tasks).toEqual([
      { step: 2, subject: 'Step 2 (1 of 2): Second', status: 'pending' },
      { step: 3, subject: 'Step 3 (2 of 2): Third', status: 'pending' },
    ])
    expect(state.questions).toEqual([{ id: 'Q1', question: 'Cache the parse?', why: 'It changes the seam.', lean: 'No, parse each time.', deferred: null }])
  })

  it('reads a step in flight, and its pause once the card has shown', async () => {
    const dir = await dataSession()
    writeFileSync(stepPath(dir, 'data'), '2\n')
    const building = read(dir)
    expect(building.state).toBe('in-flight')
    expect(building.moves[0]).toMatchObject({ id: 'verify', typed: false })
    expect(building.tasks.map((t) => t.status)).toEqual(['in_flight', 'pending'])
    writeFileSync(pausePath(dir, 'data'), '2\n')
    const paused = read(dir)
    expect(paused.state).toBe('paused')
    expect(paused.moves[0]).toMatchObject({ id: 'approve', command: 'looks good', typed: true })
  })

  it('takes the steps from the range --run names', async () => {
    const dir = await dataSession()
    expect(read(dir, ['--run', '2']).tasks.map((t) => t.step)).toEqual([2, 3])
    expect(read(dir, ['--run', '1']).tasks.map((t) => t.step)).toEqual([2, 3])
  })

  it('lists the builds as moves when the session has no cursor', async () => {
    const dir = await dataSession()
    mkdirSync(buildDir(dir, 'second'), { recursive: true })
    writeFileSync(join(buildDir(dir, 'second'), 'intent.md'), '# Second\n')
    writeFileSync(join(sidecarDir(dir), 'STATE'), '')
    const state = read(dir)
    expect(state.state).toBe('no-build')
    expect(state.moves.map((m) => [m.id, m.command, m.typed, m.primary])).toEqual([
      ['use-data', 'plumbbob use data', true, true],
      ['use-second', 'plumbbob use second', true, false],
      ['plan', '/plumbbob:plan', false, false],
    ])
  })

  it('lists the flag in the verb table', () => {
    expect(formatVerbHelp('status')).toContain('--json')
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
