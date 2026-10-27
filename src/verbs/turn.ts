// `plumbbob turn`: the turn-ledger hook. Wired to the harness's
// UserPromptSubmit event, it runs once per prompt and maintains the sidecar's
// git-excluded turn ledger (flat files under `.plumbbob/`): it ticks `TURN`,
// the monotonic count of human turns the checkpoint latch compares against a
// step's entry stamp to know a human turn intervened since the step began, and
// it rewrites `GRANT` from the literal prompt, minting a one-turn
// self-approval only when the human typed `/build --auto`, a step range (`N-M`,
// or a list such as `20,5-9`), or `/plumbbob:run`, clearing it otherwise (those
// strings can only come from a human keystroke, because `build` and `run` are
// disable-model-invocation: a grant the model could forge would be no grant).
// A run's grant is the steps left of the range the plan names, read from the
// active build's `intent.md` at the keystroke, and `RUN` beside it marks the
// range the run is landing. The harness also sends a background job's
// completion notice through this event, as a prompt the human never typed, so
// a notice ticks nothing, keeps the grant and the mark, and clears only the
// ending `RELAY` holds from an earlier turn. A typed prompt also emits ONE
// `UserPromptSubmit` additionalContext line when there is a beat to keep, so a
// fresh session (post-compaction, or a scripted `-p` turn where no skill prose
// is in context) still knows it: mid-step, a tangent is parked, not chased;
// at a pause or a stop whose card has shown, the message is the human's reply,
// answered in the model's own words and closed on the one line `handoff`
// prints, never on the card again (D110 (reply-after-the-card)). Guidance
// only: it blocks nothing. It ALWAYS exits 0 and any failure degrades to no
// output, so neither the tick nor the emit can ever wedge prompting.

import { readFileSync, writeFileSync } from 'node:fs'
import { parseBuildRanges, readRunArgs, resolveRun, type RunInput } from '../lib/orient.ts'
import {
  activeBuild,
  clearRelay,
  findSessionRoot,
  inSpike,
  intentPath,
  notePrompt,
  readPause,
  readPrompt,
  readRun,
  setGrant,
  setRun,
  stepPath,
  turnPath,
} from '../lib/sidecar.ts'
import { hasStep, normalizeStepList, readBuildArgs } from '../lib/steplist.ts'
import { waitingCard } from './handoff.ts'

/**
 * The hook entry point: apply the prompt, then emit the nudge when it counted
 * as a human turn.
 *
 * The session is the one the payload's `cwd` names when it names one, else
 * the one the process stands in, the rule the `Stop` check follows too, so the
 * turn that ticks and the turn that is judged are always the same session's.
 * Always returns 0: a broken turn must never wedge a prompt, so any failure is
 * swallowed and degrades to no output.
 */
export function turn(cwd: string, _args: ReadonlyArray<string>): number {
  try {
    const raw = readStdin()
    const { cwd: named, prompt } = readPayload(raw)
    const where = named !== null && findSessionRoot(named) !== null ? named : cwd
    if (applyTurn(where, raw)) {
      const context = turnContext(where, prompt)
      if (context !== null) process.stdout.write(context)
    }
  } catch {
    // A broken turn must never wedge a prompt: swallow and exit 0.
  }
  return 0
}

/**
 * The `UserPromptSubmit` additionalContext payload for the beat the session is
 * on, or null when there is none to keep.
 *
 * Three beats, read off the control files. A step whose pause card has shown
 * (STEP, and PAUSE naming that step's pause) is waiting for the human's call,
 * so the message is the reply to it: answered or acted on in the model's own
 * words, and closed on the one line `handoff` prints rather than the card
 * again (D110 (reply-after-the-card)). A step in flight with no card yet is
 * mid-build, where a tangent is a park and not an edit. A stop card waiting
 * for its reply is the pause's beat at a stop. At a pause or a stop, a
 * `prompt` asking to see the card (`show the pause`, the phrase the card's
 * `expand` move teaches) gets the one instruction that matters for it: paste
 * the `--full` output exactly as it printed, as the whole turn. Guidance only,
 * since none of the build, run, or park prose may be in context after
 * compaction or on a scripted turn. Exported because an in-process test cannot
 * read the hook's real stdout.
 */
export function turnContext(cwd: string, prompt = ''): string | null {
  const root = findSessionRoot(cwd)
  if (root === null) return null
  const text = nudgeText(root, SHOW_REQUEST.test(prompt))
  return text === null ? null : `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } })}\n`
}

