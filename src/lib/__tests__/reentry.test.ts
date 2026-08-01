import { afterEach, describe, expect, it } from 'vitest'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'
import { makeTempDir } from '../../../test/helpers/temp-repo.ts'
import { runCheck } from '../check.ts'
import { gateIsRunningFor, withGateMarker } from '../reentry.ts'

const MARKER = 'PLUMBBOB_GATE_ROOTS'

afterEach(() => {
  delete process.env[MARKER]
})

describe('gateIsRunningFor', () => {
  it('is false in a clean environment', () => {
    expect(gateIsRunningFor('/repo/a', {})).toBe(false)
  })

  it('is true for a root the marker names', () => {
    expect(gateIsRunningFor('/repo/a', { [MARKER]: '/repo/a' })).toBe(true)
  })

  it('is false for a DIFFERENT root while one is gated', () => {
    // The case a flat "a gate is running" flag gets wrong, and the reason this
    // is scoped by root at all: plumbbob's own suite gates dozens of fixture
    // repos, and when that suite runs UNDER this repo's gate it inherits the
    // marker. A flat flag refused every fixture and turned the whole suite red.
    expect(gateIsRunningFor('/tmp/fixture', { [MARKER]: '/repo/a' })).toBe(false)
  })

  it('matches a root through a relative path or a trailing slash', () => {
    const dir = makeTempDir()
    expect(gateIsRunningFor(`${dir}/`, { [MARKER]: dir })).toBe(true)
    expect(gateIsRunningFor(`${dir}/sub/..`, { [MARKER]: dir })).toBe(true)
  })

  it('reads one root out of several', () => {
    expect(gateIsRunningFor('/repo/b', { [MARKER]: '/repo/a\n/repo/b' })).toBe(true)
    expect(gateIsRunningFor('/repo/c', { [MARKER]: '/repo/a\n/repo/b' })).toBe(false)
  })
})

describe('withGateMarker', () => {
  it('records the root for the body and clears it after', async () => {
    const dir = makeTempDir()
    expect(gateIsRunningFor(dir)).toBe(false)
    const seen = await withGateMarker(dir, () => gateIsRunningFor(dir))
    expect(seen).toBe(true)
    expect(gateIsRunningFor(dir)).toBe(false)
  })

  it('leaves a different root free while one is gated', async () => {
    const gated = makeTempDir()
    const other = makeTempDir()
    const seen = await withGateMarker(gated, () => gateIsRunningFor(other))
    expect(seen).toBe(false)
  })

  it('nests: an inner root does not un-mark the outer one on the way out', async () => {
    const outer = makeTempDir()
    const inner = makeTempDir()
    await withGateMarker(outer, async () => {
      await withGateMarker(inner, () => undefined)
      expect(gateIsRunningFor(outer)).toBe(true)
    })
    expect(gateIsRunningFor(outer)).toBe(false)
  })

  it('clears the marker even when the body throws', async () => {
    const dir = makeTempDir()
    await expect(
      withGateMarker(dir, () => {
        throw new Error('gate blew up')
      }),
    ).rejects.toThrow('gate blew up')
    // A gate that dies mid-run must not poison every later run in this process.
    expect(gateIsRunningFor(dir)).toBe(false)
  })

  it('is what runCheck refuses on — exit 2, and nothing runs', async () => {
    // The marker's contract asserted at the seam that reads it: a repo asked to
    // gate itself inside its own gate answers "the harness is wrong" (2), not
    // "your code is wrong" (1), and spawns nothing on the way to saying so.
    const dir = makeTempDir()
    const { code, stderr } = await captureIoAsync(() => withGateMarker(dir, () => runCheck(dir)))
    expect(code).toBe(2)
    expect(stderr).toContain('inside its own gate')
  })

  it('propagates to a child process, which is where the recursion actually crossed', async () => {
    // The marker lives on the environment, not in a module variable, precisely
    // because the recursion ran through spawned shells and vitest worker forks.
    // A module-level flag would be invisible to every one of them.
    const { execFileSync } = await import('node:child_process')
    const dir = makeTempDir()
    const seen = await withGateMarker(dir, () =>
      execFileSync(process.execPath, ['-p', `process.env.${MARKER} ?? 'unset'`], { encoding: 'utf8' }).trim(),
    )
    expect(seen).toBe(dir)
  })
})
