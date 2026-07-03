// The agent contract (D1/D8): a user-authored agent is anything executable that
// speaks a versioned JSON envelope — a JSON manifest on disk (`agent.json`), JSON
// on the child's stdin, JSON on its stdout, prose on its stderr. This module is
// the contract's validator AND resolver: it type-narrows the on-disk manifest and
// the output envelope a child returns (refusing a contract major-version mismatch
// with an upgrade hint rather than guessing at a shape that is only stable within a
// major — C6: additions are minor, removals/renames are major), and it walks the
// two agent tiers to resolve an agent by name. The validators are pure; the
// resolver reads `agent.json` files off disk (node builtins only, C1). Invocation
// (step 4) spawns on top of these.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseBuildTitle, parseStepMeta, parseStepSeam, scrapeBullets } from './intent.ts'

// The contract major version this plumbbob speaks. A manifest or envelope
// declaring a different major is refused (D8): within a major the envelope only
// gains fields, so an older CLI can read a newer minor, but a major gap means the
// shapes may genuinely disagree.
export const CONTRACT_VERSION = 1

// The three lifecycle slots an agent may bind to (D5): `before` (context in),
// `build` (the diff), `after` (advisory review). Exactly these, never a fourth —
// "a salient point in the middle" is judgment the host model handles in prose,
// not a declarative slot.
export const SLOTS = ['before', 'build', 'after'] as const
export type Slot = (typeof SLOTS)[number]

// The terminal states an agent reports (D24). `done` = finished; `blocked` = it
// couldn't finish, so the human unblocks and re-runs; `drift` = it finished but
// found the plan no longer matches reality, so the route is /pb-refine repair.
export const ENVELOPE_STATUSES = ['done', 'blocked', 'drift'] as const
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number]

// A validated agent manifest (D11). `command` is for the deterministic CLI — the
// shell string spawned via `sh -c` at repo root (D18). `description` and `when`
// are prose for the host model (like a subagent frontmatter description); they
// default to empty. Unknown manifest keys are tolerated (C6) and dropped from the
// narrowed type.
export type AgentManifest = {
  readonly contract: number
  readonly name: string
  readonly command: string
  readonly slots: ReadonlyArray<Slot>
  readonly description: string
  readonly when: string
}

// A validated output envelope (D8/D20): what a child writes to stdout, the single
// structured result plumbbob consumes at the pause. `summary` is the one-line
// headline; `body` and `notes` are optional prose; `parked[]` are park lines the
// CLI lands through the park verb (D6 — the agent never writes .plumbbob/ itself).
// Nothing here can advance the loop (C2 — the identity invariant).
export type AgentEnvelope = {
  readonly contract: number
  readonly status: EnvelopeStatus
  readonly summary: string
  readonly body: string
  readonly parked: ReadonlyArray<string>
  readonly notes: string
}

export type ManifestParse =
  | { readonly ok: true; readonly manifest: AgentManifest }
  | { readonly ok: false; readonly error: string }

export type EnvelopeParse =
  | { readonly ok: true; readonly envelope: AgentEnvelope }
  | { readonly ok: false; readonly error: string }

// Validate a parsed `agent.json`. Contract is checked first (a version mismatch
// gets an upgrade hint, not a field complaint, since older field checks may not
// apply across a major). Then: a non-empty `name` and `command`, and a `slots`
// subset of {before, build, after}. Unknown keys pass through untouched.
export function parseManifest(raw: unknown): ManifestParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return manifestFail('agent.json must be a JSON object.')
  }
  const obj = raw as Record<string, unknown>

  const versionError = checkContract(obj.contract, 'agent.json')
  if (versionError !== null) {
    return manifestFail(versionError)
  }
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    return manifestFail('agent.json needs a non-empty "name" string.')
  }
  if (typeof obj.command !== 'string' || obj.command.trim().length === 0) {
    return manifestFail('agent.json needs a non-empty "command" string — the shell command plumbbob spawns.')
  }
  const slots = parseSlots(obj.slots)
  if (typeof slots === 'string') {
    return manifestFail(slots)
  }

  return {
    ok: true,
    manifest: {
      contract: CONTRACT_VERSION,
      name: obj.name.trim(),
      command: obj.command,
      slots,
      description: asString(obj.description),
      when: asString(obj.when),
    },
  }
}

