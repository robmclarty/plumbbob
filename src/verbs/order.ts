// `plumbbob order <n>…`: write the build order, the sequence to build the
// remaining steps in, as the one numeric line under `## Build order` in
// intent.md. A refined plan appends steps whose numbers say nothing about when
// they land (a step 7 that has to go before step 5), and until this verb the
// human carried that sequence in their head and typed it into every `build`.
// The line is what every next-step picker reads (`status`, `build`,
// `checkpoint`, `handoff`), so the dashboard's `← next`, a bare
// `plumbbob build`, and the card's Next Up agree. The verb validates what a
// hand edit cannot: every number names an undone step, none twice. `--reset`
// drops the line, and the plan reads in document order again. It runs in any
// state, since re-sequencing what comes after the step in flight is the
// mid-step use, and the sidecar sits outside every seam.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { activeBuild, hasSession, intentPath } from '../lib/sidecar.ts'
import { clearBuildOrder, orderSteps, parseSteps, setBuildOrder } from '../lib/orient.ts'
import { ending, notice, transition } from '../lib/notice.ts'
import { driverPointer } from './handoff.ts'

/**
 * Set the build order to the given step numbers, the rest of the undone steps
 * following in document order, or clear it with `--reset`.
 *
 * The line written is the whole remaining sequence, so a cold reader of
 * intent.md sees every undone step and not only the ones re-sequenced.
 * Refuses (exit 1) with no session, no numbers, a token that is not a number,
 * a number the plan lacks, a repeated number, or a step already checkpointed.
 */
export function order(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(
      notice({ fact: 'no active session', detail: ['no plan to order'], remedy: 'plumbbob start "<title>"' }),
    )
    return 1
  }
  const path = intentPath(root)
  const intent = readFileSync(path, 'utf8')

  if (args.includes('--reset')) {
    writeFileSync(path, clearBuildOrder(intent))
    process.stdout.write(
      ending({
        lead: transition({ label: 'Build order', fact: 'document order' }),
        pointer: driverPointer(root, activeBuild(root)),
      }),
    )
    return 0
  }

  // Numbers arrive space- or comma-separated: `order 7 8 5` and `order 7,8,5`
  // read the same, since the line they write is the comma form.
  const tokens = args
    .filter((a) => !a.startsWith('--'))
    .flatMap((a) => a.split(','))
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) {
    process.stderr.write(
      notice({
        fact: 'order needs step numbers',
        detail: ['the undone steps, in the sequence to build them'],
        remedy: 'plumbbob order 7 8 5, or plumbbob order --reset for document order',
      }),
    )
    return 1
  }
  const stray = tokens.find((t) => !/^\d+$/.test(t))
  if (stray !== undefined) {
    process.stderr.write(notice({ fact: `\`${stray}\` is not a step number`, remedy: 'plumbbob order 7 8 5' }))
    return 1
  }
  const given = tokens.map(Number)
  const steps = parseSteps(intent)
  const planned = steps.map((s) => s.n)
  const unknown = given.find((n) => !planned.includes(n))
  if (unknown !== undefined) {
    process.stderr.write(
      notice({
        fact: `no step ${unknown} in the plan`,
        detail: [planned.length === 0 ? 'no steps planned yet' : `planned: ${planned.join(', ')}`],
        remedy: 'fix the number, or /plumbbob:step to add the step first',
      }),
    )
    return 1
  }
  const repeat = given.find((n, i) => given.indexOf(n) !== i)
  if (repeat !== undefined) {
    process.stderr.write(notice({ fact: `step ${repeat} is listed twice`, remedy: 'list each step once' }))
    return 1
  }
  const landed = given.find((n) => steps.find((s) => s.n === n)?.done === true)
  if (landed !== undefined) {
    process.stderr.write(
      notice({
        fact: `step ${landed} is already checkpointed`,
        detail: ['the order sequences what is left'],
        remedy: 'list the undone steps only',
      }),
    )
    return 1
  }

  const full = orderSteps(steps, given)
    .filter((s) => !s.done)
    .map((s) => s.n)
  writeFileSync(path, setBuildOrder(intent, full))
  // The pointer reads the plan back from disk, so it already follows the
  // order just written: back at the step in flight, or forward from the
  // boundary to the first step in the new sequence.
  process.stdout.write(
    ending({
      lead: transition({ label: 'Build order', fact: full.join(', ') }),
      pointer: driverPointer(root, activeBuild(root)),
    }),
  )
  return 0
}