// A message asking to see the card again: `show the pause` and `show the stop`,
// the phrases the card's `expand` move teaches, and `show me the card` beside
// them. In a fresh session the model ran `--full` on that request and then
// retyped the card behind a line of its own, three runs in five of the
// 2026-10-27 eval, because nothing in its context said how to relay it.
const SHOW_REQUEST = /\bshow\s+(?:me\s+)?the\s+(?:pause|stop|card)\b/i

/**
 * The nudge's words for the beat the session is on, or null when it is on
 * none: no step in flight and no stop card waiting. `showing` is a message
 * that asks to see the card, which at a pause or a stop takes the show nudge.
 */
function nudgeText(root: string, showing: boolean): string | null {
  const step = inFlightStep(root)
  if (step !== null) {
    const shown = readPause(root)
    if (shown?.kind !== 'pause' || shown.step !== step) return parkNudge(step)
    return showing ? showNudge(`step ${step}'s card`, 'plumbbob handoff --full') : pauseNudge(step)
  }
  const slug = activeBuild(root)
  let intent = ''
  try {
    intent = readFileSync(intentPath(root, slug), 'utf8')
  } catch {
    return null
  }
  const card = waitingCard(root, slug, intent)
  if (card === null) return null
  return showing
    ? showNudge(`range ${card.range} of ${card.count}'s stop card`, 'plumbbob handoff --stop --full')
    : stopNudge(card.range, card.count)
}

/**
 * The nudge when the human asks to see a card again: the one command and how
 * to relay what it prints, since the card is the whole turn and a retyped one
 * is the miss the relay check holds.
 */
function showNudge(card: string, command: string): string {
  return (
    `plumbbob: the human asked to see ${card} again. ` +
    `Run \`${command}\` and paste its output exactly as it printed, as the whole turn: ` +
    `no line before it, nothing after it, and nothing in it retyped, reworded, or cut.`
  )
}

/** The mid-build nudge: a tangent is a park, not an edit, and the step lands on approval. */
function parkNudge(step: number): string {
  return (
    `plumbbob: step ${step} is in flight — a new idea or tangent is a park, not an edit: ` +
    `capture it with \`plumbbob park "<one line>"\` and relay the block it prints whole, ` +
    `with nothing written around it, since that block is the whole turn. ` +
    `The one exception is a message that also asks something: answer the question first, ` +
    `then relay the park's block after the answer and write nothing after it. ` +
    `The block's pointer back at the step closes the turn either way, so run no \`plumbbob handoff\` after it. ` +
    `The step stays open and lands when you run \`plumbbob checkpoint ${step}\` after approval.`
  )
}

/** The nudge at a pause whose card has shown: the message is the reply, and the card is not printed again. */
function pauseNudge(step: number): string {
  return (
    `plumbbob: step ${step}'s card has shown, and this message is the human's reply to it. ` +
    `An approval lands the step: run \`plumbbob checkpoint ${step}\` and relay its ending. ` +
    `Anything else is answered in your own words: answer the question, or make the change it asks for, ` +
    `and when a change moves what the card said, write \`.plumbbob/detail.md\` again so the record matches what lands. ` +
    `Print no card for it: run \`plumbbob handoff\` and end the turn on the one line it prints, with nothing after it. ` +
    `Only when the human asks to see the card again, run \`plumbbob handoff --full\` and paste its output exactly as it printed, as the whole turn. ` +
    `A tangent the human hands you is still a park: \`plumbbob park "<one line>"\`.`
  )
}

/** The nudge at a stop card waiting for its reply: the stop's version of the pause's. */
function stopNudge(range: number, count: number): string {
  return (
    `plumbbob: range ${range} of ${count}'s stop card has shown, and this message is the human's reply to it. ` +
    `An approval records the stop: fold each confirmed blocker into the plan, then run \`plumbbob harvest\` and relay its ending. ` +
    `Anything else is answered in your own words: answer the question, or make the change it asks for ` +
    `(a lean is its line under the detail file's \`## Harvest\`). ` +
    `Print no card for it: run \`plumbbob handoff --stop\` and end the turn on the one line it prints, with nothing after it. ` +
    `Only when the human asks to see the card again, run \`plumbbob handoff --stop --full\` and paste its output exactly as it printed, as the whole turn.`
  )
}

/**
 * The in-flight step number, or null when no STEP marker is present.
 *
 * Absent means no step entered, or it already checkpointed. A garbled marker
 * reads as null (never an error), because the hook must not wedge a prompt.
 */
