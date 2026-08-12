// plumbbob CLI core — argv dispatch and the help table, separated from the bin
// entry (cli.ts) so the routing/help logic is unit-testable in-process without
// the top-level process.exit. Node builtins plus a deliberate few dependencies
// (currently checkride alone, via check.ts). Functional/procedural: no classes,
// no `this`, no default export.
//
// The deciding/executing boundary is a pause, not a lock, so there is nothing
// to defend in the dispatcher — every verb runs the same whether a human or the
// model triggers it. No human-only `mode` escape hatch exists and no
// CLAUDECODE in-session refusal; what keeps the human the decider is the pause
// at the step boundary (the skills), not a refusal here.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { start } from './verbs/start.ts'
import { status } from './verbs/status.ts'
import { park } from './verbs/park.ts'
import { build } from './verbs/build.ts'
import { handoff } from './verbs/handoff.ts'
import { check } from './verbs/check.ts'
import { checkpoint } from './verbs/checkpoint.ts'
import { revert } from './verbs/revert.ts'
import { spike } from './verbs/spike.ts'
import { use } from './verbs/use.ts'
import { finish } from './verbs/finish.ts'
import { init } from './verbs/init.ts'
import { doctor } from './verbs/doctor.ts'
import { recover } from './verbs/recover.ts'
import { agent } from './verbs/agent.ts'
import { turn } from './verbs/turn.ts'

type Flag = {
  readonly name: string
  // Presence means the flag consumes the next argv token as its value. That is
  // what lets the scanner skip `-m "--help"`'s value instead of reading it as a
  // help request, and what keeps `--only --bail` from silently mis-parsing.
  readonly value?: string
  readonly gloss: string
}

type Arg = {
  readonly name: string
  readonly gloss: string
}

type Verb = {
  readonly name: string
  // One lowercase fragment, used verbatim both as the help-table row and as the
  // headline of `plumbbob <verb> --help` — plumbbob's messages are lowercase
  // throughout (`parked: …`, `plumbbob: check green.`), so neither site needs a
  // capitalized variant.
  readonly description: string
  readonly synopsis: ReadonlyArray<string>
  readonly args?: ReadonlyArray<Arg>
  readonly flags?: ReadonlyArray<Flag>
  readonly notes?: string
  // Opt out of the unknown-flag refusal — `--help` is still honored. Two verbs
  // need it for unrelated reasons: park takes free text, so a `--`-prefixed
  // word inside it is the human's content rather than a typo; turn is the
  // UserPromptSubmit hook and returns 0 by contract, where a refusal would
  // wedge every prompt in the session.
  readonly tolerateUnknownFlags?: true
}

/** Shared across every verb that resolves through the active-build cursor. */
const BUILD_FLAG: Flag = {
  name: '--build',
  value: '<slug>',
  gloss: 'target a specific build instead of the active cursor',
}

/**
 * The full CLI spec, in the order the help table prints.
 *
 * One table drives three things: the top-level verb table, per-verb `--help`,
 * and the unknown-flag refusal in `run`. Keeping it as data rather than inline
 * writes is the deliberate exception to the write-at-the-call-site convention —
 * a synopsis has to be readable by the validator, not just printable.
 */
