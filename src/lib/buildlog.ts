// Mutations to the active build-log.md: the human-facing ledger inside the
// build's tracked `builds/<slug>/` folder. `park` appends to its Park list;
// `checkpoint` appends to its Log so the build's history accrues line-by-line
// *as it happens* rather than being reconstructed at finish. The `## Steps`
// mirror and `**Current step:**` line are CLI-owned: `build`, `checkpoint`,
// and `revert` re-render them from intent.md so the ledger's top half tracks
// reality without a model turn. Pure string transforms: no fs, no classes;
// callers own the IO so these stay trivially testable.

import type { Step } from './orient.ts'

/**
 * Append `line` after the last non-blank line of the `## <heading>` section:
 * that is, just before the next `## ` heading or EOF.
 *
 * When `line` is a list item and the line above it is prose (the Park list's
 * guidance blockquote, the Log's instructions paragraph), a blank line goes in
 * first. Markdown wants lists separated from prose (MD032), and a consumer
 * repo that lints `.plumbbob/**` turns the missing blank into a red gate at
 * the first park or checkpoint of a build.
 *
 * Returns null when the section is absent so the caller can report rather than
 * silently corrupt the doc.
 */
export function appendToSection(content: string, heading: string, line: string): string | null {
  const lines = content.split('\n')
  const headingIdx = lines.findIndex((l) => l.trim() === `## ${heading}`)
  if (headingIdx === -1) {
    return null
  }
  let nextSection = lines.findIndex((l, i) => i > headingIdx && l.startsWith('## '))
  if (nextSection === -1) {
    nextSection = lines.length
  }
  let insertAt = headingIdx + 1
  for (let i = headingIdx + 1; i < nextSection; i++) {
    if ((lines[i] ?? '').trim() !== '') {
      insertAt = i + 1
    }
  }
  const prev = lines[insertAt - 1] ?? ''
  const needsBlank = isListLine(line) && prev.trim() !== '' && !isListLine(prev)
  lines.splice(insertAt, 0, ...(needsBlank ? ['', line] : [line]))
  return lines.join('\n')
}

/**
 * A markdown list line: `-`, `*`, or `+` after optional indent. Every caller
 * of appendToSection appends one of these, so the blank-line rule above keys
 * on the line it lands after, not on which verb is writing.
 */
function isListLine(line: string): boolean {
  return /^\s*[-*+]\s/.test(line)
}

/**
 * Replace the `**Current step:**` line with `**Current step:** <label>`:
 * `build` sets it to the step's number and title joined by an em dash when a
 * step opens; `checkpoint`/`revert` reset it to `none (at the boundary)`.
 *
 * Returns null when the line is absent so the caller skips rather than
 * corrupting the doc.
 */
export function setCurrentStep(content: string, label: string): string | null {
  const lines = content.split('\n')
  const idx = lines.findIndex((l) => /^\*\*Current step:\*\*/.test(l.trim()))
  if (idx === -1) {
    return null
  }
  lines[idx] = `**Current step:** ${label}`
  return lines.join('\n')
}

/**
 * Regenerate the `## Steps` mirror from intent.md's parsed steps: one
 * `- ☑/☐ N. <title>` line each, in order.
 *
 * Only the mirror's own `- ☑/☐` list lines are owned; the italic instructions
 * paragraph (and any other prose) is preserved, and exactly one blank line
 * separates it from the list. Returns null when the section is absent so the
 * caller skips rather than corrupting the doc. With no steps the mirror
 * renders empty (the plan is not authored yet) rather than inventing a
 * placeholder.
 */
export function syncStepsSection(content: string, steps: ReadonlyArray<Step>): string | null {
  const lines = content.split('\n')
  const headingIdx = lines.findIndex((l) => l.trim() === '## Steps')
  if (headingIdx === -1) {
    return null
  }
  let end = lines.findIndex((l, i) => i > headingIdx && l.startsWith('## '))
  if (end === -1) {
    end = lines.length
  }
  // The section body minus the mirror list lines, with trailing blanks trimmed,
  // is the prose to preserve (the instructions paragraph). Rebuild: prose, one
  // blank, the fresh list, one blank before the next heading.
  const prose = lines.slice(headingIdx + 1, end).filter((l) => !isMirrorLine(l))
  while (prose.length > 0 && (prose.at(-1) ?? '').trim() === '') {
    prose.pop()
  }
  const list = steps.map((s) => `- ${s.done ? '☑' : '☐'} ${s.n}. ${s.title}`)
  const body = [...prose, ...(prose.length > 0 ? [''] : []), ...list, '']
  return [...lines.slice(0, headingIdx + 1), ...body, ...lines.slice(end)].join('\n')
}

/**
 * A mirror list line the CLI owns: `- ☑ …` / `- ☐ …`. The template's initial
 * `- ☐ 1. <step>` placeholder matches, so the first sync replaces it in place.
 */
function isMirrorLine(line: string): boolean {
  return /^-\s+[☑☐]/.test(line)
}

/**
 * The Log line `checkpoint` writes for a landed step: dated, names the step
 * (its title when intent.md still carries it), and carries the short SHA.
 *
 * One line of the build's history: `/plumbbob:finish` reads these instead of
 * re-narrating the build. `stats` is the optional compact receipt of what the
 * step cost (for example `2 red, 34m`): null when nothing accrued, so a clean
 * first-try step reads as a bare line.
 */
export function checkpointLogLine(
  date: string,
  step: number,
  sha: string,
  title: string | null,
  stats: string | null = null,
): string {
  const head = `- ${date} — step ${step} checkpointed · ${sha.slice(0, 9)}`
  const titled = title !== null && title.length > 0 ? `${head} — ${title}` : head
  return stats !== null && stats.length > 0 ? `${titled} (${stats})` : titled
}

/**
 * The Log line `checkpoint --plan` writes when the plan lands: dated, with the
 * short SHA. The cold read's record rides beneath it, so the first entry of a
 * build's history is the plan and the read that approved it.
 */
export function planLogLine(date: string, sha: string): string {
  return `- ${date} — plan committed · ${sha.slice(0, 9)}`
}

/**
 * A Log entry: the dated line and, beneath it, the record of what landed (the
 * pause as the human approved it), blank-line separated and indented two
 * spaces so it nests as the line's own content. Blank lines inside the record
 * stay bare rather than carrying the indent. A null record is the bare line,
 * which is what a hand-built step with no detail file gets.
 */
export function logEntry(line: string, record: string | null): string {
  if (record === null || record.trim().length === 0) {
    return line
  }
  const nested = record.split('\n').map((l) => (l.trim().length === 0 ? '' : `  ${l}`))
  return [line, '', ...nested].join('\n')
}

/**
 * The Log line `abandon` writes for a dropped-but-kept step: the first
 * non-checkpoint event the log records. Dated, names the step (its title when
 * intent.md still carries it), and states plainly that the work stayed in the
 * tree, so the narrative never has a step go quiet mid-flight.
 */
export function abandonLogLine(date: string, step: number, title: string | null): string {
  const head = `- ${date} — step ${step} abandoned · work kept in tree`
  return title !== null && title.length > 0 ? `${head} — ${title}` : head
}
