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
//
// An entry is not validated when it is read, so one that can never match (a
// glob, a folder written without its slash) stays in the list and reads as
// untouched for ever. `contractIssues` names those, and `plumbbob doctor` is
// the surface that prints them.

import { matchesSeam, seamEntryIssue } from './intent.ts'
import { resolveTrackedList } from './settings.ts'

/** What the issue check can see of the working tree: injected, so the check stays pure and its tests need no repo. */
export type ContractTree = {
  readonly exists: (relPath: string) => boolean
  readonly isDirectory: (relPath: string) => boolean
}

/**
 * One contract entry that cannot do its job as written. `refused` and
 * `mistyped` entries match nothing and are problems; a `missing` one names
 * nothing in the tree yet, which a path still to be created does too.
 */
export type ContractIssue = {
  readonly entry: string
  readonly kind: 'refused' | 'mistyped' | 'missing'
  readonly words: string // what follows the entry's name: `is a glob`
  readonly fix: string | null // the remedy for a problem; null for `missing`
}

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

/**
 * The contract entries that cannot do their job as written, in the setting's
 * order; empty when every entry can match.
 *
 * Three kinds. An entry the seam grammar refuses (a glob, a backslash, an
 * absolute path, a `.` or `..` segment) matches nothing. So does one whose
 * slash disagrees with the tree: a folder written with no trailing slash is
 * read as a file, and a file written with one is read as a folder. Both are
 * problems, and each carries its fix. An entry that names nothing in the tree
 * is reported without one, since a path a later step creates reads the same
 * as a typo. Pure: the tree is injected.
 */
export function contractIssues(contract: ReadonlyArray<string>, tree: ContractTree): ReadonlyArray<ContractIssue> {
  return contract.flatMap((entry): ContractIssue[] => {
    const refusal = seamEntryIssue(entry)
    if (refusal !== null) {
      return [{ entry, kind: 'refused', words: `${refusal}; an entry is a file or a \`dir/\` grant`, fix: 'name the file, or the folder as `dir/`' }]
    }
    const grant = entry.endsWith('/')
    const body = grant ? entry.slice(0, -1) : entry
    if (!tree.exists(body)) {
      return [{ entry, kind: 'missing', words: 'names nothing in the tree yet', fix: null }]
    }
    if (!grant && tree.isDirectory(body)) {
      return [
        { entry, kind: 'mistyped', words: 'names a folder, and an entry with no trailing slash is read as a file', fix: `write it \`${entry}/\`` },
      ]
    }
    if (grant && !tree.isDirectory(body)) {
      return [{ entry, kind: 'mistyped', words: 'names a file, and an entry with a trailing slash is read as a folder', fix: `write it \`${body}\`` }]
    }
    return []
  })
}
