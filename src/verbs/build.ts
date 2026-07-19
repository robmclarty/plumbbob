// `plumbbob build <n>` — read step n's seam from intent.md, write the normalized
// SEAM + STEP. The STEP file is the in-flight signal (the dashboard derives the
// BUILD phase from it); it never checkpoints (only `checkpoint` commits).

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, intentPath, resolveBuild, seamPath, stampStepStat, stampTick, stepPath } from '../lib/sidecar.ts'
import { parseStepSeam } from '../lib/intent.ts'
import { parseSteps } from '../lib/orient.ts'
import { stepLabel, syncBuildLogState } from '../lib/buildlogsync.ts'

export function build(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const raw = rest.find((a) => !a.startsWith('--'))
  // A step range like `1-3` is a `/pb-build` skill affordance (auto-approve
  // through the range, then pause), not a CLI capability — the CLI records one
  // in-flight step at a time. Name it rather than bounce off the generic usage.
  if (raw !== undefined && /^\d+-\d*$/.test(raw)) {
    process.stderr.write(
      `plumbbob: build takes one step number; \`${raw}\` step ranges are a \`/pb-build\` feature (auto-approve through the range, then pause). Try \`plumbbob build ${raw.split('-')[0]}\`.\n`,
    )
    return 1
  }
  // An explicit arg that isn't a positive integer is a usage error — caught before
  // reading intent.md so the message doesn't depend on the plan being present.
  if (raw !== undefined && (!/^\d+$/.test(raw) || Number(raw) < 1)) {
    process.stderr.write('plumbbob: build needs a step number. Try: plumbbob build 2.\n')
    return 1
  }

  const intent = readFileSync(intentPath(root, slug), 'utf8')

  // No argument ⇒ enter the next undone step in intent.md (the same idiom
  // `checkpoint` uses), so a bare `plumbbob build` advances the loop without the
  // skill re-deriving the step in prose. Every step checkpointed ⇒ a `/pb-step`
  // nudge, not a silent no-op.
  let step: number
  if (raw === undefined) {
    const nextUndone = parseSteps(intent).find((s) => !s.done)
    if (nextUndone === undefined) {
      process.stderr.write(
        'plumbbob: no undone step to build — every planned step is checkpointed. `/pb-step` to add an increment, or `/pb-finish`.\n',
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
  stampTick(root, slug) // the entry stamp (D64): TICK = TURN; skipped when the ledger is dormant.
  // The wall-clock receipt starts here (research/07 Build 2b): checkpoint stamps
  // landedAt, and the pair becomes the step's duration in the finish report.
  stampStepStat(root, slug, step, 'startedAt', new Date().toISOString())
  // The build-log's top half now shows this step in flight (D69): Current step +
  // the ☐/☑ mirror, re-rendered from intent.md. Best-effort — never blocks the build.
  const title = parseSteps(intent).find((s) => s.n === step)?.title ?? null
  syncBuildLogState(root, slug, stepLabel(step, title))

  const picked = raw === undefined ? ' (next undone)' : ''
  process.stdout.write(
    `plumbbob: building step ${step}${picked}. Seam (for orientation; not a lock):\n${parsed.seam.map((p) => `  ${p}`).join('\n')}\n`,
  )
  return 0
}
