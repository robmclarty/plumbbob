// `plumbbob recover`: read the control plane and say, plainly, whether it is
// telling the truth. Nothing else reads these files as a set: `doctor` checks
// the install and the gate, `status` reports what the markers claim without
// questioning them. So a session that crashed, lost its context window, or was
// switched away mid-step can sit in a state no verb detects: the worst being a
// cursor pointing at a build that no longer exists, which renders a perfectly
// plausible empty dashboard instead of an error.
//
// Diagnosis is free and repair is asked for by name (`--fix`), the same posture
// `doctor --migrate` takes. What `--fix` may touch is deliberately narrow: only
// the untracked control files this tool owns and can rewrite from what it
// already knows. It never touches a tracked artifact (intent, build-log,
// checkpoints, reports), never touches git, and never advances the loop: a
// recovery verb that could land a step would be a second, quieter checkpoint.
//
// Spike leftovers are reported and never removed: those worktrees live outside
// the repo root and may hold work nobody copied out, so naming them is help and
// deleting them is a gamble the human should take by hand.

import { existsSync, readFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { parseSteps } from '../lib/orient.ts'
import {
  activeBuild,
  checkpointsPath,
  clearHandoff,
  clearTick,
  grantPath,
  handoffPath,
  hasSession,
  intentPath,
  inSpike,
  listBuilds,
  readTurn,
  setActiveBuild,
  setGrant,
  stepPath,
  tickPath,
} from '../lib/sidecar.ts'
import { spikeBranches, spikeWorktrees } from './spike.ts'

/**
 * One thing recover looked at.
 *
 * `repair` present means `--fix` can put it right on its own; its absence is
 * the honest signal that the call needs a human, and `hint` is what they need
 * to make it.
 */
type Finding = {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
  readonly hint?: string
  readonly repair?: () => void
  readonly repaired?: string
}

/**
 * Report every inconsistency in the control plane, and with `--fix` repair the
 * ones that can be repaired without judgment.
 *
 * Exits 0 when the control plane is consistent (or when every problem found was
 * fixed), 1 while any problem is still standing, so a scripted caller can tell
 * "clean" from "you still have to look at this".
 */
export function recover(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write('plumbbob: not a git repository — recover reads a repo\'s control plane.\n')
    return 1
  }
  const fix = args.includes('--fix')

  const findings = [...sessionFindings(root), ...spikeOrphanFindings(root)]
  const lines = ['', 'plumbbob recover — control plane']
  let standing = 0

  for (const finding of findings) {
    if (finding.ok) {
      lines.push(`  ✓ ${finding.name}: ${finding.detail}`)
      continue
    }
    if (fix && finding.repair !== undefined) {
      finding.repair()
      lines.push(`  ✓ ${finding.name}: ${finding.repaired ?? finding.detail}`)
      continue
    }
    standing += 1
    lines.push(`  ✗ ${finding.name}: ${finding.detail}`)
    if (finding.hint !== undefined) lines.push(`    → ${finding.hint}`)
  }

  const fixable = findings.filter((f) => !f.ok && f.repair !== undefined).length
  lines.push('', summary(standing, fixable, fix), '')
  process.stdout.write(lines.join('\n'))
  return standing > 0 ? 1 : 0
}

/**
 * The closing line: what is still wrong, and whether `--fix` would help.
 */
function summary(standing: number, fixable: number, fix: boolean): string {
  if (standing === 0) {
    return fix ? 'control plane consistent — everything fixable was fixed.' : 'control plane consistent — nothing to recover.'
  }
  const problems = `${standing} problem${standing === 1 ? '' : 's'} still standing`
  if (fix || fixable === 0) return `${problems} — each needs a call only you can make (see the → lines).`
  return `${problems}; ${fixable} of them recover --fix can repair. Nothing was changed.`
}

/**
 * Everything that depends on there being a session: the cursor, the phase
 * markers, and the per-build control files.
 *
 * With no session there is no control plane to be wrong about: only the spike
 * leftovers, which outlive `finish` and are checked separately.
 */
