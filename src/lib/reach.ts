// A step's reach: the files a change to its seam usually drags along, as atis
// computes it before the step is built. This module is the pure half: it reads
// an answer, keeps the stored file's shape, says which steps still want asking,
// and splits a step's changed files three ways (in the seam, in the reach but
// not the seam, outside both). It reads no disk and spawns nothing; the file
// and the call to atis live in src/lib/reachfile.ts. atis is optional, so
// every reader here answers null rather than throw, and a build with no stored
// reach reads exactly as it did before there was one.

import { matchesSeam } from './intent.ts'

/** One file a change to the asked paths would reach; atis's other keys ride along untouched. */
export type ReachEntry = { readonly path: string } & Readonly<Record<string, unknown>>

/**
 * What `atis reach --json` answers, as far as plumbbob reads it: the paths as
 * asked and the files they reach. Every other key atis wrote is kept as it
 * came, so the stored file holds the answer verbatim.
 */
export type ReachAnswer = {
  readonly schema_version: 1
  readonly kind: 'atis.reach'
  readonly paths: ReadonlyArray<string>
  readonly reach: ReadonlyArray<ReachEntry>
} & Readonly<Record<string, unknown>>

/** A build's `reach.json`: the atis that answered, and one answer per step number. */
export type StoredReach = {
  readonly atis: string
  readonly steps: Readonly<Record<string, ReachAnswer>>
}

/** A step's changed files, split three ways, each list in the order the files came. */
export type PlumbBins = {
  readonly seam: ReadonlyArray<string>
  readonly reach: ReadonlyArray<string>
  readonly out: ReadonlyArray<string>
}

/** A step that may want asking: its number and its seam tokens. */
export type ReachStep = { readonly n: number; readonly seam: ReadonlyArray<string> }

/** Whether a value is a plain object, the only thing a JSON answer or file may be. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one answer from atis, or null when it is not one plumbbob knows.
 *
 * Only `kind: "atis.reach"` at `schema_version: 1` is taken, with `paths` a
 * list of strings and every `reach` entry carrying a string `path`. The value
 * comes back as it was handed in, unknown keys kept. Never throws.
 */
export function parseReachAnswer(raw: unknown): ReachAnswer | null {
  if (!isRecord(raw) || raw['schema_version'] !== 1 || raw['kind'] !== 'atis.reach') {
    return null
  }
  const paths = raw['paths']
  const reach = raw['reach']
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === 'string')) {
    return null
  }
  if (!Array.isArray(reach) || !reach.every((e) => isRecord(e) && typeof e['path'] === 'string')) {
    return null
  }
  return raw as ReachAnswer
}

/**
 * Read a `reach.json`, or null when the text is not one.
 *
 * A step whose stored answer no longer reads is dropped and the rest are
 * kept, so one bad entry costs one step its split and nothing more.
 */
export function parseStoredReach(text: string): StoredReach | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || typeof raw['atis'] !== 'string' || !isRecord(raw['steps'])) {
    return null
  }
  const steps: Record<string, ReachAnswer> = {}
  for (const [key, value] of Object.entries(raw['steps'])) {
    const answer = parseReachAnswer(value)
    if (answer !== null) {
      steps[key] = answer
    }
  }
  return { atis: raw['atis'], steps }
}

/**
 * The bytes `reach.json` holds: two-space JSON with a closing newline, the
 * steps in numeric order and each answer as atis wrote it, so the same
 * answers always write the same file.
 */
export function serializeReach(stored: StoredReach): string {
  const keys = Object.keys(stored.steps).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const steps: Record<string, ReachAnswer> = {}
  for (const key of keys) {
    const answer = stored.steps[key]
    if (answer !== undefined) {
      steps[key] = answer
    }
  }
  return `${JSON.stringify({ atis: stored.atis, steps }, null, 2)}\n`
}

/** A path as the comparison reads it: a leading `./` dropped, a trailing `/` kept. */
function plain(path: string): string {
  return path.replace(/^(\.\/)+/, '')
}

/**
 * Whether the paths an answer was asked for are the step's seam as it stands
 * now: the same set, in any order.
 */
export function sameSeam(paths: ReadonlyArray<string>, seam: ReadonlyArray<string>): boolean {
  const asked = new Set(paths.map(plain))
  const now = new Set(seam.map(plain))
  return asked.size === now.size && [...asked].every((p) => now.has(p))
}

/**
 * The steps atis has yet to answer for: those with no stored answer, and
 * those whose seam is no longer the paths their answer was asked for. A step
 * with an empty seam has nothing to ask about.
 */
export function stepsToAsk(undone: ReadonlyArray<ReachStep>, stored: StoredReach | null): ReadonlyArray<ReachStep> {
  return undone.filter((s) => {
    if (s.seam.length === 0) {
      return false
    }
    const answer = stored?.steps[String(s.n)]
    return answer === undefined || !sameSeam(answer.paths, s.seam)
  })
}

/**
 * The stored answer for a step, only while it still speaks for the step's
 * seam. An answer asked for other paths reads as none, so the pause falls
 * back to the plain seam row instead of splitting on a stale ring.
 */
export function reachFor(stored: StoredReach | null, step: number, seam: ReadonlyArray<string>): ReachAnswer | null {
  const answer = stored?.steps[String(step)]
  return answer !== undefined && seam.length > 0 && sameSeam(answer.paths, seam) ? answer : null
}

/**
 * Split changed files three ways against a step's seam and its reach.
 *
 * A file the seam covers is in the seam even when the reach lists it too; a
 * file the reach lists, by import or by co-change, is in the reach; the rest
 * are out. The caller hands in work-plane paths, plumbbob's own files already
 * left out.
 */
export function binFiles(paths: ReadonlyArray<string>, seam: ReadonlyArray<string>, answer: ReachAnswer): PlumbBins {
  const reached = new Set(answer.reach.map((e) => plain(e.path)))
  const inSeam: string[] = []
  const inReach: string[] = []
  const out: string[] = []
  for (const path of paths) {
    if (matchesSeam(path, seam)) {
      inSeam.push(path)
    } else if (reached.has(plain(path))) {
      inReach.push(path)
    } else {
      out.push(path)
    }
  }
  return { seam: inSeam, reach: inReach, out }
}

/**
 * Fold fresh answers into the stored file: the version of the atis that just
 * answered, the old steps overlaid with the new ones. A landed step keeps its
 * answer, since its record was measured against it; a key that names no step
 * of the plan is dropped.
 */
export function mergeReach(
  stored: StoredReach | null,
  version: string,
  fresh: Readonly<Record<string, ReachAnswer>>,
  live: ReadonlyArray<number>,
): StoredReach {
  const known = new Set(live.map(String))
  const steps: Record<string, ReachAnswer> = {}
  for (const [key, answer] of Object.entries({ ...(stored?.steps ?? {}), ...fresh })) {
    if (known.has(key)) {
      steps[key] = answer
    }
  }
  return { atis: version, steps }
}