// Validate a child's output envelope (already JSON-parsed from its stdout).
// Contract first (mismatch → upgrade hint), then a `status` in {done, blocked,
// drift}, a non-empty `summary`, and a well-formed `parked[]`. Optional prose
// fields default to empty; unknown keys are tolerated (C6).
export function parseEnvelope(raw: unknown): EnvelopeParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return envelopeFail('the agent envelope must be a JSON object on stdout.')
  }
  const obj = raw as Record<string, unknown>

  const versionError = checkContract(obj.contract, 'the agent envelope')
  if (versionError !== null) {
    return envelopeFail(versionError)
  }
  if (typeof obj.status !== 'string' || !isStatus(obj.status)) {
    return envelopeFail(`the agent envelope needs a "status" of ${ENVELOPE_STATUSES.join(', ')}.`)
  }
  if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
    return envelopeFail('the agent envelope needs a non-empty "summary" string.')
  }
  const parked = parseParked(obj.parked)
  if (typeof parked === 'string') {
    return envelopeFail(parked)
  }

  return {
    ok: true,
    envelope: {
      contract: CONTRACT_VERSION,
      status: obj.status,
      summary: obj.summary,
      body: asString(obj.body),
      parked,
      notes: asString(obj.notes),
    },
  }
}

// True when a string names one of the three slots. Exported for step 4's
// `--mode` refusal (D21): a mode the manifest doesn't declare is refused loud.
export function isSlot(value: string): value is Slot {
  return (SLOTS as ReadonlyArray<string>).includes(value)
}

// Validate the shared `contract` field. A missing / non-integer contract is
// malformed; a present-but-different major is a version mismatch (D8) and gets an
// upgrade hint pointing at whichever side is behind. Returns an error string, or
// null when the contract is the supported major.
function checkContract(value: unknown, what: string): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return `${what} needs an integer "contract" version — this plumbbob speaks contract ${CONTRACT_VERSION}.`
  }
  if (value !== CONTRACT_VERSION) {
    const behind = value > CONTRACT_VERSION ? 'plumbbob CLI' : 'agent'
    return (
      `${what} speaks contract ${value}, but this plumbbob speaks contract ${CONTRACT_VERSION}. ` +
      `Upgrade the ${behind} to match — the envelope is only stable within a major version.`
    )
  }
  return null
}

// Narrow the manifest's `slots` to the subset it declares. Must be a non-empty
// array drawn from SLOTS, with strangers refused and duplicates collapsed.
// Returns the narrowed slots, or an error string.
function parseSlots(value: unknown): ReadonlyArray<Slot> | string {
  if (!Array.isArray(value) || value.length === 0) {
    return `agent.json needs a non-empty "slots" array drawn from ${SLOTS.join(', ')}.`
  }
  const seen = new Set<Slot>()
  for (const entry of value) {
    if (typeof entry !== 'string' || !isSlot(entry)) {
      return `agent.json "slots" has an invalid entry ${JSON.stringify(entry)} — allowed slots are ${SLOTS.join(', ')}.`
    }
    seen.add(entry)
  }
  return [...seen]
}

// `parked[]` is optional (absent = none). Present, it must be an array of
// non-blank strings — each becomes a park line the CLI lands through the park
// verb (D6). A malformed list is refused rather than silently dropped: losing a
// parked concern is a quiet data loss. Returns the trimmed lines or an error.
function parseParked(value: unknown): ReadonlyArray<string> | string {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    return 'the agent envelope\'s "parked" must be an array of strings.'
  }
  const parked: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return 'the agent envelope\'s "parked" must contain only non-empty strings.'
    }
    parked.push(entry.trim())
  }
  return parked
}

// Optional prose fields (description, when, body, notes) default to empty —
// absent and blank read the same to the host model, and a non-string value is
// coerced away rather than refused, because these are advisory prose, not gates.
function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isStatus(value: string): value is EnvelopeStatus {
  return (ENVELOPE_STATUSES as ReadonlyArray<string>).includes(value)
}

function manifestFail(error: string): ManifestParse {
  return { ok: false, error }
}

function envelopeFail(error: string): EnvelopeParse {
  return { ok: false, error }
}

// --- resolution (D3) ---

// The tier an agent resolved from. `flag` is a `--agent <path>` override (top
// priority, used by `agent run` in step 4); `project` is `.plumbbob/agents/`
// (tracked, rides the PR); `personal` is `~/.plumbbob/agents/` (the user's own
// library). Resolution walks flag → project → personal, first hit wins.
export type AgentOrigin = 'flag' | 'project' | 'personal'

