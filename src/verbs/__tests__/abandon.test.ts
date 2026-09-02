import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { abandon } from '../abandon.ts'
import { notice } from '../../lib/notice.ts'
import { start } from '../start.ts'
import { build } from '../build.ts'
import {
  buildLogPath,
  handoffPath,
  intentPath,
  readStats,
  seamPath,
  stepPath,
  tickPath,
  turnPath,
} from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { cleanupFixtures, makeFixtureRepo, runCli } from '../../../test/helpers/fixture-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)
afterAll(cleanupFixtures)

const INTENT = `# Abandon test

## Steps

1. [ ] First — **done when:** it works.
   - seam: \`feature.txt\`
2. [ ] Second — **done when:** it also works.
   - seam: \`other.txt\`
`

// A started session with a green stub gate and no turn ledger: the dormant
// state, where the latch stays out of the way and abandon is free to run.
async function startedGreen(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Abandon test', '--slug', 'abandon-test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

describe('abandon', () => {
  it('clears every in-flight marker and keeps the work in the tree', async () => {
    const dir = await startedGreen()
    captureIo(() => build(dir, ['1'])) // in-flight: writes SEAM + STEP
    writeFileSync(tickPath(dir), '2\n') // an entry stamp, as a live ledger would leave
    writeFileSync(handoffPath(dir), '[]\n') // a step-scoped agent ledger
    writeFileSync(join(dir, 'feature.txt'), 'kept\n') // in-seam work, untracked

    const { code, stdout } = captureIo(() => abandon(dir, []))
    expect(code).toBe(0)
    expect(existsSync(stepPath(dir))).toBe(false)
    expect(existsSync(seamPath(dir))).toBe(false)
    expect(existsSync(tickPath(dir))).toBe(false)
    expect(existsSync(handoffPath(dir))).toBe(false)
    // The work is kept: abandon never touches the tree, where revert would have
    // removed this in-seam untracked file.
    expect(readFileSync(join(dir, 'feature.txt'), 'utf8')).toBe('kept\n')
    expect(stdout).toBe(notice({ fact: 'step 1 abandoned', detail: ['work kept in the tree', 'the step stays planned'] }))
  })

  it('leaves the intent checkbox planned — it drops the attempt, not the intention', async () => {
    const dir = await startedGreen()
    captureIo(() => build(dir, ['1']))
    captureIo(() => abandon(dir, []))
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [ ]') // still planned, re-buildable
  })

  it('records the abandon in the build-log and the stats receipt', async () => {
    const dir = await startedGreen()
    captureIo(() => build(dir, ['1']))
    captureIo(() => abandon(dir, []))
    expect(readFileSync(buildLogPath(dir), 'utf8')).toMatch(/step 1 abandoned · work kept in tree — First/)
    expect(readStats(dir)['1']?.abandons).toBe(1)
  })

  it('refuses with no step in flight — abandon drops an in-flight step, it does not rewind', async () => {
    const dir = await startedGreen()
    const { code, stderr } = captureIo(() => abandon(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('no step in flight')
  })

  it('refuses with no active session — and says so', async () => {
    const { code, stderr } = captureIo(() => abandon(makeTempRepo(), []))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})

// The latch runs the same predicate checkpoint does, driven through the real CLI
// so a non-TTY child stdin makes it active. The composed case is the one that
// matters: an abandon must not open a side door for a same-turn checkpoint.
describe('abandon (subprocess) — the latch holds across a step exit', () => {
  const LATCH_INTENT = `# Abandon latch

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`work.txt\`
2. [ ] Second — **done when:** b works.
`

  // A started fixture in flight on step 1 with the ledger live and no human turn
  // since entry: TURN == TICK (build stamped it from TURN), no grant. The
  // strictest latched state.
  function latchedInFlight(): string {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Abandon latch', '--slug', 'abandon-latch'])
    writeFileSync(intentPath(dir), LATCH_INTENT)
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    writeFileSync(turnPath(dir), '2\n')
    runCli(dir, ['build', '1']) // writes STEP=1 + SEAM, stamps TICK=2 from TURN
    return dir
  }

  it('refuses same-turn, and a checkpoint after it still refuses — no unlatched bypass', () => {
    const dir = latchedInFlight()

    const abandoned = runCli(dir, ['abandon'])
    expect(abandoned.status).toBe(1)
    expect(abandoned.stderr).toContain(
      notice({ fact: 'abandon refused', detail: ['no human turn since this step began'] }).trim(),
    )
    // The markers survive the refusal, so the entry stamp the latch reads is
    // still standing and no side door was opened.
    expect(existsSync(stepPath(dir))).toBe(true)
    expect(existsSync(tickPath(dir))).toBe(true)

    const checkpointed = runCli(dir, ['checkpoint', '1'])
    expect(checkpointed.status).toBe(1)
    expect(checkpointed.stderr).toContain('no human turn since this step began')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [ ]') // nothing landed
  })

  it('a human turn since entry lets the abandon land — the markers clear, the work stays', () => {
    const dir = latchedInFlight()
    writeFileSync(join(dir, 'work.txt'), 'kept\n') // in-seam work
    writeFileSync(turnPath(dir), '3\n') // the hook ticked after entry

    const { status } = runCli(dir, ['abandon'])
    expect(status).toBe(0)
    expect(existsSync(stepPath(dir))).toBe(false)
    expect(existsSync(tickPath(dir))).toBe(false)
    expect(readFileSync(join(dir, 'work.txt'), 'utf8')).toBe('kept\n')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [ ]') // stays planned
  })
})