const VERBS: ReadonlyArray<Verb> = [
  {
    name: 'start',
    description: 'scaffold .plumbbob/; open the session; record the baseline commit',
    synopsis: ['start "<title>" [--slug <name>] [--local] [--allow-dirty]'],
    args: [{ name: '<title>', gloss: 'what you are building (quoted)' }],
    flags: [
      { name: '--slug', value: '<name>', gloss: 'use this slug verbatim instead of the derived YYYY-MM-DD-<title-slug>' },
      { name: '--local', gloss: 'opt into the old fully-untracked flat layout' },
      { name: '--allow-dirty', gloss: 'record the current HEAD as baseline despite a dirty tree' },
    ],
    notes: 'Refuses (exit 1) on an empty title, a slug collision, a non-git directory, a repo with no commits, an already-active session, or a dirty tree.',
  },
  {
    name: 'status',
    description: 'print the orientation dashboard, or NO ACTIVE SESSION',
    synopsis: ['status [--build <slug>]'],
    flags: [BUILD_FLAG],
    notes: 'Read-only; always exits 0. With no cursor it lists the available builds.',
  },
  {
    name: 'build',
    description: 'write the seam from step n, or the next undone step (in-flight, not a lock)',
    synopsis: ['build [<n>] [--build <slug>]'],
    args: [{ name: '<n>', gloss: 'step to build (default: the next undone step)' }],
    flags: [BUILD_FLAG],
    notes: 'Refuses (exit 1) with no session, a non-numeric or < 1 step, or a seam it cannot parse.',
  },
  {
    name: 'handoff',
    description: 'print the standardized build hand-off block (pause or post-checkpoint); read-only',
    synopsis: ['handoff [<n>] [--build <slug>]'],
    args: [{ name: '<n>', gloss: 'step to report on (default: the in-flight step, else the last checkpointed one)' }],
    flags: [BUILD_FLAG],
    notes: 'Read-only; refuses (exit 1) only with no session.',
  },
  {
    name: 'check',
    description: 'run the heavy check and report; no state change',
    synopsis: ['check [--bail] [--changed] [--all] [--only a,b] [--skip a,b] [--include a,b]'],
    flags: [
      { name: '--bail', gloss: 'stop at the first red slot' },
      { name: '--changed', gloss: 'limit the run to changed files' },
      { name: '--all', gloss: 'run every slot' },
      { name: '--only', value: '<a,b>', gloss: 'run only these slots' },
      { name: '--skip', value: '<a,b>', gloss: 'run every slot except these' },
      { name: '--include', value: '<a,b>', gloss: 'add these slots to the run' },
    ],
    notes: 'Exits 0 green, 1 red, 2 when the gate itself broke. The flags narrow a checkride run and are warned-and-ignored on the `check` settings-override path.',
  },
  {
    name: 'checkpoint',
    description: 'gate on green, commit/record SHA, mark step done (executor-agnostic)',
    synopsis: ['checkpoint [<n>] [-m <msg>] [--body]', 'checkpoint --plan [--body]'],
    args: [{ name: '<n>', gloss: 'step to checkpoint (else the in-flight STEP, else the first undone step)' }],
    flags: [
      { name: '--plan', gloss: "commit only the build's artifact folder as chore(<scope>): plan" },
      { name: '-m', value: '<msg>', gloss: 'override the CLI-owned Conventional subject' },
      { name: '--body', gloss: 'read the commit body from stdin (heredoc)' },
    ],
    notes: 'Refuses (exit 1) with no session, no resolvable step, or a red check.',
  },
  {
    name: 'revert',
    description: 'git reset --hard to a checkpoint SHA',
    synopsis: ['revert [--to <n>] [--build <slug>]'],
    flags: [
      { name: '--to', value: '<n>', gloss: "revert to step n's checkpoint (default: the last, else the baseline)" },
      BUILD_FLAG,
    ],
    notes: 'Refuses (exit 1) with no session, an invalid --to, or a step with no recorded checkpoint.',
  },
  {
    name: 'park',
    description: 'append a raw line to the park list',
    synopsis: ['park "<text>"'],
    args: [{ name: '<text>', gloss: 'the note to park (free text; quote it)' }],
    tolerateUnknownFlags: true,
    notes: 'Refuses (exit 1) with no session, empty text, or no `## Park list` section.',
  },
  {
    name: 'spike',
    description: 'worktree experiment + report for a genuine fork',
    synopsis: ['spike "<slug>" [opt…] [--build <slug>]', 'spike report "<slug>"', 'spike done'],
    args: [
      { name: '<slug>', gloss: 'name of the experiment' },
      { name: '[opt…]', gloss: 'the options to fork (default: a and b)' },
    ],
    flags: [BUILD_FLAG],
    notes: 'Refuses (exit 1) with no session, a step already in flight, an empty slug, or a worktree path that already exists.',
  },
  {
    name: 'use',
    description: 're-point the active-build cursor and resume that build',
    synopsis: ['use <slug>'],
    args: [{ name: '<slug>', gloss: 'the build folder under .plumbbob/builds/ to resume' }],
    notes: 'Refuses (exit 1) with an empty slug or a slug with no build folder; warns (but allows) leaving a step in flight.',
  },
  {
    name: 'finish',
    description: 'close-out: report + final commit (no gate), clear the control state, close the session',
    synopsis: ['finish [--body] [--build <slug>]'],
    flags: [{ name: '--body', gloss: 'read the commit body from stdin (heredoc)' }, BUILD_FLAG],
    notes: 'Refuses (exit 1) only with no session. There is no refuse-without-report gate.',
  },
  {
    name: 'init',
    description: 'link plumbbob into Claude Code as an in-place plugin (~/.claude/skills/plumbbob)',
    synopsis: ['init [--uninstall] [--force]'],
    flags: [
      { name: '--uninstall', gloss: 'drop the link' },
      { name: '--force', gloss: 'override the marketplace double-install guard' },
    ],
    notes: 'Idempotent and global-only; it never writes settings.json. Restart Claude Code (or /reload-plugins) to activate.',
  },
  {
    name: 'doctor',
    description: 'diagnose the plugin link + check gate; detect a legacy flat sidecar',
    synopsis: ['doctor [--migrate]'],
    flags: [{ name: '--migrate', gloss: 'move a legacy flat sidecar into builds/ (staged, not committed)' }],
    notes: 'Exits 0 when everything passes, 1 when a check fails or an un-migrated legacy sidecar is present.',
  },
  {
    name: 'recover',
    description: 'reconcile the control plane: stale markers, a cursor pointing nowhere, spike leftovers',
    synopsis: ['recover [--fix]'],
    flags: [{ name: '--fix', gloss: 'repair the stale untracked control files it can repair on its own' }],
    notes:
      'Exits 0 when the control plane is consistent, 1 while any problem stands. --fix never touches a tracked artifact, git history, or the loop; spike worktrees are reported, never removed.',
  },
  {
    name: 'agent',
    description: 'list or spawn a user-authored agent',
    synopsis: [
      'agent list',
      'agent run <name> [--step N] [--mode before|build|after] [--agent <path>] [--build <slug>]',
      'agent run --mode before|build|after [--step N]',
    ],
    args: [
      { name: 'list', gloss: 'print every resolvable agent — name, origin tier, slots, description' },
      { name: 'run', gloss: 'spawn an agent through the doorway; no code path advances the loop' },
    ],
    flags: [
      { name: '--step', value: '<n>', gloss: 'pick the step (else the in-flight STEP)' },
      { name: '--mode', value: '<slot>', gloss: 'the slot to run in: before, build, or after' },
      { name: '--agent', value: '<path>', gloss: 'point at an explicit agent directory (top of the ladder)' },
      BUILD_FLAG,
    ],
    notes: 'Exits 0 on a clean run, 1 on a failed one. See docs/agents.md for the author contract.',
  },
  {
    name: 'turn',
    description: 'UserPromptSubmit hook machinery — tick the turn ledger from stdin (not a user verb)',
    synopsis: ['turn'],
    tolerateUnknownFlags: true,
    notes: 'Reads the hook payload from stdin and always exits 0 — a broken hook must never wedge a prompt.',
  },
]

