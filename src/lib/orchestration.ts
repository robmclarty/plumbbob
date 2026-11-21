// Orchestration: who builds a step once the grain has sized it. `host` says
// the host model may hand a step's slices to its own sub-agents, by a workflow
// where the host has one, and `off` is the step built by one model, as every
// step was before the setting existed.
//
// It is a switch and nothing more. The split is prose on the step, a `- note:`
// line the plan skill writes and the build skill reads, so no control flow
// lives in config. The step's contract does not move: its seam still bounds
// what is touched, its proof still says when it is done, and the main session
// still runs the verify tick and writes the one card. A sub-agent returns work
// and can land nothing, so the setting is no grant and the latch never reads
// it.
//
// The other executor, a program bound to the `build` slot, has its own keys
// (`agents` and `agentConfig`) and outranks this one: a step has one author.
//
// Under `host` the plan card also names a wide step that carries no split, as
// guidance beside what it says about the step's seam. The plan skill's passage
// alone left the note out in 3 of the 10 plans the first two sweeps of eval
// c16 cut under `host`, so the card is where the model meets its own plan.

import { posix } from 'node:path'
import { parseStepFields, parseStepSeam } from './intent.ts'
import { parseSteps } from './orient.ts'
import { resolveString } from './settings.ts'

/** Who builds a step, as the `orchestration` setting names it. */
export type Orchestration = 'off' | 'host'

/** The line `status` prints under `host`, which the plan and build skills read. */
export const HOST_ORCHESTRATION_LINE = 'orchestration  host: a step may be built by sub-agents, inside its seam'

/**
 * Resolve the `orchestration` setting through the whole ladder:
 * settings.local.json over settings.json, since it follows the harness a
 * developer runs.
 *
 * Only the exact string `host` turns it on. A missing key, a value that is not
 * a string, and any other string read as `off`. The first defined rung wins as
 * it does for every setting, so an overlay holding `off` turns off a project
 * default of `host`.
 */
export function resolveOrchestration(root: string): Orchestration {
  return resolveString(root, 'orchestration', 'off') === 'host' ? 'host' : 'off'
}

/** One thing the plan card names about a wide step under `host`. */
export type SplitFinding = {
  readonly step: number
  readonly line: number // the step opener's 1-based line, for the card's link
  // The words after the step's name: `'s seam holds 4 slices and no note
  // names the split; orchestration is host, where a wide step carries one.`
  readonly words: string
}

/**
 * The slice a seam entry belongs to: a `dir/` grant is a slice of its own, and
 * a file shares one with its test, so `src/a.js` and `src/a.test.js` (or
 * `src/__tests__/a.test.js`) are one slice. A file's stem is its folder, with
 * any `__tests__/` part dropped, and its name cut at the first dot.
 */
function sliceOf(entry: string): string {
  if (entry.endsWith('/')) {
    return entry
  }
  const dir = posix.dirname(entry).replace(/(^|\/)__tests__$/, '')
  const stem = posix.basename(entry).split('.')[0] ?? ''
  return `${dir}/${stem}`
}

/**
 * Every split finding across the plan's undone steps, in step order: under
 * `host`, a step whose seam holds two slices or more and that carries no
 * `- note:` line. Under `off` there are none.
 *
 * A slice is what `sliceOf` reads from one entry, so a module and its test are
 * one and a `dir/` grant is one. That leaves a single grant holding many
 * slices unnamed: the CLI cannot see what a folder will hold before the step
 * builds it. Landed steps are skipped, as the seam check skips them, and so
 * is a step whose seam or fields will not parse, since the plan checks
 * already name that.
 */
export function splitFindings(intent: string, orchestration: Orchestration): SplitFinding[] {
  if (orchestration === 'off') {
    return []
  }
  return parseSteps(intent)
    .filter((s) => !s.done)
    .flatMap((s): SplitFinding[] => {
      const seam = parseStepSeam(intent, s.n)
      const fields = parseStepFields(intent, s.n)
      if (!seam.ok || !fields.ok || fields.fields.notes.length > 0) {
        return []
      }
      const slices = new Set(seam.seam.map(sliceOf)).size
      if (slices < 2) {
        return []
      }
      const words = `'s seam holds ${slices} slices and no note names the split; orchestration is host, where a wide step carries one.`
      return [{ step: s.n, line: s.line, words }]
    })
}
