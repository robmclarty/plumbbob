// The build's state as data: the moves a person can make from here, the steps
// of the range in play, and the state's name. `status --json` prints it, and a
// surface with controls of its own (a host's question buttons, its task list,
// an editor's command menu) reads it instead of the dashboard's prose. Pure and
// fs-free, like `orient`: the caller reads the markers and passes them in.

import {
  parseBuildRanges,
  parseOpenQuestionRows,
  parseOrderedSteps,
  parseParkTotals,
  questionTotals,
  resolveRun,
  runBracket,
  stopFollowUp,
  type BuildRange,
  type OrientInput,
  type Run,
  type RunRange,
  type Step,
} from './orient.ts'
import { hasStep } from './steplist.ts'

/**
 * One move a person can make from the build's current state.
 *
 * `command` is what makes the move with no button to press: a skill to invoke,
 * or the reply to type. `typed` marks a move only a typed prompt can make,
 * since the approval latch and a run's grant count typed prompts alone; a
 * surface shows such a move with its command and never makes it itself.
 * `primary` is true for the first move and no other: the one the dashboard's
 * pointer names.
 */
export type Move = {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly command: string
  readonly typed: boolean
  readonly primary: boolean
}

/** Where a step stands on a task list: not started, being built, or landed. */
export type TaskStatus = 'pending' | 'in_flight' | 'done'

/** One step of the range in play, as a task list shows it. */
export type Task = {
  readonly step: number
  // The line to show, composed here so every surface shows the same words:
  // the step's number, its place in the range, and its title.
  readonly subject: string
  readonly status: TaskStatus
}

/** The build's state, by the kind of move it calls for. */
export type BuildState = 'spike' | 'in-flight' | 'paused' | 'stop-waiting' | 'boundary' | 'done'

/** What `movesFor` reads beyond the documents: the cards still on the table. */
export type MovesInput = {
  readonly orient: OrientInput
  // The step whose pause card has shown and still waits for its reply; null
  // when no card waits, or the card is another step's.
  readonly paused: number | null
  // The stop card still waiting for its reply: its range and the ranges' count.
  readonly waiting: { readonly range: number; readonly count: number } | null
}

/** A move before its place in the list is known. */
type Draft = Omit<Move, 'primary'>

/** A move a button can make: the surface runs it once the person picks it. */
function pick(id: string, label: string, description: string, command: string): Draft {
  return { id, label, description, command, typed: false }
}

/** A move only a typed prompt can make: the surface shows what to type. */
function typed(id: string, label: string, description: string, command: string): Draft {
  return { id, label, description, command, typed: true }
}

/** Whether the plan is decided: the ledger holds its commit, or a step's. */
function planDecided(checkpoints: string): boolean {
  return checkpoints.split('\n').some((line) => /^(?:plan|step\s+\d+)\s+\S+/.test(line.trim()))
}

/**
 * The build's state: a spike open, a step at its pause or still being built, a
 * stop card waiting, every step landed, or the boundary between steps.
 */
export function buildState(input: MovesInput): BuildState {
  const { orient } = input
  if (orient.spiking) {
    return 'spike'
  }
  if (orient.inFlight !== null) {
    return input.paused === orient.inFlight ? 'paused' : 'in-flight'
  }
  if (input.waiting !== null) {
    return 'stop-waiting'
  }
  const ordered = parseOrderedSteps(orient.intent)
  return ordered.length > 0 && ordered.every((s) => s.done) ? 'done' : 'boundary'
}

/**
 * Every move a person can make from here, the likeliest first.
 *
 * The first is the move the dashboard's pointer names, so a picker and the
 * reminder never disagree; the one exception is a step at its pause, where the
 * card on the table asks for `looks good` and the pointer still says verify.
 * The rest follow in the order a person reaches for them. A surface that
 * shows fewer takes them from the top.
 */
export function movesFor(input: MovesInput): Move[] {
  const drafts = [...stateMoves(input), ...standingMoves(input)]
  // A move two lists both offer keeps its first place.
  const unique = drafts.filter((d, i) => drafts.findIndex((other) => other.id === d.id) === i)
  return unique.map((d, i) => ({ ...d, primary: i === 0 }))
}

