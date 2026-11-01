// `plumbbob defer <Qn> "<what settles it>"`: leave an open question to the
// work. The marker it writes on the question's opener in intent.md,
// `*deferred:* <date>, until <what settles it>`, is the one thing every count
// reads to tell a question that waits on the human from one that waits on
// the work (D120 (deferred-questions)). Until this verb the marker was a hand
// edit made only at the plan card, so a question set aside anywhere else (parked
// mid-step, or settled as a tangent at a harvest) kept counting as a call
// owed. The skill decides and the CLI records (D123 (defer-records)): deferring
// stays the human's call, and the verb only writes it, dated, in the one form
// the parser reads. Like park it changes no state the loop runs on, so it runs
// in any context.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { activeBuild, hasSession, intentPath } from '../lib/sidecar.ts'
import { deferQuestion, type OpenQuestion, questionsToAnswerNamed } from '../lib/orient.ts'
import { advisory, ending, notice, printEnding, transition } from '../lib/notice.ts'
import { driverPointer } from './handoff.ts'

// What every refusal about the arguments points at.
const USAGE = 'plumbbob defer Q3 "<what settles it>"'

/**
 * Mark the named open question deferred until what the rest of the arguments
 * say will settle it, and print the ending: the deferral and the pointer.
 *
 * A leading "until" in the text is dropped, since the marker writes its own.
 * Refuses (exit 1) with no session, no question handle, no until-clause, a
 * handle the open questions lack, or a question already resolved.
 */
export function defer(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(
      notice({ fact: 'no active session', detail: ['no open questions to defer'], remedy: 'plumbbob start "<title>"' }),
    )
    return 1
  }
  const [handle = '', ...rest] = args.filter((a) => !a.startsWith('--'))
  const id = /^Q(\d+)$/i.exec(handle.trim())
  if (id === null) {
    process.stderr.write(notice({ fact: 'defer needs a question', detail: ['its handle first, Q3'], remedy: USAGE }))
    return 1
  }
  const question = `Q${id[1] ?? ''}`
  const until = rest
    .join(' ')
    .trim()
    .replace(/^until\s+/i, '')
  if (until.length === 0) {
    process.stderr.write(
      notice({
        fact: 'defer needs what settles it',
        detail: ['the work the question waits on'],
        remedy: `plumbbob defer ${question} "<what settles it>"`,
      }),
    )
    return 1
  }
  const path = intentPath(root)
  const date = new Date().toISOString().slice(0, 10)
  const deferral = deferQuestion(readFileSync(path, 'utf8'), question, date, until)
  if (deferral.kind === 'resolved') {
    process.stderr.write(notice({ fact: `${question} is already resolved`, detail: ['its opener says so'] }))
    return 1
  }
  if (deferral.kind === 'missing') {
    process.stderr.write(
      notice({
        fact: `no open ${question} in the plan`,
        detail: [deferral.open.length === 0 ? 'no open questions' : `open: ${deferral.open.join(', ')}`],
        remedy: 'fix the handle',
      }),
    )
    return 1
  }
  writeFileSync(path, deferral.intent)
  printEnding(root, {
    tier: 'driver',
    render: 'defer',
    text: ending({
      // The parser hands back the marker's until-clause as the opener now
      // reads it, `until` and all, so the lead says what the file says.
      lead: transition({ label: 'Deferred', fact: `${plainHandle(deferral.question)} ${deferral.question.deferred ?? `until ${until}`}` }),
      pointer: driverPointer(root, activeBuild(root)),
    }),
  })
  return 0
}

/**
 * One advisory for each open question a park or a tangent names that still
 * counts as a call owed, with the deferral beneath it: setting a question
 * aside does not defer it, and the card would go on counting it as to answer.
 * Empty when the text names none.
 */
export function setAsideAdvisories(text: string, rows: ReadonlyArray<OpenQuestion>): string[] {
  return questionsToAnswerNamed(text, rows).map((q) =>
    advisory({
      fact: `${plainHandle(q)} still counts as a question to answer`,
      remedy: `plumbbob defer ${q.id} "<what settles it>", if the work will settle it`,
    }),
  )
}

/** A question's handle as a line of prose names it: the id, then its slug. */
function plainHandle(q: OpenQuestion): string {
  return q.slug === null ? q.id : `${q.id} (${q.slug})`
}
