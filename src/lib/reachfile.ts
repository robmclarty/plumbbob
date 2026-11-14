// A build's `reach.json`: the reads and writes around the pure half in
// src/lib/reach.ts. The file sits beside intent.md and is tracked with it. It
// holds, per step, what `atis reach --json` answered for that step's seam, and
// the version of the atis that answered.
//
// atis is optional. It is looked for on PATH, asked quietly, and believed only
// when it answers in the one shape this build of plumbbob knows. Absent, red,
// slow, or speaking another schema, it leaves no file and no line of output,
// and every verb reads as it did without it. Nothing here refuses anything.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { askAtis } from './check.ts'
import { parseStepSeam } from './intent.ts'
import { parseSteps } from './orient.ts'
import { mergeReach, parseReachAnswer, parseStoredReach, serializeReach, stepsToAsk, type ReachAnswer, type StoredReach } from './reach.ts'
import { buildFolder } from './sidecar.ts'

/** How long `atis --version` may take before the pass gives up, in milliseconds. */
const VERSION_TIMEOUT_MS = 5_000

/** How long one step's `atis reach` may take; the first to run past it ends the pass. */
const REACH_TIMEOUT_MS = 20_000

/** The waits a pass allows atis; a test shortens them. */
export type ReachTimeouts = { readonly versionMs?: number; readonly reachMs?: number }

/** Where a build's `reach.json` lives: in its artifact folder, beside intent.md. */
export function reachJsonPath(root: string, slug?: string | null): string {
  return join(buildFolder(root, slug), 'reach.json')
}

/** The build's stored reach, or null when there is no file or it does not read. */
export function readReach(root: string, slug?: string | null): StoredReach | null {
  try {
    return parseStoredReach(readFileSync(reachJsonPath(root, slug), 'utf8'))
  } catch {
    return null
  }
}

/** The version the atis on PATH reports, or null when it cannot be asked. */
export function atisVersion(root: string, timeoutMs: number = VERSION_TIMEOUT_MS): string | null {
  const call = askAtis(root, ['--version'], timeoutMs)
  const version = call.ok ? call.stdout.trim() : ''
  return version.length > 0 ? version : null
}

/** One step's answer from atis: the answer, nothing usable, or a failure that ends the pass. */
function askStep(root: string, seam: ReadonlyArray<string>, timeoutMs: number): ReachAnswer | 'skip' | 'stop' {
  // The `--` ends atis's flags: a seam path that opens on a dash is a path, never an option.
  const call = askAtis(root, ['reach', '--json', '--', ...seam], timeoutMs)
  if (!call.ok) {
    return call.fatal ? 'stop' : 'skip'
  }
  try {
    return parseReachAnswer(JSON.parse(call.stdout)) ?? 'skip'
  } catch {
    return 'skip'
  }
}

/**
 * Ask atis for the reach of each undone step that has no current answer, and
 * store what it says in the build's `reach.json`.
 *
 * A step is asked when nothing is stored for it, or when its seam is no
 * longer the paths its stored answer was asked for. `only` narrows the pass
 * to one step, the one being entered. With every step current, atis is not
 * run at all. The steps are asked one after another, since the first call
 * pays for atis's scan and the rest read its cache.
 *
 * Silent and best-effort throughout: atis absent, failing, slow, or answering
 * in a shape this does not know writes nothing and prints nothing, and the
 * file is rewritten only when its bytes would change. Never throws.
 */
export function refreshReach(root: string, slug?: string | null, only?: number, timeouts: ReachTimeouts = {}): void {
  try {
    const intent = readFileSync(join(buildFolder(root, slug), 'intent.md'), 'utf8')
    const steps = parseSteps(intent)
    const undone = steps
      .filter((s) => !s.done && (only === undefined || s.n === only))
      .flatMap((s) => {
        const parsed = parseStepSeam(intent, s.n)
        return parsed.ok ? [{ n: s.n, seam: parsed.seam }] : []
      })
    const stored = readReach(root, slug)
    const ask = stepsToAsk(undone, stored)
    if (ask.length === 0) {
      return
    }
    const version = atisVersion(root, timeouts.versionMs ?? VERSION_TIMEOUT_MS)
    if (version === null) {
      return
    }
    const fresh: Record<string, ReachAnswer> = {}
    for (const step of ask) {
      const answer = askStep(root, step.seam, timeouts.reachMs ?? REACH_TIMEOUT_MS)
      if (answer === 'stop') {
        break
      }
      if (answer !== 'skip') {
        fresh[String(step.n)] = answer
      }
    }
    if (Object.keys(fresh).length === 0) {
      return
    }
    const text = serializeReach(
      mergeReach(
        stored,
        version,
        fresh,
        steps.map((s) => s.n),
      ),
    )
    let current: string | null = null
    try {
      current = readFileSync(reachJsonPath(root, slug), 'utf8')
    } catch {
      // no file yet: this pass writes the first one.
    }
    if (current !== text) {
      writeFileSync(reachJsonPath(root, slug), text)
    }
  } catch {
    // The reach is advice from an optional tool: a pass that cannot finish leaves the build as it was.
  }
}