/** The moves the state itself calls for, the dashboard's own first. */
function stateMoves(input: MovesInput): Draft[] {
  const { orient } = input
  const state = buildState(input)
  const step = orient.inFlight
  switch (state) {
    case 'spike':
      return [pick('spike-done', 'Close the spike', 'Ends the spike and returns to the build where it stood.', '/plumbbob:spike done')]
    case 'paused':
      return [
        typed('approve', `Land step ${step}`, `Type \`looks good\` once you have read step ${step}'s card: it checkpoints the step.`, 'looks good'),
        ...restOfRange(orient, step),
        typed('show-pause', 'Show the pause card', `Type \`show the pause\` to bring step ${step}'s card back, whole.`, 'show the pause'),
        pick('verify', `Check step ${step} again`, `Runs the check and the review on step ${step} again; nothing lands.`, '/plumbbob:verify'),
        ...unwind(step),
      ]
    case 'in-flight':
      return [
        pick('verify', `Finish step ${step}`, `Runs the check, reviews the diff and shows step ${step}'s card; nothing lands until you approve.`, '/plumbbob:verify'),
        ...unwind(step),
      ]
    case 'stop-waiting':
      return stopMoves(orient.intent, input.waiting)
    case 'done':
      return doneMoves(input)
    case 'boundary':
      return boundaryMoves(input)
  }
}

/**
 * The pause's other approval: the run that lands this step and the rest of its
 * range. Offered where the pause card offers it, on a range that lists more
 * than the step in flight.
 */
function restOfRange(orient: OrientInput, step: number | null): Draft[] {
  const run = resolveRun({ intent: orient.intent, inFlight: step, spiking: false, item: null })
  if (!run.ok || run.range.bare || run.left[0] !== step || run.left.length < 2) {
    return []
  }
  return [
    typed(
      'run',
      `Land and run range ${run.range.item}`,
      `Type \`/plumbbob:run\`: it checkpoints step ${step}, then runs the rest of range ${run.range.item} to its stop.`,
      '/plumbbob:run',
    ),
  ]
}

/** The two ways back from a step in flight. Both are typed: each discards work. */
function unwind(step: number | null): Draft[] {
  return [
    typed('abandon', `Abandon step ${step}`, `Type \`/plumbbob:abandon\`: it drops step ${step} and keeps the diff in the tree.`, '/plumbbob:abandon'),
    typed('revert', 'Revert to the last checkpoint', 'Type `/plumbbob:revert`: it winds the tree back to the last checkpoint.', '/plumbbob:revert'),
  ]
}

/**
 * The moves at a stop card still waiting: the reply that records it and goes
 * on (the next range's run, or the finish on the plan's last range), the plain
 * approval, and the way back to the card. All typed, since each records a
 * review the stop latch holds for a human turn.
 */
function stopMoves(intent: string, waiting: MovesInput['waiting']): Draft[] {
  const range = waiting?.range ?? 0
  const follow = stopFollowUp(intent)
  const onward =
    follow === null
      ? []
      : follow === 'finish'
        ? [typed('finish', 'Finish the build', `Type \`/plumbbob:finish\`: it records range ${range}'s stop card, then writes the report and closes the build.`, '/plumbbob:finish')]
        : [runDraft(follow, `it records range ${range}'s stop card, then runs`)]
  return [
    ...onward,
    typed('approve', `Record range ${range}'s review`, `Type \`looks good\` with range ${range}'s stop card in this conversation: it records the review and every lean as proposed.`, 'looks good'),
    typed('show-stop', 'Show the stop card', `Type \`show the stop\` to bring range ${range}'s stop card back, whole.`, 'show the stop'),
  ]
}

/** A range's run as a move. Typed: a run's grant is minted from the typed command alone. */
function runDraft(run: RunRange, does: string): Draft {
  return typed(
    'run',
    `Run range ${run.range.item} of ${run.count}`,
    `Type \`/plumbbob:run\`: ${does} ${runBracket(run)}${stopWords(run.range)}.`,
    '/plumbbob:run',
  )
}

/** Where a run ends, as the tail of its description: a listed range walks to its stop. */
function stopWords(range: BuildRange): string {
  return range.bare ? '' : ', then stops for your review'
}

/** The moves once every step has landed: harvest what is parked, then finish. */
function doneMoves(input: MovesInput): Draft[] {
  const finish = typed('finish', 'Finish the build', 'Type `/plumbbob:finish`: it writes the report and closes the build.', '/plumbbob:finish')
  const more = pick('step', 'Add another step', 'Plans one more step when the work grew past the plan.', '/plumbbob:step')
  return [...harvestMove(input), finish, more]
}

/**
 * The moves at the boundary between steps: the run of the range holding the
 * next step where one can be walked, else that step's build, or its planning
 * when it is not yet planned; then the ways to change the plan first.
 */