// A resolved agent: its validated manifest, the tier it came from, and its own
// directory — the last is what step 4 exposes to the child as PLUMBBOB_AGENT_DIR
// (D18) so an agent whose cwd is the repo root can still reach its own files.
export type ResolvedAgent = {
  readonly manifest: AgentManifest
  readonly origin: AgentOrigin
  readonly dir: string
}

export type AgentResolution =
  | { readonly ok: true; readonly agent: ResolvedAgent }
  | { readonly ok: false; readonly error: string }

// One agent's line in `agent list`: its name, the tier it resolves from, and the
// resolution (a valid manifest, or the parse error so list/doctor can flag a
// malformed agent.json rather than hide it).
export type AgentListing = {
  readonly name: string
  readonly origin: AgentOrigin
  readonly resolution: AgentResolution
}

export function projectAgentsDir(root: string): string {
  return join(root, '.plumbbob', 'agents')
}

export function personalAgentsDir(home: string): string {
  return join(home, '.plumbbob', 'agents')
}

// The home dir the personal tier resolves under. Callers (verbs) pass nothing and
// get the environment's HOME (matching doctor.ts); tests pass an explicit dir to
// exercise an HOME-overridden personal library without touching process.env.
function agentsHome(home?: string): string {
  return home ?? process.env.HOME ?? homedir()
}

// Resolve an agent by name across the tiers (D3), first hit wins. A `flagPath`
// (from `--agent <path>`) points straight at an agent directory and takes top
// priority. A tier "hits" when it holds an `agent.json`: a malformed one there is
// surfaced as an error (project still shadows personal — D21's fail-loud), never
// silently skipped in favor of a different agent. Returns the not-found error only
// when no tier holds a manifest at all.
export function resolveAgent(
  root: string,
  name: string,
  opts: { readonly flagPath?: string; readonly home?: string } = {},
): AgentResolution {
  if (opts.flagPath !== undefined) {
    const hit = loadAgentDir(opts.flagPath, 'flag')
    return hit ?? { ok: false, error: `no agent.json at --agent path ${opts.flagPath}` }
  }
  const home = agentsHome(opts.home)
  const tiers: ReadonlyArray<readonly [string, AgentOrigin]> = [
    [join(projectAgentsDir(root), name), 'project'],
    [join(personalAgentsDir(home), name), 'personal'],
  ]
  for (const [dir, origin] of tiers) {
    const hit = loadAgentDir(dir, origin)
    if (hit !== null) return hit
  }
  return {
    ok: false,
    error: `no agent named "${name}" — looked in ${projectAgentsDir(root)} and ${personalAgentsDir(home)}.`,
  }
}

// Every resolvable agent across both tiers, sorted by name, project shadowing
// personal (a name defined in both resolves — and lists — from project). Each
// entry carries its origin and resolution; a malformed manifest lands as an errored
// resolution rather than crashing the walk.
export function listAgents(root: string, opts: { readonly home?: string } = {}): ReadonlyArray<AgentListing> {
  const home = agentsHome(opts.home)
  const tiers: ReadonlyArray<readonly [string, AgentOrigin]> = [
    [projectAgentsDir(root), 'project'],
    [personalAgentsDir(home), 'personal'],
  ]
  const origins = new Map<string, AgentOrigin>()
  for (const [dir, origin] of tiers) {
    for (const agentName of agentDirNames(dir)) {
      if (!origins.has(agentName)) origins.set(agentName, origin)
    }
  }
  return [...origins.keys()].sort().map((name) => ({
    name,
    origin: origins.get(name) as AgentOrigin,
    resolution: resolveAgent(root, name, { home }),
  }))
}

// Render `agent list`'s output. Pure so the verb stays a thin read-write shell and
// the formatting is unit-tested here. Prints name, origin, slots, and description
// per agent (D3's done-when); a malformed manifest gets a `✗ … invalid:` line.
export function formatAgentList(listings: ReadonlyArray<AgentListing>): string {
  if (listings.length === 0) {
    return 'plumbbob: no agents. Add one under .plumbbob/agents/<name>/ or ~/.plumbbob/agents/<name>/.'
  }
  const lines = ['plumbbob agents:']
  for (const listing of listings) {
    if (!listing.resolution.ok) {
      lines.push(`  ✗ ${listing.name} (${listing.origin}) — invalid: ${listing.resolution.error}`)
      continue
    }
    const { manifest } = listing.resolution.agent
    const description = manifest.description.length > 0 ? ` — ${manifest.description}` : ''
    lines.push(`  ${listing.name} (${listing.origin}) [${manifest.slots.join(', ')}]${description}`)
  }
  return lines.join('\n')
}

