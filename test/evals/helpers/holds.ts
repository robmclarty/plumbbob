// The relay check's holds, read from a session's own transcript (D89
// (block-once)). A hold is the Stop hook keeping a turn open over an ending the
// turn did not carry: the harness records it as a `hook_additional_context`
// attachment from Stop, between the text the model wrote first and the retry.
// fascicle joins every text part of a session into one string, so the session
// text alone cannot say where the hold fell; the transcript can.
//
// Each hold is also judged against the anatomy probes the receipt already
// reports: whether the text before the hold carried the ending whole. A hold on
// an ending that was already whole is a false hold, and a false hold is what
// would reopen D89 (block-once).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { anatomyChecks, type Tier } from './anatomy.ts'

export type RelayHold = {
  // The reason the hook gave, as the model and the human read it.
  readonly reason: string
  // The tier the missed ending belongs to, read off the reason; null when the
  // reason names none this reader knows.
  readonly tier: Tier | null
  // Whether the session's text before the hold already carried that ending
  // whole, by the anatomy probes.
  readonly whole: boolean
}

// What the relay check's reasons open with: every hold this reader counts is
// plumbbob's own, never another Stop hook's context. A run's boundary that
// still owes its stop card opens `the turn ended on`, the rest `the turn did not`.
const REASON_PREFIX = 'plumbbob: the turn '

// Where Claude Code keeps a session's transcript: one folder per working
// directory, one JSONL file per session.
const PROJECTS_DIR = join(homedir(), '.claude', 'projects')

// The holds in one session, in order, or none when its transcript is not on
// disk. Read after the session has ended, when every entry has landed.
export function sessionHolds(sessionId: string | null): ReadonlyArray<RelayHold> {
  if (sessionId === null) return []
  const path = transcriptPath(sessionId)
  if (path === null) return []
  try {
    return holdsIn(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

function transcriptPath(sessionId: string): string | null {
  try {
    for (const dir of readdirSync(PROJECTS_DIR)) {
      const path = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`)
      if (existsSync(path)) return path
    }
  } catch {
    // No projects folder: no transcript to read.
  }
  return null
}

// The holds in a transcript's JSONL text, each judged against the assistant
// text that came before it. Exported for the model-free helper test.
export function holdsIn(jsonl: string): ReadonlyArray<RelayHold> {
  const texts: string[] = []
  const holds: RelayHold[] = []
  for (const line of jsonl.split('\n')) {
    const entry = parse(line)
    if (entry === null) continue
    if (entry.type === 'assistant') texts.push(...assistantTexts(entry))
    const reason = holdReason(entry)
    if (reason === null) continue
    const tier = tierOf(reason)
    holds.push({ reason, tier, whole: tier !== null && alreadyWhole(texts.join('\n\n'), tier) })
  }
  return holds
}

type Entry = {
  readonly type?: unknown
  readonly message?: { readonly content?: unknown }
  readonly attachment?: { readonly type?: unknown; readonly hookName?: unknown; readonly content?: unknown }
}

function parse(line: string): Entry | null {
  if (line.trim().length === 0) return null
  try {
    const entry = JSON.parse(line) as unknown
    return typeof entry === 'object' && entry !== null ? (entry as Entry) : null
  } catch {
    return null
  }
}

function assistantTexts(entry: Entry): string[] {
  const content = entry.message?.content
  if (!Array.isArray(content)) return []
  return content.flatMap((part: { type?: unknown; text?: unknown } | null) =>
    part?.type === 'text' && typeof part.text === 'string' ? [part.text] : [],
  )
}

function holdReason(entry: Entry): string | null {
  const a = entry.attachment
  if (entry.type !== 'attachment' || a?.type !== 'hook_additional_context' || a.hookName !== 'Stop') return null
  const content = Array.isArray(a.content) ? a.content.filter((c): c is string => typeof c === 'string') : []
  return content.find((c) => c.startsWith(REASON_PREFIX)) ?? null
}

// The tier a reason names, read off the words relay.ts writes into it.
function tierOf(reason: string): Tier | null {
  if (reason.includes('the pause card')) return 'decision'
  if (reason.includes('the pause reminder') || reason.includes('the stop reminder')) return 'reminder'
  if (reason.includes('the plan card')) return 'plan'
  // Both a stop card printed and dropped and one never printed at all.
  if (reason.includes('stop card')) return 'stop'
  if (reason.includes('did not relay the block')) return 'boundary'
  return null
}

// Whether text already carried an ending of the tier whole: every part in
// order, and for the endings that have to close the turn, nothing after them.
// A boundary may have an answer after it, since an approving message can carry
// a question, so its probe is the shape alone.
function alreadyWhole(text: string, tier: Tier): boolean {
  const owed = new Set([
    `anatomy: ${tier} ending renders whole`,
    ...(tier === 'boundary' ? [] : [tier === 'reminder' ? 'anatomy: nothing after the reminder' : 'anatomy: nothing after the relay']),
  ])
  const checks = anatomyChecks(text, tier).filter((c) => owed.has(c.name))
  return checks.length === owed.size && checks.every((c) => c.pass)
}