function sessionFindings(root: string): ReadonlyArray<Finding> {
  if (!hasSession(root)) {
    return [{ name: 'session', ok: true, detail: 'none open — nothing in flight to reconcile' }]
  }

  const slug = activeBuild(root)
  const findings: Finding[] = []

  // The cursor first: everything below reads through it, so a cursor pointing
  // nowhere makes the rest meaningless rather than merely wrong.
  const resolvable = slug !== null && existsSync(intentPath(root, slug))
  if (!resolvable) {
    return [cursorFinding(root, slug)]
  }
  findings.push({ name: 'cursor', ok: true, detail: `build "${slug}" resolves` })

  const stepInFlight = existsSync(stepPath(root, slug))
  findings.push(...phaseFindings(root, slug, stepInFlight))
  findings.push(...leftoverFindings(root, slug, stepInFlight))
  return findings
}

/**
 * The cursor names a build that is not there.
 *
 * This is the quiet one: `status` takes the cursor at its word, so every read
 * comes back empty and the dashboard renders as a fresh, untouched build rather
 * than an error. Repairable only when exactly one real build remains; with
 * several, which one you meant is a judgment call.
 */
function cursorFinding(root: string, slug: string | null): Finding {
  const named = slug === null ? 'nothing' : `"${slug}"`
  const builds = listBuilds(root).filter((b) => existsSync(intentPath(root, b)))
  const detail = `points at ${named}, which has no intent.md — status will render an empty dashboard rather than refuse`

  if (builds.length === 1) {
    const only = builds[0] as string
    return {
      name: 'cursor',
      ok: false,
      detail,
      hint: `fix: plumbbob recover --fix (re-points the cursor at "${only}", the only build left) — or plumbbob use <slug>`,
      repair: () => setActiveBuild(root, only),
      repaired: `re-pointed at "${only}"`,
    }
  }
  const hint =
    builds.length === 0
      ? 'no build folder survives here — plumbbob finish closes the session, or start a new one'
      : `pick the one you meant: plumbbob use <slug>. Builds: ${builds.join(', ')}`
  return { name: 'cursor', ok: false, detail, hint }
}

/**
 * Contradictions in what phase the build claims to be in.
 *
 * Phase is derived from the markers rather than stored, so two markers at once
 * is not an impossible state; it is an unreadable one, and `status` resolves
 * it by showing the spike and hiding the step entirely.
 */
function phaseFindings(root: string, slug: string, stepInFlight: boolean): ReadonlyArray<Finding> {
  const findings: Finding[] = []
  const spiking = inSpike(root, slug)

  if (spiking && stepInFlight) {
    findings.push({
      name: 'phase',
      ok: false,
      detail: `both a spike and step ${readMarker(stepPath(root, slug))} are marked in flight — status shows the spike and hides the step`,
      hint: 'close the spike first (plumbbob spike done), which returns you to the step still in flight',
    })
  } else {
    findings.push({
      name: 'phase',
      ok: true,
      detail: spiking ? 'in a spike' : stepInFlight ? `step ${readMarker(stepPath(root, slug))} in flight` : 'at the boundary',
    })
  }

  // A STEP the plan no longer contains: `refine` can rewrite `## Steps` under a
  // step that is already in flight, and nothing reconciles the marker with it.
  const marker = Number(readMarker(stepPath(root, slug)))
  if (stepInFlight && Number.isInteger(marker) && marker > 0) {
    const planned = parseSteps(readOr(intentPath(root, slug))).map((s) => s.n)
    if (planned.length > 0 && !planned.includes(marker)) {
      findings.push({
        name: 'step marker',
        ok: false,
        detail: `step ${marker} is in flight but the plan has no step ${marker} (planned: ${planned.join(', ')})`,
        hint: 'the plan was rewritten under the step — sharpen it with /plumbbob:step, or plumbbob revert to drop the step',
      })
    }
  }
  return findings
}

/**
 * Control files left behind by a verb that did not get to clean them up.
 *
 * Each of these fails quietly rather than loudly, which is why they are worth a
 * verb: an orphaned handoff ledger feeds a finished step's agent output into
 * the next one, and a stale TICK arms the approval latch against a span that
 * already closed.
 */
