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
import { expandStepList, parseStepList } from '../lib/steplist.ts'
import { ending, notice, printEnding, transition } from '../lib/notice.ts'
import { driverPointer } from './handoff.ts'

/**
 * Set the build order to the given step numbers and spans, the rest of the
 * undone steps following in document order, or clear it with `--reset`.
 *
 * The line written is the whole remaining sequence, each span spelled out, so a
 * cold reader of intent.md sees every undone step and not only the ones
 * re-sequenced. Refuses (exit 1) with no session, no numbers, a token that is
 * neither a number nor a span, a number the plan lacks, a repeated number, or a
 * step already checkpointed.
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
    printEnding(root, {
      tier: 'driver',
      render: 'order',
      text: ending({
        lead: transition({ label: 'Build order', fact: 'document order' }),
        pointer: driverPointer(root, activeBuild(root)),
      }),
    })
    return 0
  }

  // Numbers and spans arrive space- or comma-separated, with or without a space
  // after a comma: `order 7 8 5`, `order 7,8,5`, and `order 1, 6, 2-4, 7, 5`
  // all read, and a span names its steps in place, since the line is a sequence.
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
  const lists = tokens.map(parseStepList)
  const stray = tokens.find((_, i) => lists[i] === null)
  if (stray !== undefined) {
    process.stderr.write(
      notice({ fact: `\`${stray}\` is not a step number or span`, remedy: 'plumbbob order 1, 6, 2-4, 7, 5' }),
    )
    return 1
  }
  const steps = parseSteps(intent)
  const planned = steps.map((s) => s.n)
  const given = expandStepList(
    lists.flatMap((list) => list ?? []),
    (n) => planned.includes(n),
  )
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
  printEnding(root, {
    tier: 'driver',
    render: 'order',
    text: ending({
      lead: transition({ label: 'Build order', fact: full.join(', ') }),
      pointer: driverPointer(root, activeBuild(root)),
    }),
  })
  return 0
}
