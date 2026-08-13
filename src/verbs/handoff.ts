// `plumbbob handoff`: print the standardized build hand-off block: the
// "state / choice / what's next" the human sees at each step boundary. Read-only,
// no state change. It derives the moment from the session: a step in flight ⇒ the
// pause block (built → looks-good/needs-work → next), none ⇒ the post-checkpoint
// boundary block, and renders the next undone step plus its advisory `- model:`
// recommendation straight from intent.md, the build's plan document. Owning the
// block here, rather than as prose in the build skill, keeps the skill from
// drifting out of sync with `status`, which renders the same next-step detail
// (both read `parseSteps`).

import { readFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { checkpointsPath, hasSession, intentPath, resolveBuild, stepPath } from '../lib/sidecar.ts'
import { type Step, parseLastCheckpoint, parseSteps } from '../lib/orient.ts'

/**
 * Print the hand-off block for the resolved build; return the exit code.
 *
 * Requires an active session (the STATE sentinel under `.plumbbob/`). Which
 * moment to render is derived, not passed: a step in flight yields the pause
 * block, none yields the boundary block, and a fresh session with nothing to
 * report yields only the forward pointer.
 */
export function handoff(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const steps = parseSteps(readOr(intentPath(root, slug)))

  const inFlight = readStep(stepPath(root, slug))
  const explicit = rest.find((a) => /^\d+$/.test(a))
  const lastDone = parseLastCheckpoint(readOr(checkpointsPath(root, slug)))
  // The step this hand-off is about: an explicit arg wins (the skill's override),
  // else the in-flight step (the pause), else the last checkpointed step (the
  // boundary). Null only on a fresh session the skill would not hand off from.
  const current = explicit !== undefined ? Number(explicit) : (inFlight ?? lastDone?.n ?? null)

  // Next up: the first undone step that is not the current one. At the pause the
  // current step is still `[ ]`, so excluding it by number is what makes "next"
  // mean the step *after* it; at the boundary the current step is already `[x]`,
  // so the `!== current` clause is a harmless no-op. Skipping-ahead builds still
  // land on the earliest remaining step, never a gap.
  const nextUp = steps.find((s) => !s.done && s.n !== current)

  if (current === null) {
    // No step to report as just-done (fresh session): emit only the forward pointer.
    process.stdout.write(`${nextUpLine(nextUp)}\n`)
    return 0
  }

  const block = inFlight !== null ? pauseBlock(current, titleOf(steps, current), nextUp) : boundaryBlock(current, titleOf(steps, current), nextUp)
  process.stdout.write(`${block}\n`)
  return 0
}

/**
 * The pause block: the step is built and awaiting approval.
 *
 * The opener is neutral (the CLI cannot vouch for the diff), pointing at the
 * diff and self-review the skill shows above it.
 */
function pauseBlock(step: number, title: string | null, nextUp: Step | undefined): string {
  return [
    `Step ${step}${paren(title)} is built. Review the diff and self-review above, then:`,
    `  - looks good → I'll checkpoint it (lands step ${step} as its own commit, back to the boundary)`,
    `  - needs work → tell me what to change and I'll iterate on this same step`,
    '',
    nextUpLine(nextUp),
  ].join('\n')
}

/**
 * The boundary block: the checkpoint has landed and the loop is back at the
 * step boundary, pointing at what to build next.
 */
function boundaryBlock(step: number, title: string | null, nextUp: Step | undefined): string {
  return [`Step ${step}${paren(title)} checkpointed — back at the boundary.`, '', nextUpLine(nextUp)].join('\n')
}

/**
 * The forward pointer, shared by both blocks: the next undone step, its title,
 * and its advisory `- model:` recommendation.
 *
 * The recommendation renders as just the model token for the `/model` call;
 * the full rationale lives on the `status` dashboard. No next step ⇒ the
 * finish/step nudge instead.
 */
function nextUpLine(nextUp: Step | undefined): string {
  if (nextUp === undefined) {
    return 'No planned steps remain — /plumbbob:step to add an increment, or /plumbbob:finish.'
  }
  const head = `Next up: step ${nextUp.n}${paren(nextUp.title)}`
  const token = modelToken(nextUp.model)
  return token === null ? `${head} — /plumbbob:build to start it.` : `${head} · model: ${token} — /model ${token} then /plumbbob:build.`
}

/**
 * A step's title in parentheses, or nothing when the title is empty.
 */
function paren(title: string | null): string {
  return title !== null && title.length > 0 ? ` (${title})` : ''
}

/**
 * The title of step `n` from the parsed steps, or null when the step is
 * unknown or untitled.
 */
function titleOf(steps: ReadonlyArray<Step>, n: number): string | null {
  return steps.find((s) => s.n === n)?.title ?? null
}

/**
 * The model token from a `- model:` recommendation: the first word, so a
 * `model: opus` line followed by an em dash and rationale yields `opus` for
 * the `/model` call.
 *
 * Null when there is no recommendation, or it degraded to whitespace (folding
 * the null model into the same guard keeps both branches live).
 */
function modelToken(model: string | null): string | null {
  const first = model?.trim().split(/\s+/)[0]
  return first !== undefined && first.length > 0 ? first : null
}

/**
 * Read a file as UTF-8, or return '' when it is missing or unreadable: an
 * absent sidecar file reads as empty rather than throwing.
 */
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * The in-flight step number from the STEP marker: the flat one-line file in
 * the build folder that records which step is open. Null when no step is in
 * flight or the file holds anything but a bare number.
 */
function readStep(path: string): number | null {
  try {
    const raw = readFileSync(path, 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