function leftoverFindings(root: string, slug: string, stepInFlight: boolean): ReadonlyArray<Finding> {
  const findings: Finding[] = []

  // The handoff ledger is step-scoped and cleared by `checkpoint` alone; a
  // revert or an abandoned step leaves it for the next step to inherit.
  const handoffs = handoffCount(root, slug)
  if (!stepInFlight && handoffs > 0) {
    findings.push({
      name: 'handoff ledger',
      ok: false,
      detail: `${handoffs} agent envelope${handoffs === 1 ? '' : 's'} left over at the boundary — the next step would thread them into its context`,
      hint: 'fix: plumbbob recover --fix (clears the step-scoped ledger)',
      repair: () => clearHandoff(root, slug),
      repaired: `cleared ${handoffs} leftover envelope${handoffs === 1 ? '' : 's'}`,
    })
  } else {
    findings.push({ name: 'handoff ledger', ok: true, detail: stepInFlight ? 'in scope for the step in flight' : 'empty' })
  }

  // TICK is stamped when a step is entered and when `start` opens the plan
  // pause, and cleared by the checkpoint that lands either one. At the boundary
  // with the plan already committed, neither pause is open, so a TICK left here
  // is measuring a span that closed.
  const planLanded = readOr(checkpointsPath(root, slug)).split('\n').some((l) => l.startsWith('plan '))
  if (!stepInFlight && planLanded && existsSync(tickPath(root, slug))) {
    findings.push({
      name: 'latch tick',
      ok: false,
      detail: 'a TICK stamp survives at the boundary — the approval latch is armed against a pause that already closed',
      hint: 'fix: plumbbob recover --fix (clears the stale stamp; the latch re-arms on the next build)',
      repair: () => clearTick(root, slug),
      repaired: 'cleared the stale stamp',
    })
  } else {
    findings.push({ name: 'latch tick', ok: true, detail: stepInFlight ? 'stamped for the step in flight' : 'clear' })
  }

  // GRANT is rewritten on every turn tick, so it self-clears, but only while
  // the hook runs. Without a TURN ledger nothing will ever clear it, and the
  // latch reads a standing grant as self-approval.
  if (existsSync(grantPath(root)) && readTurn(root) === null) {
    findings.push({
      name: 'self-approval grant',
      ok: false,
      detail: 'a GRANT survives with no turn ledger to clear it — the latch would honor it as self-approval',
      hint: 'fix: plumbbob recover --fix (drops the grant; type /plumbbob:build --auto to mint a fresh one)',
      repair: () => setGrant(root, null),
      repaired: 'dropped the stranded grant',
    })
  }
  return findings
}

/**
 * Spike worktrees and branches with no open spike to own them.
 *
 * `spike done` is the only cleanup and it refuses without the marker, so a
 * spike interrupted by `finish`, a cursor switch, or a half-failed open strands
 * these where no verb can reach them. Reported with the exact commands and
 * never removed: the directories sit outside the repo and may hold the only
 * copy of what the spike learned.
 */
function spikeOrphanFindings(root: string): ReadonlyArray<Finding> {
  if (inSpike(root, activeBuild(root))) {
    return [{ name: 'spike leftovers', ok: true, detail: 'a spike is open — plumbbob spike done owns its cleanup' }]
  }
  const worktrees = spikeWorktrees(root)
  const branches = spikeBranches(root)
  if (worktrees.length === 0 && branches.length === 0) {
    return [{ name: 'spike leftovers', ok: true, detail: 'none' }]
  }
  const parts = [
    worktrees.length > 0 ? `${worktrees.length} worktree${worktrees.length === 1 ? '' : 's'} (${worktrees.join(', ')})` : '',
    branches.length > 0 ? `${branches.length} branch${branches.length === 1 ? '' : 'es'} (${branches.join(', ')})` : '',
  ].filter((p) => p.length > 0)
  const commands = [
    ...worktrees.map((path) => `git worktree remove --force ${path}`),
    ...(branches.length > 0 ? [`git branch -D ${branches.join(' ')}`] : []),
  ]
  return [
    {
      name: 'spike leftovers',
      ok: false,
      detail: `${parts.join(' and ')} survive with no spike open — plumbbob spike done cannot reach them`,
      hint: `remove by hand once you have salvaged anything you want: ${commands.join(' && ')}`,
    },
  ]
}

/**
 * How many agent envelopes the step-scoped handoff ledger holds; 0 when it is
 * absent or unreadable.
 */
function handoffCount(root: string, slug: string): number {
  const raw = readOr(handoffPath(root, slug))
  if (raw.trim().length === 0) return 0
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.length : 1
  } catch {
    return 1
  }
}

/**
 * A control marker's trimmed content, or '?' when it cannot be read: a marker
 * exists to be reported on, so an unreadable one must not throw mid-report.
 */
function readMarker(path: string): string {
  const raw = readOr(path).trim()
  return raw.length > 0 ? raw : '?'
}

/**
 * File content, or '' when absent: recover reads state that may be missing by
 * definition, so every read degrades rather than throws.
 */
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
