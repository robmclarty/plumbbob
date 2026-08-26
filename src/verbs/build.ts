// `plumbbob build <n>`: enter a step: read step n's seam from intent.md and
// write the normalized SEAM + STEP control files (flat, untracked, per-build).
// The seam is the step's edit grant: the exact paths and `dir/` prefixes the
// step expects to touch, for orientation, never a lock. The STEP file is the
// in-flight signal (the dashboard derives the BUILD phase from it); this verb
// never checkpoints; only `checkpoint` commits.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, intentPath, resolveBuild, seamPath, stampStepStat, stampTick, stepPath } from '../lib/sidecar.ts'
import { parseStepSeam } from '../lib/intent.ts'
import { parseSteps } from '../lib/orient.ts'
import { stepLabel, syncBuildLogState } from '../lib/buildlogsync.ts'

/**
 * Enter step n (or the next undone step) and write its SEAM/STEP markers.
 *
 * Refuses a missing session, a malformed step argument, an `N-M` range (a
 * `/plumbbob:build` skill feature, not a CLI one), and a seam that fails to parse.
 * On entry it stamps the turn ledger and the step's start time, and re-renders
 * the build-log's Current step line.
 */
export function build(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const raw = rest.find((a) => !a.startsWith('--'))
  // A step range like `1-3` is a `/plumbbob:build` skill affordance (auto-approve
  // through the range, then pause), not a CLI capability: the CLI records one
  // in-flight step at a time. Name it rather than bounce off the generic usage.
  if (raw !== undefined && /^\d+-\d*$/.test(raw)) {
    process.stderr.write(
      `plumbbob: build takes one step number; \`${raw}\` step ranges are a \`/plumbbob:build\` feature (auto-approve through the range, then pause). Try \`plumbbob build ${raw.split('-')[0]}\`.\n`,
    )
    return 1
  }
  // An explicit arg that isn't a positive integer is a usage error: caught before
  // reading intent.md so the message doesn't depend on the plan being present.
  if (raw !== undefined && (!/^\d+$/.test(raw) || Number(raw) < 1)) {
    process.stderr.write('plumbbob: build needs a step number. Try: plumbbob build 2.\n')
    return 1
  }

  const intent = readFileSync(intentPath(root, slug), 'utf8')
  const steps = parseSteps(intent)

  // No argument ⇒ enter the next undone step in intent.md (the same idiom
  // `checkpoint` uses), so a bare `plumbbob build` advances the loop without the
  // skill re-deriving the step in prose. Every step checkpointed ⇒ a `/plumbbob:step`
  // nudge, not a silent no-op.
  let step: number
  if (raw === undefined) {
    const nextUndone = steps.find((s) => !s.done)
    if (nextUndone === undefined) {
      process.stderr.write(
        'plumbbob: no undone step to build — every planned step is checkpointed. `/plumbbob:step` to add an increment, or `/plumbbob:finish`.\n',
      )
      return 1
    }
    step = nextUndone.n
  } else {
    step = Number(raw)
  }

  const parsed = parseStepSeam(intent, step)
  if (!parsed.ok) {
    process.stderr.write(`plumbbob: ${parsed.error} Fix the step's seam in intent.md, then \`build ${step}\` again.\n`)
    return 1
  }

  writeFileSync(seamPath(root, slug), `${parsed.seam.join('\n')}\n`)
  writeFileSync(stepPath(root, slug), `${step}\n`)
  // Stamp the turn ledger on entry (TICK = TURN): the checkpoint latch demands
  // a human turn after this point before the step may land. Skipped when the
  // ledger is dormant: a host with no hooks grows no TURN/TICK files.
  stampTick(root, slug)
  // The wall-clock receipt starts here: checkpoint stamps landedAt, and the
  // pair becomes the step's duration in the finish report.
  stampStepStat(root, slug, step, 'startedAt', new Date().toISOString())
  // The build-log's top half is CLI-owned so it never lies: show this step in
  // flight: Current step plus the ☐/☑ mirror, re-rendered from intent.md.
  // Best-effort: a missing or hand-edited build-log never blocks the build.
  const title = steps.find((s) => s.n === step)?.title ?? null
  syncBuildLogState(root, slug, stepLabel(step, title))

  // An explicit jump past undone work says so out loud: the entered step and
  // the count it skips read back to the human (and to the transcript), so a
  // deliberate `build 22` and a confused one look different on the page.
  const skipped = raw === undefined ? 0 : steps.filter((s) => !s.done && s.n < step).length
  const picked =
    raw === undefined
      ? ' (next undone)'
      : skipped > 0
        ? ` (explicitly requested; skips ${skipped} undone step${skipped === 1 ? '' : 's'})`
        : ''
  process.stdout.write(
    `plumbbob: building step ${step}${picked}. Seam (for orientation; not a lock):\n${parsed.seam.map((p) => `  ${p}`).join('\n')}\n`,
  )
  return 0
}
