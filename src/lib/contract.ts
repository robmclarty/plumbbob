// The contract paths: the paths the rest of the repo depends on (the shared
// types, the schemas, the generated clients), listed under `contractPaths` in
// the tracked settings.json. An entry is written in the seam grammar, an exact
// repo-relative file or a `dir/` grant, and is matched the way a seam is, so
// one grammar says what a step may edit and what a team watches.
//
// The list is read from the tracked file alone. The contract is the team's,
// and a personal overlay that narrowed it would hide a touch from the one
// person who needed to see it. Guidance, never a gate: nothing here refuses an
// edit to a contract path. The module answers which entries a set of changed
// paths reached, and the surface that says so is the caller's.

import { matchesSeam } from './intent.ts'
import { resolveTrackedList } from './settings.ts'

/**
 * The repo's contract entries, in the order `contractPaths` lists them, each
 * named once.
 *
 * A missing key, a value that is not a list, and an entry that is not a
 * non-blank string each read as nothing. An entry is trimmed and loses a
 * leading `./`, as a seam token does, so `./packages/shared/` and
 * `packages/shared/` are one entry.
 */
export function contractPaths(root: string): ReadonlyArray<string> {
  const entries = resolveTrackedList(root, 'contractPaths')
    .map((entry) => entry.trim().replace(/^\.\//, ''))
    .filter((entry) => entry !== '')
  return [...new Set(entries)]
}

/**
 * The contract entries that cover at least one of `paths`, in the order the
 * setting lists them, each named once however many paths it covers.
 *
 * Pure: `paths` are repo-relative and `contract` is what `contractPaths`
 * returned. Matching is the seam's, so a file entry covers that file alone and
 * a `dir/` grant covers everything beneath it.
 */
export function contractTouched(paths: ReadonlyArray<string>, contract: ReadonlyArray<string>): ReadonlyArray<string> {
  const touched = contract.filter((entry) => paths.some((path) => matchesSeam(path, [entry])))
  return [...new Set(touched)]
}
