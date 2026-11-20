// The footprint: what a finished build says about its own reach, beside what
// it decided and what proves it. `plumbbob finish` writes it into report.md as
// a `## Footprint` section of three lines at most: the contract paths the
// build touched, how many of its landed steps a command proved, and the size
// of what those steps changed. A pull request from any other road fills the same
// lines by hand, so a team reviews one shape.
//
// Every line is rendered from facts already on disk: the `step <n> <sha>`
// lines of the checkpoints ledger, the numstat of each of those commits the
// branch still holds, the steps' proofs in intent.md, and the `contractPaths`
// setting. The contract line reads the rest of the build as well (the other
// commits since the baseline, and the tree `finish` is about to commit), so a
// touch no step owns is still named. None of it is a judgment, so the model
// writes none of it, and none of it is a gate: a file that will not read or a
// commit that will not resolve leaves the section out.
//
// The module is cut in two. `renderFootprint` is pure: it takes the facts and
// returns the markdown, so its tests need no repo. `gatherFootprint` reads the
// facts from disk and git.

import { readFileSync } from 'node:fs'
import { contractPaths, contractTouched } from './contract.ts'
import { commitNumstat, commitsBetween, diffNumstat, isAncestor, isCommit } from './git.ts'
import { isArtifactPath, parseStepProof } from './intent.ts'
import { countDiff, stepLandings, stepShas, type CommitFile } from './orient.ts'
import { checkpointsPath, intentPath } from './sidecar.ts'

/** One landed step as the footprint reads it: its number, the files its commits on the branch changed, and whether its proof opens on a command. */
export type FootprintStep = {
  readonly n: number
  readonly files: ReadonlyArray<CommitFile>
  readonly byCommand: boolean
}

/**
 * What the footprint is rendered from: the landed steps, the contract entries
 * (empty when the setting lists none), and the paths the build changed outside
 * any landed step's commit, which only the `Contract` line reads.
 */
export type FootprintFacts = {
  readonly steps: ReadonlyArray<FootprintStep>
  readonly contract: ReadonlyArray<string>
  readonly outside?: ReadonlyArray<string>
}

/**
 * Render the `## Footprint` section from gathered facts, or null when no step
 * landed.
 *
 * Three lines at most, in one order. `Contract` renders only when the setting
 * lists something: `none touched`, or each entry the build changed a file
 * under, in the setting's order, with the steps that did, or `outside a step`
 * when none did. `Proof` counts the steps
 * whose proof opens on a command and names the rest. `Size` counts the
 * distinct changed files and sums their added and deleted lines, plumbbob's
 * own artifacts left out; a binary file arrives with no lines and still counts
 * as a file. Steps read in number order, and a number given twice keeps its
 * last record. Pure: no fs and no git.
 */
export function renderFootprint(facts: FootprintFacts): string | null {
  const steps = inNumberOrder(facts.steps)
  if (steps.length === 0) {
    return null
  }
  const contract = contractLine(steps, facts.contract, facts.outside ?? [])
  return ['## Footprint', '', ...(contract === null ? [] : [contract]), proofLine(steps), sizeLine(steps), ''].join('\n')
}

/** The landed steps in number order, each once: a number given twice keeps its last record. */
function inNumberOrder(steps: ReadonlyArray<FootprintStep>): ReadonlyArray<FootprintStep> {
  const byNumber = new Map<number, FootprintStep>()
  for (const step of steps) {
    byNumber.set(step.n, step)
  }
  return [...byNumber.values()].sort((a, b) => a.n - b.n)
}

/**
 * The `Contract` line, or null when the setting lists nothing.
 *
 * It reads every path a step's commit changed, plumbbob's own files included,
 * so an entry under `.plumbbob/` is named when a step reaches it: leaving
 * those out is the `Size` line's rule, and here it would hide a touch.
 *
 * It reads the paths changed outside the steps too, so `none touched` speaks
 * for the whole build. An entry reached only there is named `outside a step`,
 * since no step can be named for it; one a step reached as well names the
 * steps, which is where a reader starts.
 */
function contractLine(
  steps: ReadonlyArray<FootprintStep>,
  contract: ReadonlyArray<string>,
  outside: ReadonlyArray<string>,
): string | null {
  if (contract.length === 0) {
    return null
  }
  const paths = (step: FootprintStep): ReadonlyArray<string> => step.files.map((file) => file.path)
  const named = contractTouched([...steps.flatMap(paths), ...outside], contract).map((entry) => {
    const by = steps.filter((step) => contractTouched(paths(step), [entry]).length > 0).map((step) => step.n)
    return `\`${entry}\` (${by.length === 0 ? 'outside a step' : stepWords(by)})`
  })
  return `- **Contract**: ${named.length === 0 ? 'none touched' : `touched ${listWords(named)}`}`
}

