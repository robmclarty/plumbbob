// Mutations to the active build-log.md — the human-facing ledger. `park` appends to
// its Park list; `checkpoint` appends to its Log so the build's history accrues
// line-by-line *as it happens* rather than being reconstructed at finish (D-history).
// Pure string transforms (no fs, no classes — C1/C2); callers own the IO so these
// stay trivially testable.

// Append `line` after the last non-blank line of the `## <heading>` section — i.e.
// just before the next `## ` heading or EOF. Returns null when the section is absent
// so the caller can report rather than silently corrupt the doc.
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
  lines.splice(insertAt, 0, line)
  return lines.join('\n')
}

// The Log line `checkpoint` writes for a landed step: dated, names the step (its
// title when intent.md still carries it), and carries the short SHA. One line of the
// build's history — `/pb-finish` reads these instead of re-narrating the build.
// `stats` is the optional compact receipt (research/07 2b), e.g. `2 red, 34m` —
// null when nothing accrued, so a clean first-try step reads exactly as before.
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
