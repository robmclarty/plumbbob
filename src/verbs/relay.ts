// `plumbbob relay`: the relay check. Wired to the harness's Stop event, it runs
// as the model ends a turn and asks one question: did the turn carry the ending
// plumbbob printed in it? Every ending a verb prints is recorded in `RELAY`
// with its tier and the `TURN` it printed in, and the tier picks the match. A
// decision ending (a pause card, its reminder, the plan card) has to close the
// turn, with an answer allowed above it; an orientation ending (a checkpoint's
// boundary, the plan commit, finish) has to appear somewhere in the turn, since
// an approving message can carry a question the model answers after it; a
// driver ending is never checked. A `RELAY` from an earlier turn is not this
// turn's to carry, so the check runs only while its turn is the current one.
//
// On a miss it holds the turn open once, through `additionalContext`, with a
// one-line reason the model acts on and the human reads under `Stop hook
// feedback`: a decision ending is reprinted by the command `RELAY` recorded,
// because the stored card goes stale once the model keeps working, and an
// orientation ending is pasted as it printed, since it reports a commit that
// has already landed. The once is counted in `RELAY` by the turn it held,
// never by `stop_hook_active`, which checkride's gate sets on every red Stop
// and which names no hook. It never sends `continue: false`, which would cancel
// a sibling's block in the same round.
//
// The final message comes from the payload's `last_assistant_message`, never
// from the transcript, which does not yet hold that message when Stop fires;
// the transcript supplies only the turn's earlier messages, which an
// orientation ending can sit in. It ALWAYS exits 0, and anything it cannot read
// (a payload without the field, a transcript it cannot scope) degrades to no
// output: a broken check must never wedge a turn's end.

import { readFileSync } from 'node:fs'
import { findSessionRoot, holdRelay, readRelay, readTurn, type RelayRecord } from '../lib/sidecar.ts'

/**
 * The hook entry point: read the Stop payload, and hold the turn open once when
 * it did not carry its ending.
 *
 * Always returns 0: any failure is swallowed and degrades to no output.
 */
export function relay(cwd: string, _args: ReadonlyArray<string>): number {
  try {
    const output = relayCheck(cwd, readStdin())
    if (output !== null) process.stdout.write(output)
  } catch {
    // A broken check must never wedge a turn's end: swallow and exit 0.
  }
  return 0
}

/**
 * The hook's stdout for one Stop payload: the `additionalContext` that holds
 * the turn open, or null when the turn carried its ending or there is nothing
 * this check can judge.
 *
 * Exported because an in-process test cannot feed the hook's real stdin.
 */
export function relayCheck(cwd: string, raw: string): string | null {
  const payload = parsePayload(raw)
  // A host too old to send the final message has nothing to check against.
  if (payload === null || typeof payload.last_assistant_message !== 'string') return null
  const root = findSessionRoot(typeof payload.cwd === 'string' ? payload.cwd : cwd)
  if (root === null) return null
  const record = readRelay(root)
  const turn = readTurn(root)
  if (record === null || turn === null || record.turn !== turn || record.held === turn) return null
  const carried = carriedEnding(record, payload.last_assistant_message, payload)
  // Whole, or not this check's to judge: let the turn end.
  if (carried !== false) return null
  // A hold that cannot be counted could repeat, so it is no hold at all.
  if (!holdRelay(root, record)) return null
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: reason(record) } })}\n`
}

/** The Stop payload fields the check reads, every one optional on the wire. */
type StopPayload = {
  readonly cwd?: unknown
  readonly last_assistant_message?: unknown
  readonly transcript_path?: unknown
  readonly prompt_id?: unknown
}

/**
 * Whether the turn carried the recorded ending: true when it did, false when
 * it did not, and null when the tier is not checked or the turn's earlier text
 * cannot be read to tell.
 */
function carriedEnding(record: RelayRecord, last: string, payload: StopPayload): boolean | null {
  const expected = flat(record.text.replace(/^\s*---[ \t]*\n/, ''))
  if (expected.length === 0 || record.tier === 'driver') return null
  if (record.tier === 'decision') return flat(last).endsWith(expected)
  if (flat(last).includes(expected)) return true
  const earlier = turnText(payload)
  return earlier === null ? null : flat(earlier).includes(expected)
}

/**
 * The one-line reason the model acts on and the human reads in full: what the
 * turn missed, and the command or block that puts it back.
 */
function reason(record: RelayRecord): string {
  if (record.tier === 'decision') {
    const command = record.command ?? 'plumbbob handoff --full'
    return (
      `plumbbob: the turn did not close on the ${DECISION_NAMES[record.render] ?? 'pause'} it printed. ` +
      `Run \`${command}\` and end the turn on its output, whole, with nothing after it.`
    )
  }
  const verb = ORIENTATION_VERBS[record.render] ?? 'plumbbob handoff'
  return (
    `plumbbob: the turn did not relay the block \`${verb}\` printed. ` +
    'Paste that block whole, exactly as it printed (it is stored below the header in `.plumbbob/RELAY`).'
  )
}

