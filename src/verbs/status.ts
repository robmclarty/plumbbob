// `plumbbob status` — the orientation dashboard, or NO ACTIVE SESSION. It
// parses the live session — intent.md, the build-log, the checkpoints ledger,
// the in-flight STEP marker — into a where-am-I view that suggests one primary
// next move while printing the full picture, so you can always override.
// Read-only, always exits 0. Skills pre-inject this output to gate their own
// behavior, so the `NO ACTIVE SESSION` sentinel is kept exact.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitsSince, findRepoRoot } from '../lib/git.ts'
import {
  SLOTS,
  type HarnessBindings,
  type SlotBindings,
  readHarnessFile,
  resolveAgent,
} from '../lib/agents.ts'
import {
  buildFolder,
  buildLogPath,
  checkpointsPath,
  hasSession,
  inSpike,
  intentPath,
  listBuilds,
  resolveBuild,
  stepPath,
} from '../lib/sidecar.ts'
import { formatOrientation, lastLedgerSha, orient } from '../lib/orient.ts'

/**
 * Read a file as utf8, or '' when it is missing or unreadable.
 */
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Print the orientation dashboard for the active build, plus its harness bindings.
 *
 * No session prints the exact `NO ACTIVE SESSION` sentinel; a session with
 * builds but no active one lists them and points at `use`. Always exits 0 —
 * status is a report, never a gate.
 */
export function status(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stdout.write('NO ACTIVE SESSION\n')
    return 0
  }
  // A session with builds but no resolvable cursor (finish cleared it, or the repo
  // holds several builds and none is active) has no single dashboard to show, so
  // list the builds and point at `use` instead of rendering a broken, empty one.
  const { build: slug } = resolveBuild(root, args)
  if (slug === null) {
    const builds = listBuilds(root)
    if (builds.length > 0) {
      process.stdout.write(
        `NO ACTIVE BUILD — pick one with \`plumbbob use <slug>\`:\n${builds.map((b) => `  ${b}`).join('\n')}\n`,
      )
      return 0
    }
  }
  const inFlightRaw = readOr(stepPath(root, slug)).trim()
  // Out-of-band commits — ones that landed outside the checkpoints ledger — are
  // surfaced here, never blocked. Counting them needs git (orient is pure), so
  // status measures it: commits on HEAD since the last ledger line's SHA —
  // baseline, plan, or step, so a commit landing before the first step
  // checkpoint still surfaces. No ledger yet ⇒ nothing to reconcile against ⇒ 0.
  const checkpoints = readOr(checkpointsPath(root, slug))
  const anchor = lastLedgerSha(checkpoints)
  const orientation = orient({
    intent: readOr(intentPath(root, slug)),
    buildLog: readOr(buildLogPath(root, slug)),
    checkpoints,
    inFlight: /^\d+$/.test(inFlightRaw) ? Number(inFlightRaw) : null,
    spiking: inSpike(root, slug),
    outOfBand: anchor === null ? 0 : commitsSince(root, anchor),
  })
  const lines = [formatOrientation(orientation), ...harnessSection(root, slug)]
  process.stdout.write(`${lines.join('\n')}\n`)
  return 0
}

/**
 * The active build's harness bindings: the agents bound to each slot, per
 * `defaults` and per step.
 *
 * Bindings live in `builds/<slug>/harness.json` and status is the surface that
 * reports them — no separate `agent check` verb. Any bound agent that does not
 * resolve gets a warning, not an error: a teammate can lack a personal agent
 * and the loop still works. Returns [] when the build has no harness.json (a
 * clean no-op) or the file binds nothing, so the dashboard stays uncluttered
 * for builds that use no agents. A broken harness.json surfaces its parse
 * error rather than hiding.
 */
function harnessSection(root: string, slug: string | null): string[] {
  const parsed = readHarnessFile(join(buildFolder(root, slug), 'harness.json'))
  if (parsed === null) return []
  if (!parsed.ok) return ['', `harness bindings: ✗ ${parsed.error}`]

  const harness = parsed.harness
  const rows: string[] = []
  for (const frag of slotFragments(harness.defaults)) rows.push(`  defaults · ${frag}`)
  for (const [n, binding] of [...harness.steps.entries()].sort((a, b) => a[0] - b[0])) {
    for (const frag of slotFragments(binding.bindings)) rows.push(`  step ${n} · ${frag}`)
    if (binding.note.length > 0) rows.push(`  step ${n} · note: ${binding.note}`)
  }
  if (rows.length === 0) return []

  return ['', 'harness bindings:', ...rows, ...bindingWarnings(root, harness)]
}

/**
 * Render a SlotBindings as `slot: name1, name2` fragments, in slot order.
 *
 * A slot bound to no agents (an explicit "override to none") is omitted —
 * there is nothing to run and nothing to name.
 */
function slotFragments(bindings: SlotBindings): string[] {
  const out: string[] = []
  for (const slot of SLOTS) {
    const names = bindings[slot]
    if (names !== undefined && names.length > 0) out.push(`${slot}: ${names.join(', ')}`)
  }
  return out
}

/**
 * A warning line for every distinct agent bound anywhere in the harness that
 * does not resolve.
 *
 * Deduped and sorted so the report is stable; a name bound in several slots
 * warns once.
 */
function bindingWarnings(root: string, harness: HarnessBindings): string[] {
  const names = new Set<string>()
  for (const slot of SLOTS) for (const name of harness.defaults[slot] ?? []) names.add(name)
  for (const binding of harness.steps.values()) {
    for (const slot of SLOTS) for (const name of binding.bindings[slot] ?? []) names.add(name)
  }
  const warnings: string[] = []
  for (const name of [...names].sort()) {
    const res = resolveAgent(root, name)
    if (!res.ok) warnings.push(`  ⚠ bound agent "${name}" does not resolve — ${res.error}`)
  }
  return warnings
}
