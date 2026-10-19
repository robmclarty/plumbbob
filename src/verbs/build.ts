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
import { parseBuildRanges, parseOrderedSteps, rangeStanding, rangeStart, skippedBefore, stopFollowUp, type Step } from '../lib/orient.ts'
import { stepLabel, syncBuildLogState } from '../lib/buildlogsync.ts'
import { readGrant, type Grant } from '../lib/latch.ts'
import { notice } from '../lib/notice.ts'
import { hasStep, readBuildArgs } from '../lib/steplist.ts'
import { waitingCard } from './handoff.ts'

/**
 * Enter step n (or the next undone step) and write its SEAM/STEP markers.
 *
 * Refuses a missing session, a malformed step argument, a range such as `N-M`
 * or `20,5-9` (a `/plumbbob:build` skill feature, not a CLI one), a stop card
 * still waiting for its reply, and a seam that fails to parse.
 * On entry it stamps the turn ledger and the step's start time, re-renders the
 * build-log's Current step line, and names the step when it is the last one a
 * self-approval grant reaches, or, under `--auto`, a call the plan's ranges
 * reserve for the human.
 */
export function build(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const raw = rest.find((a) => !a.startsWith('--'))
  // A step range like `1-3` or `20,5-9` is a `/plumbbob:build` skill affordance
  // (auto-approve each step it names, then stop), not a CLI capability: the CLI
  // records one in-flight step at a time. Name it rather than bounce off the
  // generic usage, and point at the step the range starts at.
  if (raw !== undefined && /^\d[\d,-]*$/.test(raw) && /[,-]/.test(raw)) {
    process.stderr.write(
      notice({
        fact: 'build takes one step number',
        detail: [`\`${raw}\` is a /plumbbob:build range, which auto-approves through its top and then stops`],
        remedy: `plumbbob build ${rangeEntry(intentPath(root, slug), rest.join(' '), raw)}`,
      }),
    )
    return 1
  }
  // An explicit arg that isn't a positive integer is a usage error: caught before
  // reading intent.md so the message doesn't depend on the plan being present.
  if (raw !== undefined && (!/^\d+$/.test(raw) || Number(raw) < 1)) {
    process.stderr.write(notice({ fact: 'build needs a step number', remedy: 'plumbbob build 2' }))
    return 1
  }

  const intent = readFileSync(intentPath(root, slug), 'utf8')
  // A stop card waiting for its reply holds every step, bare or named: the
  // step's pause would write over the range's review in the detail file before
  // the reply recorded it. Nothing is written, and on the plan's last range the
  // card outranks "no undone step".
  const waiting = waitingNotice(root, slug, intent)
  if (waiting.length > 0) {
    process.stderr.write(waiting)
    return 1
  }
  // In build order: the sequence `## Build order` declares when a refined plan
  // has one, else the numbering, so this pick and the dashboard's agree.
  const steps = parseOrderedSteps(intent)

  // No argument ⇒ enter the next undone step in intent.md (the same idiom
  // `checkpoint` uses), so a bare `plumbbob build` advances the loop without the
  // skill re-deriving the step in prose. Every step checkpointed ⇒ a `/plumbbob:step`
  // nudge, not a silent no-op.
  let step: number
  if (raw === undefined) {
    const nextUndone = steps.find((s) => !s.done)
    if (nextUndone === undefined) {
      process.stderr.write(
        notice({
          fact: 'no undone step to build',
          detail: ['every planned step is checkpointed'],
          remedy: '/plumbbob:step to add an increment, or /plumbbob:finish',
        }),
      )
      return 1
    }
    step = nextUndone.n
  } else {
    step = Number(raw)
  }

  const parsed = parseStepSeam(intent, step)
  if (!parsed.ok) {
    process.stderr.write(
      notice({ fact: parsed.error, remedy: `fix the step's seam in intent.md, then \`build ${step}\` again` }),
    )
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
  // the count it skips (the undone steps ahead of it in build order) read back
  // to the human (and to the transcript), so a deliberate `build 22` and a
  // confused one look different on the page.
  const skipped = raw === undefined ? 0 : skippedBefore(steps, step).length
  const picked =
    raw === undefined
      ? ['next undone']
      : skipped > 0
        ? ['explicitly requested', `skips ${skipped} undone step${skipped === 1 ? '' : 's'}`]
        : []
  // Two lines (three on the last step a grant reaches, or on a call the plan
  // reserves), one colon each, then the seam as a plain readout beneath the
  // notice that frames it: the paths are a list, and a list is not a one-liner.
  // A reserved call outranks the last-step line, since the step stops at its
  // pause rather than landing.
  const grant = readGrant(root)
  const reserved = grant?.kind === 'auto' ? reservedCallNotice(intent, steps, step) : ''
  process.stdout.write(
    notice({ fact: `building step ${step}`, detail: picked }) +
      (reserved.length > 0 ? reserved : lastGrantedNotice(grant, steps, step)) +
      notice({
        fact: 'the seam is orientation, not a lock',
        detail: [`${parsed.seam.length} path${parsed.seam.length === 1 ? '' : 's'}`],
      }) +
      `${parsed.seam.map((path) => `  ${path}`).join('\n')}\n`,
  )
  return 0
}

/**
 * The refusal while a stop card waits for its reply, or '' when none waits:
 * the card, then the reply that records it. `looks good` always does, and the
 * remedy adds the move the card's second row names, read through the same
 * `stopFollowUp`: the next range's run, the finish on the plan's last range,
 * or nothing more when the next run would refuse. The remedy spends a
 * semicolon, since the refusal register keeps its one colon for the prefix.
 */
function waitingNotice(root: string, slug: string | null, intent: string): string {
  const card = waitingCard(root, slug, intent)
  if (card === null) {
    return ''
  }
  const follow = stopFollowUp(intent)
  const also =
    follow === null
      ? ''
      : follow === 'finish'
        ? ', and /plumbbob:finish records it, then writes the report'
        : `, and /plumbbob:run records it, then runs range ${follow.range.item} of ${follow.count}`
  return notice({
    fact: 'no step entered',
    detail: [`range ${card.range} of ${card.count}'s stop card is waiting for its reply`],
    remedy: `reply to the card; looks good records it${also}`,
  })
}

/**
 * The step a range typed at the CLI starts at: its first undone step in build
 * order when the plan reads, else its first number written.
 *
 * Best-effort, since it only fills the refusal's remedy: a plan that cannot be
 * read, or a range that does not parse, still points at a number the human typed.
 */
function rangeEntry(intent: string, args: string, raw: string): string {
  const list = readBuildArgs(args).steps
  try {
    const start = list === null ? null : rangeStart(parseOrderedSteps(readFileSync(intent, 'utf8')), list)
    if (start !== null) return String(start)
  } catch {
    // No plan to order by: fall back to the number typed first.
  }
  return /\d+/.exec(raw)?.[0] ?? '1'
}

/**
 * The line saying a step ends at its pause under `--auto`, because the plan's
 * build ranges name it as a bare range: a call the plan reserves for the
 * human. '' for any other step.
 *
 * The halt is this line's and the skill's, never the latch's: the ranges are
 * advice, so `--auto` still grants the checkpoint, and saying so as the step
 * is entered is what puts the stop in front of the model before it lands one.
 */
function reservedCallNotice(intent: string, steps: ReadonlyArray<Step>, step: number): string {
  const { count, holding } = rangeStanding(parseBuildRanges(intent), steps, step)
  if (holding === null || !holding.bare) {
    return ''
  }
  return notice({
    fact: `step ${step} ends at its pause, where the plan reserves the call for the human`,
    detail: [`range ${holding.item} of ${count}`],
    remedy: 'hold it there for their approval, --auto or not',
  })
}

/**
 * The line naming the last step a self-approval grant reaches this turn, or ''
 * for any other step and when no grant is live.
 *
 * That step lands like every step before it, and then the turn ends on its
 * checkpoint: a clean halt. Saying so as the step is entered puts the fact in
 * front of the model before it chooses between landing the step and holding it
 * at a pause, which is the choice a clean halt kept getting wrong. A range
 * reaches its top, or the last undone step under its top when the plan ends
 * first, or when the build order puts a number past the top ahead of the rest
 * (a range names plan numbers, and the skill halts before one past its top);
 * `--auto` reaches the plan's last undone step. A range that lists its steps
 * walks them in build order, so its top is the last undone step it names, and
 * it reaches no further than a step it does not name.
 */
function lastGrantedNotice(grant: Grant | null, steps: ReadonlyArray<Step>, step: number): string {
  if (grant === null) {
    return ''
  }
  const remedy = 'land it on green, then stop at the boundary'
  if (grant.kind === 'steps') {
    if (!hasStep(grant.steps, step)) return ''
    const rest = steps.slice(steps.findIndex((s) => s.n === step) + 1).filter((s) => !s.done && s.n !== step)
    const after = rest[0]
    if (after !== undefined && hasStep(grant.steps, after.n)) return ''
    return rest.some((s) => hasStep(grant.steps, s.n))
      ? notice({ fact: `step ${step} is the last undone step in the range you granted`, remedy })
      : notice({ fact: `step ${step} is the top of the range you granted`, remedy })
  }
  if (grant.kind === 'range') {
    if (step === grant.ceiling) {
      return notice({ fact: `step ${step} is the top of the range you granted`, remedy })
    }
    const after = steps.slice(steps.findIndex((s) => s.n === step) + 1).find((s) => !s.done)
    const more = after !== undefined && after.n <= grant.ceiling
    return step < grant.ceiling && !more
      ? notice({ fact: `step ${step} is the last undone step in the range you granted`, remedy })
      : ''
  }
  const more = steps.some((s) => !s.done && s.n !== step)
  return more ? '' : notice({ fact: `step ${step} is the last undone step in the plan`, remedy })
}
