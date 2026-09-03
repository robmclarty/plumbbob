// `plumbbob abandon`: the third exit from an in-flight step. Checkpoint lands
// the step and revert destroys the work; abandon drops the attempt but keeps the
// working-tree diff exactly where it is. Its only writes are the in-flight
// control markers it clears (STEP, SEAM, TICK, and the step-scoped handoff
// ledger), a build-log line, and the stats receipt: it touches neither the
// working tree nor git nor the intent checkbox, so the step stays planned and
// re-buildable with its diff still in the tree for the human to keep, rework, or
// commit by hand.
//
// A step exit is a boundary crossing, so abandon honors the same approval latch
// as checkpoint. That is not decoration: abandon clears the entry stamp the
// latch reads, so an unlatched abandon followed by a same-turn checkpoint would
// hand that checkpoint an unlatched land, the same side door the settings-auto
// case closed. Every deletion routes through the sidecar helpers that own
// control-state clears; abandon itself never calls the raw fs deleters.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import {
  bumpStepStat,
  buildLogPath,
  clearHandoff,
  clearSeam,
  clearStep,
  clearTick,
  hasSession,
  intentPath,
  resolveBuild,
  stepPath,
} from '../lib/sidecar.ts'
import { checkLatch } from '../lib/latch.ts'
import { abandonLogLine, appendToSection } from '../lib/buildlog.ts'
import { parseSteps } from '../lib/orient.ts'
import { ending, notice, transition } from '../lib/notice.ts'
import { driverPointer } from './handoff.ts'

/**
 * Drop the in-flight step while keeping its work: latch, clear the markers,
 * record the event, and return to the boundary.
 *
 * Exit 1 on any refusal: no session, no step in flight, or a latched boundary
 * (no human turn since the step began). Each refusal says what unblocks it.
 */
export function abandon(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }

  const { build: slug } = resolveBuild(root, args)

  const step = readInFlightStep(root, slug)
  if (step === null) {
    process.stderr.write(
      notice({ fact: 'no step in flight to abandon', detail: ['abandon drops an in-flight step'] }),
    )
    return 1
  }

  // The same latch checkpoint runs, keyed on this step: a step exit is a boundary
  // crossing, and abandon clears the entry stamp, so an unlatched abandon would
  // hand a same-turn checkpoint an unlatched land. Refusal is the pause, not an
  // error: exit 1 and hand the turn back.
  const latch = checkLatch(root, step)
  if (!latch.allow) {
    process.stderr.write(abandonPause(latch.reason, step))
    return 1
  }

  // Keep the work: clear only the in-flight control markers, never the tree,
  // git, or the intent checkbox. The step stays [ ] and re-buildable.
  clearStep(root, slug)
  clearSeam(root, slug)
  clearTick(root, slug)
  clearHandoff(root, slug)

  bumpStepStat(root, slug, step, 'abandons')
  logAbandon(root, slug, step)

  // A step exit: with the step back at `[ ]` and its markers gone, the pointer
  // aims forward from the boundary, at the very step just dropped.
  process.stdout.write(
    ending({
      lead: transition({
        label: 'Abandoned',
        fact: `Step ${step}`,
        detail: ['work kept in the tree', 'the step stays planned'],
      }),
      pointer: driverPointer(root, slug),
    }),
  )
  return 0
}

/**
 * The abandon-worded pause affordance.
 *
 * abandon runs checkpoint's latch, but the pause it hits is its own: the wording
 * names the verb the human ran and the one self-approval that lands it, rather
 * than sending them back to `checkpoint`. A `ceiling` reason (a range grant the
 * step overran) keeps the range wording.
 */
function abandonPause(reason: 'no-turn' | 'ceiling', step: number): string {
  if (reason === 'ceiling') {
    return notice({
      fact: 'abandon refused',
      detail: [`step ${step} is past the range you granted`],
      remedy: 'pause here, then run it again to continue',
    })
  }
  // The fact rides the register; the paragraph under it stays, because the
  // pause affordance is an explanation, not a one-liner, and it mirrors the
  // one the checkpoint latch prints.
  return `${notice({ fact: 'abandon refused', detail: ['no human turn since this step began'] })}A step exit crosses the same boundary as a checkpoint, so abandon honors the same pause: end the
turn, and the human's approval on their next turn is what lets it land. (An explicit
\`/plumbbob:build --auto\` or a step range in the human's own prompt is the only self-approval.)
`
}

/**
 * The in-flight STEP number from the marker, or null when none is in flight.
 */
function readInFlightStep(root: string, slug: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, slug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}

/**
 * Append the abandon line to the build-log's `## Log`, the first non-checkpoint
 * event the log records.
 *
 * Best-effort like every build-log write: a missing or odd log never fails an
 * abandon, whose real record is the cleared markers and the stats bump.
 */
function logAbandon(root: string, slug: string | null, step: number): void {
  try {
    const path = buildLogPath(root, slug)
    const date = new Date().toISOString().slice(0, 10)
    const line = abandonLogLine(date, step, titleForStep(root, slug, step))
    const updated = appendToSection(readFileSync(path, 'utf8'), 'Log', line)
    if (updated !== null) {
      writeFileSync(path, updated)
    }
  } catch {
    // best-effort ledger; never fail an abandon over the build-log.
  }
}

/**
 * The step's title from intent.md, or null when absent or unreadable.
 */
function titleForStep(root: string, slug: string | null, step: number): string | null {
  try {
    return parseSteps(readFileSync(intentPath(root, slug), 'utf8')).find((s) => s.n === step)?.title ?? null
  } catch {
    return null
  }
}
