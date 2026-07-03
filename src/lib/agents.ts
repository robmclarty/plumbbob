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

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