/**
 * Render the verb table for `plumbbob help`.
 */
export function formatHelp(): string {
  const width = Math.max(...VERBS.map((v) => v.name.length))
  const rows = VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.description}`)
  return [
    'plumbbob — attention-first build process',
    '',
    'Usage: plumbbob <verb> [args]',
    '',
    'Verbs:',
    ...rows,
    '',
    "Run 'plumbbob <verb> --help' for a verb's arguments and flags.",
    '',
  ].join('\n')
}

/**
 * Render the synopsis, argument, and flag block for `plumbbob <verb> --help`,
 * or null when the name is not a verb.
 *
 * Arguments and flags share one aligned column so the reader scans a single
 * list; a flag that takes a value prints as `--only <a,b>` so the spelling in
 * the help is the spelling you type.
 */
export function formatVerbHelp(name: string): string | null {
  const spec = verbSpec(name)
  if (spec === null) return null
  const entries = [
    ...(spec.args ?? []).map((a) => ({ label: a.name, gloss: a.gloss })),
    ...(spec.flags ?? []).map((f) => ({
      label: f.value === undefined ? f.name : `${f.name} ${f.value}`,
      gloss: f.gloss,
    })),
  ]
  const width = Math.max(0, ...entries.map((e) => e.label.length))
  const rows = entries.map((e) => `  ${e.label.padEnd(width)}  ${e.gloss}`)
  return [
    ...spec.synopsis.map((s) => `plumbbob ${s}`),
    '',
    spec.description,
    ...(rows.length > 0 ? ['', ...rows] : []),
    ...(spec.notes === undefined ? [] : ['', spec.notes]),
    '',
    `See: docs/cli-reference.md#${spec.name}`,
    '',
  ].join('\n')
}

/**
 * Look up a verb's spec by name, or null when the name is not a verb.
 */
export function verbSpec(name: string): Verb | null {
  return VERBS.find((v) => v.name === name) ?? null
}

/**
 * Every verb name, in table order — the contract tests iterate this.
 */
export function verbNames(): ReadonlyArray<string> {
  return VERBS.map((v) => v.name)
}

/**
 * Walk a verb's argv against its spec: did it ask for help, and what did it
 * spell wrong?
 *
 * Value-consuming flags swallow their next token, so a value that happens to
 * look like a flag (`checkpoint -m "--help"`) is read as the value it is. Bare
 * `--help`/`-h` are recognized for every verb without being declared.
 */