// What a decision ending is called in the reason, by its render.
const DECISION_NAMES: Readonly<Record<string, string>> = {
  card: 'pause card',
  reminder: 'pause reminder',
  plan: 'plan card',
}

// The command that printed an orientation ending, by its render, so the reason
// names the block the model already has in front of it.
const ORIENTATION_VERBS: Readonly<Record<string, string>> = {
  checkpoint: 'plumbbob checkpoint',
  'plan-commit': 'plumbbob checkpoint --plan',
  finish: 'plumbbob finish',
}

/**
 * The text of the turn's messages already on disk: every assistant text part
 * after the human prompt the payload's `prompt_id` names.
 *
 * Null when the transcript cannot be read or that prompt is not in it: a turn
 * the check cannot scope is a turn it does not judge. A line that does not
 * parse is skipped, since the one being written as Stop fires is the final
 * message, which the payload carries already.
 */
function turnText(payload: StopPayload): string | null {
  if (typeof payload.transcript_path !== 'string' || typeof payload.prompt_id !== 'string') return null
  let lines: ReadonlyArray<string>
  try {
    lines = readFileSync(payload.transcript_path, 'utf8').split('\n')
  } catch {
    return null
  }
  const entries = lines.map(parseEntry).filter((e): e is TranscriptEntry => e !== null)
  const start = entries.findIndex((e) => e.type === 'user' && e.promptId === payload.prompt_id && e.isMeta !== true)
  if (start === -1) return null
  return entries
    .slice(start + 1)
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => {
      const content = e.message?.content
      return Array.isArray(content) ? (content as ReadonlyArray<ContentPart | null>) : []
    })
    .flatMap((part) => (part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []))
    .join('\n')
}

/** One part of a message's content, as loose as the JSONL that carries it. */
type ContentPart = { readonly type?: unknown; readonly text?: unknown }

/** The transcript fields the scope reads, as loose as the JSONL that carries them. */
type TranscriptEntry = {
  readonly type?: unknown
  readonly promptId?: unknown
  readonly isMeta?: unknown
  readonly message?: { readonly content?: unknown }
}

/** One transcript line as an entry, or null when it is blank or does not parse. */
function parseEntry(line: string): TranscriptEntry | null {
  if (line.trim().length === 0) return null
  try {
    const entry = JSON.parse(line) as unknown
    return typeof entry === 'object' && entry !== null ? (entry as TranscriptEntry) : null
  } catch {
    return null
  }
}

/** The Stop payload, or null when stdin is not a JSON object. */
function parsePayload(raw: string): StopPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as StopPayload) : null
  } catch {
    return null
  }
}

/**
 * Text with every run of whitespace collapsed to one space and the ends
 * trimmed, so a relay that rewraps a line or drops a trailing blank still
 * matches the block it relayed.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The hook payload from stdin, or '' on a TTY or any read failure: a check
 * that cannot read its payload judges nothing.
 */
function readStdin(): string {
  if (process.stdin.isTTY === true) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}