// Load and validate the `agent.json` in one agent directory. Returns null when the
// directory holds no manifest (a tier miss, so resolution falls through), an errored
// resolution when the manifest is present but unreadable/malformed, else the resolved
// agent. A missing file (ENOENT throw) is the miss signal — one read, no TOCTOU race.
function loadAgentDir(dir: string, origin: AgentOrigin): AgentResolution | null {
  const file = join(dir, 'agent.json')
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: `${file} is not valid JSON.` }
  }
  const result = parseManifest(parsed)
  return result.ok
    ? { ok: true, agent: { manifest: result.manifest, origin, dir } }
    : { ok: false, error: `${file}: ${result.error}` }
}

// The names of subdirectories under an agents tier that actually carry an
// `agent.json` — so `listAgents` never lists a bare folder that resolution would
// then miss. An absent tier directory yields no names.
function agentDirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'agent.json')))
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

// --- step context (D15/D23) ---

// The input JSON a child agent reads on stdin — the whole picture of the step it
// runs against, composed deterministically from intent.md + settings. `mode` is
// the slot being run; `context[]` carries before-slot outputs inline (D15);
// `settings` is plumbbob's own relevant settings (never a provider key — D9). The
// step's `seam` is parsed strictly (it gates git behavior); the title/done-when/
// decisions/constraints are best-effort prose (D23).
export type StepContext = {
  readonly contract: number
  readonly mode: Slot
  readonly build: { readonly slug: string; readonly title: string }
  readonly step: {
    readonly n: number
    readonly title: string
    readonly doneWhen: string
    readonly seam: ReadonlyArray<string>
  }
  readonly decisions: ReadonlyArray<string>
  readonly constraints: ReadonlyArray<string>
  readonly context: ReadonlyArray<string>
  readonly settings: Record<string, unknown>
}

