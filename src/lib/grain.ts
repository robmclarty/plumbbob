// The grain: how coarsely a plan cuts its steps. `fine` suits a model with a
// small window, `coarse` a frontier model or a step run as a workflow, and
// `default` is the plan as it was cut before the setting existed. The grain
// follows the model and the ranges follow the person, so no grain moves a stop
// and none is a grant.
//
// It is measured by the one thing the CLI can count before a step is built:
// the breadth of its seam. Of the 197 steps in this repo's recorded builds
// whose seams parse, the median names 4 paths and 47% name 3 or fewer, so
// `fine` takes 3 at most and half of what was planned here already fits it.
//
// A larger step leaves a person's read of its diff worth less, so `coarse`
// puts the weight on the proof instead: there a step's proof opens on a
// command. Both measures are guidance. The plan card names a step cut against
// the grain, beside what it says about that step's seam, and nothing here
// refuses a plan.

import { parseStepProof, parseStepSeam } from './intent.ts'
import { parseSteps } from './orient.ts'
import { resolveString } from './settings.ts'

/** How coarsely a plan cuts its steps, as the `grain` setting names it. */
export type Grain = 'fine' | 'default' | 'coarse'

const GRAINS: ReadonlyArray<Grain> = ['fine', 'default', 'coarse']

/** The most seam entries a step names under the `fine` grain; a `dir/` grant counts as one. */
export const FINE_SEAM_LIMIT = 3

/**
 * Resolve the `grain` setting through the whole ladder: settings.local.json
 * over settings.json, since a developer on a local model sets it for
 * themselves.
 *
 * Any other value reads as `default`: a missing key, a value that is not a
 * string, and a string that names no grain, matched exactly. The first defined
 * rung wins as it does for every setting, so an overlay holding a value that
 * names no grain reads as `default` and the tracked file is not consulted.
 */
export function resolveGrain(root: string): Grain {
  const value = resolveString(root, 'grain', 'default')
  return GRAINS.find((grain) => grain === value) ?? 'default'
}

/** One thing the plan card names about a step cut against the grain. */
export type GrainFinding = {
  readonly step: number
  readonly line: number // the step opener's 1-based line, for the card's link
  readonly kind: 'seam-breadth' | 'proof-in-words'
  // The words after the step's name: `'s seam names 5 paths; the grain is
  // fine, which takes 3 at most.`, or `is proved in words; the grain is
  // coarse, where a proof opens on a command.`
  readonly words: string
}

/**
 * Every grain finding across the plan's undone steps, in step order: under
 * `fine`, a step whose seam names more entries than the limit; under `coarse`,
 * a step whose proof opens on words. Under `default` there are none.
 *
 * Landed steps are skipped, as the seam check skips them. A seam that will not
 * parse draws nothing, since the seam check already names it. Neither does a
 * step with no proof, or one whose proof will not parse (a second `proof:`
 * line, an empty one): only a proof that reads, and reads as words, is proved
 * in words. The older `**done when:**` clause reads as one.
 */
export function grainFindings(intent: string, grain: Grain): GrainFinding[] {
  if (grain === 'default') {
    return []
  }
  const undone = parseSteps(intent).filter((s) => !s.done)
  if (grain === 'fine') {
    return undone.flatMap((s): GrainFinding[] => {
      const parsed = parseStepSeam(intent, s.n)
      if (!parsed.ok || parsed.seam.length <= FINE_SEAM_LIMIT) {
        return []
      }
      const words = `'s seam names ${parsed.seam.length} paths; the grain is fine, which takes ${FINE_SEAM_LIMIT} at most.`
      return [{ step: s.n, line: s.line, kind: 'seam-breadth', words }]
    })
  }
  return undone.flatMap((s): GrainFinding[] => {
    const parsed = parseStepProof(intent, s.n)
    if (!parsed.ok || parsed.proof === null || parsed.proof.command !== null) {
      return []
    }
    return [{ step: s.n, line: s.line, kind: 'proof-in-words', words: 'is proved in words; the grain is coarse, where a proof opens on a command.' }]
  })
}
