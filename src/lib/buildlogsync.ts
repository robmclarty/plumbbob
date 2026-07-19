// Keep the build-log's top half — the `**Current step:**` line and the `## Steps`
// mirror — in sync with intent.md (D69). `build` sets the current-step label when a
// step opens; `checkpoint` and `revert` reset it to the boundary; all three re-render
// the mirror from intent.md's parsed steps so it tracks reality without a model turn.
// The write is best-effort (a missing or hand-edited build-log never fails a verb —
// the checkpoints ledger and intent.md stay the source of truth), matching how
// `checkpoint`'s Log append already behaves.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildLogPath, intentPath } from './sidecar.ts'
import { parseSteps } from './orient.ts'
import { setCurrentStep, syncStepsSection } from './buildlog.ts'

export const AT_BOUNDARY = 'none (at the boundary)'

// The current-step label for an open step: `<n> — <title>`, or a bare `<n>` when the
// step carries no title. `build` passes this; the boundary verbs pass AT_BOUNDARY.
export function stepLabel(n: number, title: string | null): string {
  return title !== null && title.trim().length > 0 ? `${n} — ${title.trim()}` : String(n)
}

// Rewrite the active build's build-log top half: set the Current step line to `label`
// and re-render the `## Steps` mirror from intent.md. Each transform is skipped when
// its target is absent (null), and the whole thing swallows any IO error — the ledger
// must never block the verb.
export function syncBuildLogState(root: string, slug: string | null, label: string): void {
  try {
    const path = buildLogPath(root, slug)
    const steps = parseSteps(readFileSync(intentPath(root, slug), 'utf8'))
    let content = readFileSync(path, 'utf8')
    content = setCurrentStep(content, label) ?? content
    content = syncStepsSection(content, steps) ?? content
    writeFileSync(path, content)
  } catch {
    // best-effort ledger; never fail a verb over the build-log.
  }
}