function boundaryMoves(input: MovesInput): Draft[] {
  const { orient } = input
  const ordered = parseOrderedSteps(orient.intent)
  const next = ordered.find((s) => !s.done)
  if (next === undefined) {
    return [pick('step', 'Plan the first step', 'Writes the first step of the plan, with its done-when and its seam.', '/plumbbob:step')]
  }
  if (!next.planned) {
    return [pick('step', `Plan step ${next.n}`, `Sharpens step ${next.n} until it has a done-when and a seam; nothing is built.`, '/plumbbob:step'), ...refineMove()]
  }
  const run = resolveRun({ intent: orient.intent, inFlight: null, spiking: false, item: null })
  const build = buildDraft(next, run)
  const sharpen = pick('step', `Sharpen step ${next.n} first`, `Revises step ${next.n} before it is built; nothing is built.`, '/plumbbob:step')
  return [...(run.ok ? [runDraft(run, 'it builds')] : []), build, sharpen, ...refineMove()]
}

/**
 * The build of the next step as a move. Under a run it names the step, since
 * it is the smaller of two offers; alone it is the dashboard's bare command.
 */
function buildDraft(next: Step, run: Run): Draft {
  const does = `Builds step ${next.n} and stops at its pause card; nothing lands until you approve.`
  return run.ok
    ? pick('build', `Build step ${next.n} only`, does, `/plumbbob:build ${next.n}`)
    : pick('build', `Build step ${next.n}`, does, '/plumbbob:build')
}

/** The plan's stress test, offered wherever the plan can still change cheaply. */
function refineMove(): Draft[] {
  return [pick('refine', 'Stress-test the plan', 'Attacks the plan for gaps and records what it finds as open questions; nothing is built.', '/plumbbob:refine')]
}

/** The harvest, offered while a parked idea is open and no step is in flight. */
function harvestMove(input: MovesInput): Draft[] {
  const { open } = parseParkTotals(input.orient.buildLog)
  if (open === 0) {
    return []
  }
  const ideas = `${open} parked idea${open === 1 ? '' : 's'}`
  return [pick('harvest', `Harvest ${ideas}`, `Proposes a lean for each of the ${ideas} and shows them on one card; nothing is recorded until you approve.`, '/plumbbob:harvest')]
}

/**
 * The moves that stand in any state where they apply: the open questions that
 * wait on the person, the plan's approval while it is undecided, a park, and
 * the harvest at a boundary.
 */
function standingMoves(input: MovesInput): Draft[] {
  const { orient } = input
  const state = buildState(input)
  const { toAnswer } = questionTotals(parseOpenQuestionRows(orient.intent))
  const questions =
    toAnswer === 0
      ? []
      : [
          pick(
            'questions',
            `Answer ${toAnswer} open question${toAnswer === 1 ? '' : 's'}`,
            `Goes through the ${toAnswer === 1 ? 'question' : 'questions'} the plan still asks of you, each with a proposed answer.`,
            'what are the open questions?',
          ),
        ]
  const undecided = state === 'boundary' && parseOrderedSteps(orient.intent).length > 0 && !planDecided(orient.checkpoints)
  const approve = undecided
    ? [typed('approve-plan', 'Approve the plan', 'Type `looks good` with the plan card in this conversation: it marks the plan decided and commits it.', 'looks good')]
    : []
  const park =
    state === 'spike' ? [] : [pick('park', 'Park an idea', 'Writes an idea down for the next stop and goes back to the work.', '/plumbbob:park')]
  return [...questions, ...approve, ...park, ...(state === 'boundary' ? harvestMove(input) : [])]
}

/**
 * The steps of the range in play as a task list, in build order: the range
 * `run` names when it can be walked, else the range holding the step in flight
 * or the next undone step, else the whole plan when it declares no range that
 * holds it. Each subject carries the step's place in that list, so the list
 * reads without the plan beside it.
 */
export function tasksFor(orient: OrientInput, run: Run | null): Task[] {
  const ordered = parseOrderedSteps(orient.intent)
  const named = run !== null && run.ok ? run : resolveRun({ intent: orient.intent, inFlight: orient.inFlight, spiking: false, item: null })
  const steps = named.ok ? ordered.filter((s) => hasStep(named.range.steps, s.n)) : holdingSteps(orient, ordered)
  return steps.map((s, i) => ({
    step: s.n,
    subject: `Step ${s.n} (${i + 1} of ${steps.length}): ${s.title}`,
    status: s.n === orient.inFlight ? 'in_flight' : s.done ? 'done' : 'pending',
  }))
}

/**
 * The steps to list when no run can be walked: the landed range still on the
 * table when the plan's ranges all read as landed, else every step of the plan.
 */
function holdingSteps(orient: OrientInput, ordered: ReadonlyArray<Step>): ReadonlyArray<Step> {
  const waiting = parseBuildRanges(orient.intent).ranges.find((r) => r.item === orient.waiting)
  return waiting === undefined ? ordered : ordered.filter((s) => hasStep(waiting.steps, s.n))
}
