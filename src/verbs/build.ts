// `plumbbob build <n>` — read step n's seam from intent.md, write the normalized
// SEAM + STEP, and enter BUILD. Re-entering from REVIEW just re-derives the same
// seam and flips back to BUILD; it never checkpoints (only `done` commits).

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, intentPath, seamPath, stepPath, writeState } from '../lib/sidecar.ts'
import { parseStepSeam } from '../lib/intent.ts'

export function build(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const raw = args.find((a) => !a.startsWith('--'))
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) {
    process.stderr.write('plumbbob: build needs a step number. Try: plumbbob build 2.\n')
    return 1
  }
  const step = Number(raw)

  const parsed = parseStepSeam(readFileSync(intentPath(root), 'utf8'), step)
  if (!parsed.ok) {
    process.stderr.write(`plumbbob: ${parsed.error} Fix the step's seam in intent.md, then \`build ${step}\` again.\n`)
    return 1
  }

  writeFileSync(seamPath(root), `${parsed.seam.join('\n')}\n`)
  writeFileSync(stepPath(root), `${step}\n`)
  writeState(root, 'BUILD')

  process.stdout.write(
    `plumbbob: building step ${step} — STATE=BUILD. Edits are limited to the seam:\n${parsed.seam.map((p) => `  ${p}`).join('\n')}\n`,
  )
  return 0
}