function scanFlags(spec: Verb, args: ReadonlyArray<string>): { readonly help: boolean; readonly unknown: ReadonlyArray<string> } {
  const known = new Map((spec.flags ?? []).map((f) => [f.name, f]))
  const unknown: string[] = []
  let help = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string
    const flag = known.get(arg)
    if (flag !== undefined) {
      if (flag.value !== undefined) i++
      continue
    }
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg.startsWith('-') && arg.length > 1) {
      unknown.push(arg)
    }
  }
  return { help, unknown }
}

/**
 * The package version, or 'unknown'.
 *
 * Read from the package.json one level above this module (dist/cli-core.js →
 * ../package.json; in tests src/cli-core.ts → ../package.json, the repo root).
 * An absent or malformed manifest degrades to 'unknown' rather than throwing,
 * so `--version` never errors.
 */
export function readVersion(): string {
  try {
    const raw = readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Route a verb to its implementation, or report the unknown verb and exit 1.
 *
 * Async because checkride is: `check` and `checkpoint` await the gate, `start`
 * awaits the plan-time detection probe; every other verb returns synchronously
 * through the same Promise-typed seam.
 */
async function dispatch(verb: string, cwd: string, rest: ReadonlyArray<string>): Promise<number> {
  switch (verb) {
    case 'start':
      return start(cwd, rest)
    case 'status':
      return status(cwd, rest)
    case 'park':
      return park(cwd, rest)
    case 'build':
      return build(cwd, rest)
    case 'handoff':
      return handoff(cwd, rest)
    case 'check':
      return check(cwd, rest)
    case 'checkpoint':
      return checkpoint(cwd, rest)
    case 'revert':
      return revert(cwd, rest)
    case 'spike':
      return spike(cwd, rest)
    case 'use':
      return use(cwd, rest)
    case 'finish':
      return finish(cwd, rest)
    case 'init':
      return init(rest)
    case 'doctor':
      return doctor(cwd, rest)
    case 'recover':
      return recover(cwd, rest)
    case 'agent':
      return agent(cwd, rest)
    case 'turn':
      return turn(cwd, rest)
    default:
      process.stderr.write(`plumbbob: unknown verb '${verb}'. Run 'plumbbob help' for the verb table.\n`)
      return 1
  }
}

/**
 * The CLI entrypoint minus the exit: parse argv, dispatch, return the exit code.
 *
 * `help` and `version` short-circuit before dispatch, as do per-verb `--help`
 * and the unknown-flag refusal. Screening flags *here* rather than in each verb
 * is what makes it safe by construction: a mutating verb can no longer be
 * reached by an argv it does not understand, which is how `checkpoint --help`
 * used to commit a real checkpoint. Any thrown error becomes a one-line stderr
 * report and exit 1, so the bin entry only ever exits with the code returned
 * here.
 *
 * `cwd` is the repo the verbs act on. It defaults to the process's — the only
 * thing the bin entry ever wants — and is a parameter solely so a test can name
 * a fixture. Screening argv does not help when the argv is *valid*: `checkpoint
 * -m --help` reads `--help` as the subject, exactly as it should, and then
 * commits. Whose repo it commits is decided here, and a default is not a choice
 * a test should inherit silently.
 */
export async function run(argv: ReadonlyArray<string>, cwd: string = process.cwd()): Promise<number> {
  const verb = argv[0] ?? 'help'
  const rest = argv.slice(1)

  if (verb === 'help' || verb === '--help' || verb === '-h') {
    // `plumbbob help <verb>` is the same page as `plumbbob <verb> --help` —
    // both spellings get typed, so both work.
    const topic = rest.find((a) => !a.startsWith('-'))
    if (topic === undefined) {
      process.stdout.write(`${formatHelp()}\n`)
      return 0
    }
    const help = formatVerbHelp(topic)
    if (help === null) {
      process.stderr.write(`plumbbob: unknown verb '${topic}'. Run 'plumbbob help' for the verb table.\n`)
      return 1
    }
    process.stdout.write(`${help}\n`)
    return 0
  }

  if (verb === 'version' || verb === '--version' || verb === '-v') {
    process.stdout.write(`plumbbob ${readVersion()}\n`)
    return 0
  }

  const spec = verbSpec(verb)
  if (spec !== null) {
    const { help, unknown } = scanFlags(spec, rest)
    if (help) {
      process.stdout.write(`${formatVerbHelp(verb)}\n`)
      return 0
    }
    if (unknown.length > 0 && spec.tolerateUnknownFlags !== true) {
      process.stderr.write(
        `plumbbob: ${verb}: unknown flag '${unknown[0]}'. Run 'plumbbob ${verb} --help' for the flags.\n`,
      )
      return 1
    }
  }

  try {
    return await dispatch(verb, cwd, rest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`plumbbob: ${verb} failed: ${message}\n`)
    return 1
  }
}