/** The `Proof` line: how many of the landed steps a command proved, and the rest by number. */
function proofLine(steps: ReadonlyArray<FootprintStep>): string {
  const inWords = steps.filter((step) => !step.byCommand).map((step) => step.n)
  const rest = inWords.length === 0 ? '' : `; ${stepWords(inWords)} in words`
  return `- **Proof**: ${steps.length - inWords.length} of ${counted(steps.length, 'step')} by a command${rest}`
}

/**
 * The `Size` line: the distinct files the landed steps changed, and their
 * added and deleted lines summed across the steps, plumbbob's own artifacts
 * left out. A file two steps changed is one file, with both steps' lines.
 */
function sizeLine(steps: ReadonlyArray<FootprintStep>): string {
  const work = steps.flatMap((step) => step.files).filter((file) => !isArtifactPath(file.path))
  const { added, removed } = countDiff(work)
  const files = new Set(work.map((file) => file.path)).size
  return `- **Size**: ${counted(files, 'file')}, +${added} -${removed}, over ${counted(steps.length, 'step')}`
}

/** A count with its noun, plural unless the count is one: `1 file`, `14 files`. */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** Steps as the footprint names them: `step 4`, or `steps 3, 5`. */
function stepWords(steps: ReadonlyArray<number>): string {
  return `${steps.length === 1 ? 'step' : 'steps'} ${steps.join(', ')}`
}

/** Items as a sentence lists them: `a`, `a and b`, or `a, b and c`. */
function listWords(items: ReadonlyArray<string>): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/**
 * Read a build's footprint facts from disk and git, or null when they cannot
 * be read whole.
 *
 * A landed step is one the ledger records with a commit on the branch: HEAD,
 * or a commit HEAD descends from. The ledger keeps a `step <n> <sha>` line for
 * every landing, and `plumbbob revert` carries it across the reset, so a line
 * alone does not say the commit is still there. After a revert and a landing
 * again, the commit the revert rewound past is off the branch and only the
 * last line counts. A step whose tick was cleared by hand lands again on top
 * of its first commit, and both count. A step a revert took away for good has
 * no commit on the branch, and is not a landed step.
 *
 * Each step brings the numstat of its commits and whether its proof in
 * intent.md opens on a command; a step with no proof, or one that does not
 * parse, is not proved by a command. A commit two steps recorded (a step that
 * lands on a clean tree records HEAD as it stands) gives its files to the
 * first of them, so its lines are summed once. The steps come back in number
 * order.
 *
 * `outside` is every path the build changed that no landed step's commit
 * holds: the other commits on the branch since the ledger's baseline (a commit
 * made by hand between checkpoints, the plan's own), and what the tree holds
 * uncommitted, which `finish` is about to sweep into its commit. A ledger with
 * no baseline, or one the repo does not hold, contributes the tree alone.
 *
 * Null when the ledger or the plan will not read, or the commit on a step's
 * last line will not resolve: the repo cannot say whether that step is on the
 * branch, and a footprint short a step would misstate the build, so it is
 * left out whole. An earlier line that will not resolve was replaced, and is
 * passed over. Best-effort and never throws.
 */
export function gatherFootprint(root: string, slug: string | null): FootprintFacts | null {
  let checkpoints: string
  let intent: string
  try {
    checkpoints = readFileSync(checkpointsPath(root, slug), 'utf8')
    intent = readFileSync(intentPath(root, slug), 'utf8')
  } catch {
    return null
  }
  const last = stepShas(checkpoints)
  const read = new Set<string>()
  const landed = new Map<number, CommitFile[]>()
  for (const { n, sha } of stepLandings(checkpoints)) {
    if (!isCommit(root, sha)) {
      if (last.get(n) === sha) {
        return null
      }
      continue
    }
    if (!isAncestor(root, sha)) {
      continue
    }
    const files = landed.get(n) ?? []
    landed.set(n, files)
    if (!read.has(sha)) {
      files.push(...commitNumstat(root, sha))
    }
    read.add(sha)
  }
  const steps = [...landed]
    .sort(([a], [b]) => a - b)
    .map(([n, files]): FootprintStep => {
      const proof = parseStepProof(intent, n)
      return { n, files, byCommand: proof.ok && proof.proof !== null && proof.proof.command !== null }
    })
  return { steps, contract: contractPaths(root), outside: outsidePaths(root, checkpoints, read) }
}

/**
 * The paths the build changed outside the commits in `stepCommits`, each once,
 * in the order they are met: the other commits from the ledger's baseline to
 * HEAD, newest first, then the uncommitted tree.
 *
 * A merge brings no paths of its own (its numstat is empty), so a branch
 * brought up to date with main mid-build does not read as this build's touch.
 */
function outsidePaths(root: string, checkpoints: string, stepCommits: ReadonlySet<string>): ReadonlyArray<string> {
  const baseline = /^baseline\s+(\S+)/m.exec(checkpoints)?.[1]
  const commits = baseline === undefined ? [] : commitsBetween(root, baseline, 'HEAD').filter((sha) => !stepCommits.has(sha))
  const files = [...commits.flatMap((sha) => commitNumstat(root, sha)), ...diffNumstat(root)]
  return [...new Set(files.map((file) => file.path))]
}