function inFlightStep(root: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(stepPath(root), 'utf8').trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * The testable core: apply one prompt given the raw hook stdin, and say
 * whether it counted as a human turn.
 *
 * A typed prompt ticks TURN and rewrites GRANT and the RUN mark. A notice
 * touches none of them, because the latch reads TURN passing a step's entry
 * stamp as its one sign that a human answered, and a grant the human typed has
 * to outlive a job that reports back partway through the range. A notice that starts a turn of
 * its own clears RELAY, whose ending was judged when its own turn ended; one
 * the harness folds into the running turn arrives under that turn's prompt id
 * and leaves RELAY alone, since the ending the turn just printed has yet to be
 * judged.
 *
 * Split from the fd-0 read so the unit tests can drive it directly: an
 * in-process test cannot feed fd 0 (the same constraint checkpoint's `--body`
 * lives under).
 */
export function applyTurn(cwd: string, raw: string): boolean {
  const root = findSessionRoot(cwd)
  if (root === null) return false // no active session above cwd: silent no-op.
  const { prompt, promptId } = readPayload(raw)
  const notice = isNotice(prompt)
  if (notice) {
    if (promptId === null || promptId !== readPrompt(root)) clearRelay(root)
  } else {
    writeFileSync(turnPath(root), `${readTurn(root) + 1}\n`)
    const minted = mintSafely(root, prompt)
    setGrant(root, minted.grant)
    setRun(root, minted.run)
  }
  // Last, so a record that cannot be written never costs the tick or the grant.
  notePrompt(root, promptId)
  return !notice
}

/**
 * Whether a prompt is the harness reporting on background work rather than
 * the human typing.
 *
 * Nothing in the payload marks one, but every notice opens on a frame of the
 * harness's own at its very first character: `<task-notification>` for a
 * finished shell job, a Monitor event, or a subagent's task, and
 * `<agent-message ` for a subagent's or another session's report. A misread
 * errs safe: a typed prompt taken for a notice costs one tick and one grant,
 * so the latch only grows stricter, while a notice taken for a typed prompt
 * is a turn no human took.
 */
export function isNotice(prompt: string): boolean {
  return prompt.startsWith('<task-notification>') || prompt.startsWith('<agent-message ')
}

// A build invocation, bare or namespaced, starting a token.
const BUILD_INVOCATION = /(?<![\w/.~-])\/(?:plumbbob:)?build\b/

// A run invocation: only the namespaced verb, since a bare `/run` reaches
// Claude Code's own skill, starting a token and ending at a space, a line's
// end, or sentence punctuation.
const RUN_INVOCATION = /(?<![\w/.~-])\/plumbbob:run(?=[\s.;:!?,]|$)/

/**
 * Derive the GRANT content from the human's prompt, or null to clear it.
 *
 * A grant is minted only from a literal `build` invocation the human typed:
 * `build` is disable-model-invocation, so this string can only come from a
 * human keystroke, never model-authored pressure: a grant the model can forge
 * is no grant. A range mints `steps <list>`, exactly the steps it names in
 * their normal form (`20, 5-9` mints `steps 5-9,20`), and beats `--auto`
 * (bounded wins), so a range that does not parse mints nothing rather than
 * falling back to `auto`. A bare `/build`, a bare step number, or any
 * non-invocation prompt mints nothing. The namespaced `/plumbbob:build` form is
 * honored alongside the bare one.
 *
 * The invocation must *start* a token: a slash preceded by a word character,
 * `/`, `.`, `-`, or `~` is a path segment (`src/build`, `./build`), not a
 * command the human fired, so it mints nothing.
 *
 * Only the invocation's own arguments can mint: the tokens that follow it on
 * its line, up to the first token that isn't a sanctioned argument (`--auto`, a
 * step number, or a range; the argument-hint sanctions nothing else). An
 * unrecognized flag ends the scan, so `/build --wip 2020-2024` mints
 * nothing: the `2020-2024` is never reached. An incidental range elsewhere in
 * the prompt (an issue number, a pasted `2020-2024`) is prose, not a grant.
 * Trailing sentence punctuation on an argument (`/build 1-3.`) is still the
 * argument the human typed.
 */
export function grantFromPrompt(prompt: string): string | null {
  const invocation = BUILD_INVOCATION.exec(prompt)
  if (invocation === null) return null
  const args = readBuildArgs(argumentLine(prompt, invocation))
  if (args.range) return args.steps === null ? null : `steps ${normalizeStepList(args.steps)}`
  return args.auto ? 'auto' : null
}

/**
 * The text an invocation's arguments are read from: the rest of its line.
 */
function argumentLine(prompt: string, invocation: RegExpExecArray): string {
  return prompt.slice(invocation.index + invocation[0].length).split('\n', 1)[0] ?? ''
}

/** What the hook read of the active build, for resolving a run; the range number comes from the prompt. */
export type BuildRead = Omit<RunInput, 'item'>

/** What one typed prompt leaves in GRANT and in the RUN mark: null clears each. */
export type Minted = { readonly grant: string | null; readonly run: number | null }

/**
 * The GRANT one typed prompt mints and the RUN mark it leaves, given the
 * active build as the hook read it (null when it could not) and the range the
 * RUN mark names now.
 *
 * Whichever invocation comes first in the prompt is the one the human fired.
 * A run mints `steps <what is left>` of the range the plan names at the
 * keystroke, and marks that range, so a later edit to the ranges or the build
 * order leaves both as they were. A bare range's run mints nothing and marks
 * nothing, since it builds its step to the pause, and so does a run that names
 * nothing it can walk, a span or a list of ranges, and a plan the hook could
 * not read. Any other prompt mints what `grantFromPrompt` reads, and keeps the
 * mark only while a step of the marked range waits at its pause, so a halt
 * inside the run approved with `looks good` still lands under it.
 */
export function mintFromPrompt(prompt: string, build: BuildRead | null, marked: number | null): Minted {
  const run = RUN_INVOCATION.exec(prompt)
  const first = BUILD_INVOCATION.exec(prompt)
  if (run === null || (first !== null && first.index < run.index)) {
    return { grant: grantFromPrompt(prompt), run: heldMark(build, marked) }
  }
  const args = readRunArgs(argumentLine(prompt, run))
  const resolved = args === null || build === null ? null : resolveRun({ ...build, item: args.item })
  if (resolved?.ok !== true || resolved.grant === null) return { grant: null, run: null }
  return { grant: resolved.grant, run: resolved.range.item }
}

/**
 * The RUN mark a prompt that is not a run leaves: the marked range while a
 * step it names is in flight, so waiting at its pause, else none.
 */
function heldMark(build: BuildRead | null, marked: number | null): number | null {
  if (build === null || marked === null || build.inFlight === null) return null
  const step = build.inFlight
  const range = parseBuildRanges(build.intent).ranges.find((r) => r.item === marked)
  return range !== undefined && hasStep(range.steps, step) ? marked : null
}

/**
 * What a typed prompt mints, read against the active build, degrading to no
 * grant and no mark on any failure, so a broken read can never leave the last
 * turn's grant standing.
 */
function mintSafely(root: string, prompt: string): Minted {
  try {
    return mintFromPrompt(prompt, readBuild(root), readRun(root))
  } catch {
    return { grant: null, run: null }
  }
}

/**
 * The active build as a run reads it: the plan's text, the step in flight,
 * and whether a spike is open; null when the plan cannot be read, which mints
 * no run.
 */
function readBuild(root: string): BuildRead | null {
  try {
    return { intent: readFileSync(intentPath(root), 'utf8'), inFlight: inFlightStep(root), spiking: inSpike(root) }
  } catch {
    return null
  }
}

/**
 * The `prompt`, `prompt_id`, and `cwd` fields of the UserPromptSubmit JSON, as
 * '' and null when any is absent.
 *
 * Absent, unparseable, or non-string input contributes nothing rather than
 * wedging the tool: the tick still lands (a human turn did occur), the empty
 * prompt clears any GRANT, a missing id records none, and a missing `cwd`
 * leaves the process's; the verb never throws over bad stdin.
 */
function readPayload(raw: string): { readonly prompt: string; readonly promptId: string | null; readonly cwd: string | null } {
  try {
    const parsed = JSON.parse(raw) as { prompt?: unknown; prompt_id?: unknown; cwd?: unknown }
    return {
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      promptId: typeof parsed.prompt_id === 'string' && parsed.prompt_id !== '' ? parsed.prompt_id : null,
      cwd: typeof parsed.cwd === 'string' && parsed.cwd !== '' ? parsed.cwd : null,
    }
  } catch {
    return { prompt: '', promptId: null, cwd: null }
  }
}

/**
 * The current TURN count, or 0 when the ledger is absent or unreadable.
 *
 * Starting from 0 means the first tick creates the file at 1.
 */
function readTurn(root: string): number {
  try {
    const n = Number.parseInt(readFileSync(turnPath(root), 'utf8').trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * Read the hook JSON from fd 0, degrading to '' on any failure.
 *
 * An interactive TTY never sends EOF, so skip the read there rather than hang
 * (mirrors checkpoint's `--body`); a read error degrades to '': extractPrompt
 * then clears the grant and the tick still lands.
 */
function readStdin(): string {
  if (process.stdin.isTTY === true) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}