export type StepContextResult =
  | { readonly ok: true; readonly input: StepContext; readonly warnings: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

// Compose the StepContext for one step. The strict seam parse is the only refusal
// path — a missing step or unparseable seam gates git behavior, so it fails loud;
// everything else is best-effort and lands whatever it can, returning `warnings`
// (skipped-bullet lines) for the caller to print on stderr rather than writing
// there itself (this module stays pure — the verb does the IO).
export function composeStepContext(params: {
  readonly intent: string
  readonly slug: string
  readonly step: number
  readonly mode: Slot
  readonly context?: ReadonlyArray<string>
  readonly settings?: Record<string, unknown>
}): StepContextResult {
  const seam = parseStepSeam(params.intent, params.step)
  if (!seam.ok) {
    return { ok: false, error: seam.error }
  }

  const meta = parseStepMeta(params.intent, params.step)
  const decisions = scrapeBullets(params.intent, '## Decisions')
  const constraints = scrapeBullets(params.intent, '## Constraints')
  const warnings = [
    ...skipWarnings('## Decisions', decisions.skipped),
    ...skipWarnings('## Constraints', constraints.skipped),
  ]

  return {
    ok: true,
    input: {
      contract: CONTRACT_VERSION,
      mode: params.mode,
      build: { slug: params.slug, title: parseBuildTitle(params.intent) },
      step: { n: params.step, title: meta.title, doneWhen: meta.doneWhen, seam: seam.seam },
      decisions: decisions.items,
      constraints: constraints.items,
      context: params.context ?? [],
      settings: params.settings ?? {},
    },
    warnings,
  }
}

function skipWarnings(heading: string, skipped: ReadonlyArray<string>): string[] {
  return skipped.map(
    (line) => `intent.md: skipped a non-bullet line under ${heading} — ${JSON.stringify(line.trim())}`,
  )
}

// --- harness bindings (D4/D13) ---

// A slot→agents map: the agents bound to each of the three lifecycle points. Only
// bound slots are present as keys (an absent slot falls through the merge ladder,
// so the map must distinguish "not bound here" from "bound to nothing"). Shared by
// a harness `defaults` block, a per-step entry, and the settings-level defaults.
export type SlotBindings = Partial<Record<Slot, ReadonlyArray<string>>>

// One step's entry in the harness: its slot bindings plus `note`, prose the host
// model reads (like a manifest `when`) — never the CLI's mechanics (C3: bindings +
// prose only, no control flow).
export type StepBinding = {
  readonly bindings: SlotBindings
  readonly note: string
}

// harness.json — the planned per-step agent bindings authored at /pb-plan time, a
// sibling of intent.md in builds/<slug>/ (D4). Contract-gated like the manifest and
// envelope (D8). `defaults` bind agents to every step; a per-step entry under
// `steps.<n>` overrides the defaults for the slots it names (replace, not append).
export type HarnessBindings = {
  readonly contract: number
  readonly defaults: SlotBindings
  readonly steps: ReadonlyMap<number, StepBinding>
}

export type HarnessParse =
  | { readonly ok: true; readonly harness: HarnessBindings }
  | { readonly ok: false; readonly error: string }

// Validate a parsed harness.json. Contract first (a major mismatch gets the same
// upgrade hint as the manifest/envelope, D8). Structure is strict — a `steps` that
// is not an object, a non-numeric step key, or a step entry that is not an object
// is the author's error and is refused loud. Slot *contents* stay lenient (D23): a
// slot value may be one name or a list, and blanks/non-strings drop rather than
// refuse, because bindings feed a spawn, not a git-gating parse.
export function parseHarness(raw: unknown): HarnessParse {
  if (!isObject(raw)) {
    return { ok: false, error: 'harness.json must be a JSON object.' }
  }
  const versionError = checkContract(raw.contract, 'harness.json')
  if (versionError !== null) {
    return { ok: false, error: versionError }
  }

  const defaults = parseSlotBindings(raw.defaults)

  const steps = new Map<number, StepBinding>()
  if (raw.steps !== undefined) {
    if (!isObject(raw.steps)) {
      return { ok: false, error: 'harness.json "steps" must be an object keyed by step number.' }
    }
    for (const [key, value] of Object.entries(raw.steps)) {
      if (!/^\d+$/.test(key)) {
        return { ok: false, error: `harness.json "steps" key ${JSON.stringify(key)} must be a step number.` }
      }
      if (!isObject(value)) {
        return { ok: false, error: `harness.json step ${key} must be an object of slot bindings.` }
      }
      steps.set(Number(key), { bindings: parseSlotBindings(value), note: asString(value.note) })
    }
  }

  return { ok: true, harness: { contract: CONTRACT_VERSION, defaults, steps } }
}

// Narrow a raw slot→agents object (a harness `defaults`, a per-step entry, or the
// settings-level defaults, D13) to the slots it actually binds. A slot value may be
// a single agent name or a list; blanks and non-strings drop. Only the three real
// slots are read — `note` and any stranger key are ignored here. A slot present but
// naming no valid agent still counts as bound-to-nothing (an explicit override to
// none), so callers get clean replace semantics up the ladder.
export function parseSlotBindings(raw: unknown): SlotBindings {
  if (!isObject(raw)) return {}
  const out: { -readonly [K in Slot]?: ReadonlyArray<string> } = {}
  for (const slot of SLOTS) {
    if (slot in raw) out[slot] = asNameList(raw[slot])
  }
  return out
}

// The agents bound to one slot for one step, merging the ladder (D13): a per-step
// slot entry overrides the harness `defaults`, which override the settings-level
// defaults — the first level that names the slot wins (replace, not append). The
// `--agent` flag and an explicit name sit above all of this, but the verb takes the
// single-agent path for those and never reaches here. Returns [] when no level
// binds the slot: nothing to run, a clean no-op.
export function resolveSlotAgents(params: {
  readonly harness: HarnessBindings | null
  readonly settingsDefaults: SlotBindings
  readonly step: number
  readonly slot: Slot
}): ReadonlyArray<string> {
  const perStep = params.harness?.steps.get(params.step)?.bindings
  if (perStep && params.slot in perStep) return perStep[params.slot] ?? []
  const defaults = params.harness?.defaults
  if (defaults && params.slot in defaults) return defaults[params.slot] ?? []
  if (params.slot in params.settingsDefaults) return params.settingsDefaults[params.slot] ?? []
  return []
}

function asNameList(value: unknown): ReadonlyArray<string> {
  const items = Array.isArray(value) ? value : [value]
  return items.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// --- invocation (D8/D14/D17/D18/D22) ---

// The outcome of one spawned agent run — a discriminated union the verb maps to
// terminal reporting and side effects (D8's exit-code semantics). Exactly one is
// authoritative: `ok` only when the child exited 0 AND its stdout parsed to a
// valid envelope. A non-zero exit is a failed run reported verbatim (we do NOT
// trust the envelope of a child that failed); `contract` is exit-0-but-garbage
// (unparseable stdout or a version mismatch, carrying parseEnvelope's hint);
// `timeout` and `interrupted` are the kill paths (D17/D14); `spawn` is a shell
// that never started. `stdout` rides along on the outcomes that have it so the
// verb can surface the raw bytes when a run went sideways.
export type AgentRunResult =
  | { readonly ok: true; readonly envelope: AgentEnvelope; readonly stdout: string }
  | { readonly ok: false; readonly reason: 'exit'; readonly code: number; readonly stdout: string }
  | { readonly ok: false; readonly reason: 'contract'; readonly error: string; readonly stdout: string }
  | { readonly ok: false; readonly reason: 'timeout'; readonly seconds: number }
  | { readonly ok: false; readonly reason: 'interrupted' }
  | { readonly ok: false; readonly reason: 'spawn'; readonly error: string }

// Spawn an agent's `command` via the shell (D18: `sh -c` on POSIX) at the repo
// root, with the composed StepContext delivered as JSON on stdin. Stdout is piped
// and captured (the envelope); stderr is inherited so the child's prose streams
// live to the terminal (D8 — production narrates, consumption stays structured);
// the agent's own directory rides in `PLUMBBOB_AGENT_DIR` (D18) so a root-cwd
// agent can still reach its files. A SIGINT while the child runs kills it and
// reports `interrupted` rather than orphaning it (D14); a positive `timeoutSeconds`
// arms a kill timer (D17, 0 = off). Async `spawn`, not `spawnSync` (D22), so the
// parent stays live to interrupt gracefully. Never rejects — every failure mode is
// a resolved `AgentRunResult`.
export function runAgent(params: {
  readonly root: string
  readonly command: string
  readonly agentDir: string
  readonly input: StepContext
  readonly timeoutSeconds: number
}): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    const child = spawn(params.command, {
      cwd: params.root,
      shell: true,
      env: { ...process.env, PLUMBBOB_AGENT_DIR: params.agentDir },
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    let stdout = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: AgentRunResult): void => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      process.off('SIGINT', onSigint)
      resolve(result)
    }

    // Kill the child and report, rather than let a Ctrl-C orphan it (D14). The
    // SIGKILL escalation covers a child that ignores the interrupt.
    function onSigint(): void {
      child.kill('SIGKILL')
      finish({ ok: false, reason: 'interrupted' })
    }
    process.on('SIGINT', onSigint)

    if (params.timeoutSeconds > 0) {
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish({ ok: false, reason: 'timeout', seconds: params.timeoutSeconds })
      }, params.timeoutSeconds * 1000)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    // A shell that never launched (e.g. `sh` itself missing) — distinct from a
    // command that ran and exited non-zero, which arrives on `close`.
    child.on('error', (err: Error) => {
      finish({ ok: false, reason: 'spawn', error: err.message })
    })

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        finish({ ok: false, reason: 'exit', code: code ?? 1, stdout })
        return
      }
      const parsed = parseChildEnvelope(stdout)
      finish(
        parsed.ok
          ? { ok: true, envelope: parsed.envelope, stdout }
          : { ok: false, reason: 'contract', error: parsed.error, stdout },
      )
    })

    // Deliver the StepContext and close stdin so a child reading to EOF proceeds.
    child.stdin.write(JSON.stringify(params.input))
    child.stdin.end()
  })
}

// Parse the child's captured stdout into a validated envelope: JSON first (a
// non-JSON stdout is out of contract, D8), then the envelope validator (which
// carries the contract-mismatch hint). Kept private — `runAgent` is the only
// caller and the verb reads the union, not this.
function parseChildEnvelope(stdout: string): EnvelopeParse {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return { ok: false, error: 'the agent wrote non-JSON to stdout — the envelope must be a single JSON object.' }
  }
  return parseEnvelope(raw)
}
