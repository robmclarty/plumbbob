// The agent contract. A user-authored agent is anything executable that speaks a
// versioned JSON envelope (a JSON manifest on disk (`agent.json`), JSON on the
// child's stdin, JSON on its stdout, prose on its stderr) so the doorway is
// runtime-agnostic: any language, any framework, one subprocess boundary. This
// module is the contract's validator, resolver, and runner: it type-narrows the
// on-disk manifest and the output envelope a child returns (refusing a contract
// major-version mismatch with an upgrade hint rather than guessing at a shape
// that is only stable within a major: additions are a minor bump, removals or
// renames a major), it walks the agent tiers to resolve an agent by name, it
// composes the step context a child reads on stdin, and it spawns the child.
// The validators are pure; the resolver reads `agent.json` files off disk with
// node builtins only. The `agent run` verb (src/verbs/agent.ts) is the thin
// shell over all of it.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBuildTitle, parseStepLike, parseStepMeta, parseStepSeam, scrapeBullets } from './intent.ts'

/**
 * The contract major version this plumbbob speaks.
 *
 * A manifest or envelope declaring a different major is refused: within a major
 * the envelope only gains fields, so an older CLI can read a newer minor, but a
 * major gap means the shapes may genuinely disagree.
 */
export const CONTRACT_VERSION = 1

/**
 * The three lifecycle slots an agent may bind to: `before` (context in),
 * `build` (the diff), `after` (advisory review).
 *
 * Exactly these, never a fourth; "a salient point in the middle" is judgment
 * the host model handles in prose, not a declarative slot.
 */
export const SLOTS = ['before', 'build', 'after'] as const
export type Slot = (typeof SLOTS)[number]

/**
 * The terminal states an agent reports.
 *
 * `done` = finished. `blocked` = it couldn't finish, so the human unblocks and
 * re-runs. `drift` = it finished but found the plan no longer matches reality,
 * so the route is /plumbbob:refine repair. The two halts need different medicine,
 * which is why they are distinct statuses.
 */
export const ENVELOPE_STATUSES = ['done', 'blocked', 'drift'] as const
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number]

/**
 * A validated agent manifest: the `agent.json` in an agent's directory.
 *
 * The manifest speaks to two audiences. `command` is for the deterministic CLI:
 * the shell string spawned via `sh -c` at the repo root. `description` and
 * `when` are prose for the host model (the cue it reads to fire an agent
 * mid-build, the role a subagent's frontmatter description plays) and default
 * to empty. Unknown manifest keys are tolerated and dropped from the narrowed
 * type, keeping the contract surface minimal.
 */
export type AgentManifest = {
  readonly contract: number
  readonly name: string
  readonly command: string
  readonly slots: ReadonlyArray<Slot>
  readonly description: string
  readonly when: string
}

/**
 * A validated output envelope: what a child writes to stdout, the single
 * structured result plumbbob consumes at the verify pause.
 *
 * `summary` is the one-line headline; `body` and `notes` are optional prose;
 * `parked[]` are park lines (off-plan concerns captured for later triage)
 * which the CLI lands through the park verb, because an agent never writes the
 * `.plumbbob/` sidecar itself (it keeps a single writer). `evidence[]` names
 * files the agent saved for the person to look at, each with a caption; the
 * one place under `.plumbbob/` an agent may write is the step's evidence
 * folder, and the CLI keeps only the entries that sit inside it. No field here can
 * advance the loop: nothing an agent returns may checkpoint, flip a step, or
 * trigger another agent, so the subprocess boundary keeps the human as the
 * clock by construction.
 */
export type AgentEnvelope = {
  readonly contract: number
  readonly status: EnvelopeStatus
  readonly summary: string
  readonly body: string
  readonly parked: ReadonlyArray<string>
  readonly notes: string
  readonly evidence: ReadonlyArray<AgentEvidence>
}

/**
 * One thing an agent hands the person to look at: a file it saved under the
 * step's evidence folder, as a repo-relative path, and the caption the verify
 * pause links it by.
 */
export type AgentEvidence = {
  readonly path: string
  readonly caption: string
}

export type ManifestParse =
  | { readonly ok: true; readonly manifest: AgentManifest }
  | { readonly ok: false; readonly error: string }

export type EnvelopeParse =
  | { readonly ok: true; readonly envelope: AgentEnvelope; readonly warnings: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/**
 * Validate a parsed `agent.json`.
 *
 * Contract is checked first (a version mismatch gets an upgrade hint, not a
 * field complaint, since older field checks may not apply across a major).
 * Then: a non-empty `name` and `command`, and a `slots` subset of {before,
 * build, after}. Unknown keys pass through untouched.
 */
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

/**
 * Validate a child's output envelope (already JSON-parsed from its stdout).
 *
 * Contract first (mismatch → upgrade hint), then a `status` in {done, blocked,
 * drift}, a non-empty `summary`, and a well-formed `parked[]`. Optional prose
 * fields default to empty; unknown keys are tolerated. `evidence[]` is read
 * loosely: an entry without a `path` and a `caption` drops, and so does an
 * `evidence` that is not a list, each with one line in `warnings` for the
 * caller to print, while the rest of the envelope stands.
 */
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
  const evidence = parseEvidence(obj.evidence)

  return {
    ok: true,
    envelope: {
      contract: CONTRACT_VERSION,
      status: obj.status,
      summary: obj.summary,
      body: asString(obj.body),
      parked,
      notes: asString(obj.notes),
      evidence: evidence.entries,
    },
    warnings: evidence.warnings,
  }
}

/**
 * True when a string names one of the three slots.
 *
 * Exported for the `agent run` verb's `--mode` refusal: a mode the manifest
 * doesn't declare is refused loud; the user who typed it asked for that slot
 * specifically.
 */
export function isSlot(value: string): value is Slot {
  return (SLOTS as ReadonlyArray<string>).includes(value)
}

/**
 * Validate the shared `contract` field.
 *
 * A missing / non-integer contract is malformed; a present-but-different major
 * is a version mismatch and gets an upgrade hint pointing at whichever side is
 * behind. Returns an error string, or null when the contract is the supported
 * major.
 */
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

/**
 * Narrow the manifest's `slots` to the subset it declares.
 *
 * Must be a non-empty array drawn from SLOTS, with strangers refused and
 * duplicates collapsed. Returns the narrowed slots, or an error string.
 */
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

/**
 * Narrow the envelope's optional `parked[]` (absent = none).
 *
 * Present, it must be an array of non-blank strings: each becomes a park line
 * the CLI lands through the park verb. A malformed list is refused rather than
 * silently dropped: losing a parked concern is a quiet data loss. Returns the
 * trimmed lines or an error string.
 */
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

/** The entries of an `evidence[]` that passed a check, and one warning line for each that did not. */
export type EvidenceRead = {
  readonly entries: ReadonlyArray<AgentEvidence>
  readonly warnings: ReadonlyArray<string>
}

/**
 * Narrow the envelope's optional `evidence[]` (absent = none) by shape alone.
 *
 * Each entry needs a non-blank string `path` and a non-blank string `caption`,
 * both kept trimmed. Unlike `parked[]`, nothing here refuses the envelope: a
 * screenshot the person never sees costs a look, where a lost park costs a
 * concern, so a malformed entry drops with a warning naming it and the result
 * stands. Whether a path sits under the step's evidence folder is
 * `acceptEvidence`'s question, since it takes the repo to answer.
 */
function parseEvidence(value: unknown): EvidenceRead {
  if (value === undefined || value === null) {
    return { entries: [], warnings: [] }
  }
  if (!Array.isArray(value)) {
    return {
      entries: [],
      warnings: ['plumbbob: ignored the agent envelope\'s "evidence" (it must be an array of { path, caption } entries)'],
    }
  }
  const entries: AgentEvidence[] = []
  const warnings: string[] = []
  for (const entry of value) {
    const path = isObject(entry) && typeof entry.path === 'string' ? entry.path.trim() : ''
    const caption = isObject(entry) && typeof entry.caption === 'string' ? entry.caption.trim() : ''
    if (path.length > 0 && caption.length > 0) {
      entries.push({ path, caption })
      continue
    }
    const named = path.length > 0 ? path : JSON.stringify(entry)
    warnings.push(evidenceWarning(named, 'each entry needs a string "path" and a string "caption"'))
  }
  return { entries, warnings }
}

/**
 * Keep the evidence that sits under one step's evidence folder, and say why
 * each other entry dropped.
 *
 * `dir` is the folder as a repo-relative path. An entry stands when its path
 * is one printable line (no control character, backtick or angle bracket), is
 * relative, climbs through no `..`, lies strictly inside the folder, still
 * lies inside it once every symlink on the way is resolved, and is not a
 * directory. The folder itself is where the real repo root puts it, so a link
 * standing in for `evidence/` or for the step's folder carries nothing out. A
 * path whose file is not there yet is judged by its nearest existing ancestor,
 * so a linked folder cannot carry a missing file out either. The same path given
 * twice keeps its last caption. Nothing is read, moved, or removed: this only
 * decides what the pause may link.
 */
export function acceptEvidence(root: string, dir: string, entries: ReadonlyArray<AgentEvidence>): EvidenceRead {
  const folder = toPosix(dir).replace(/\/+$/, '')
  const kept = new Map<string, AgentEvidence>()
  const warnings: string[] = []
  for (const entry of entries) {
    const reason = evidenceRefusal(root, folder, entry.path)
    if (reason !== null) {
      warnings.push(evidenceWarning(entry.path, reason))
      continue
    }
    const path = posix.normalize(toPosix(entry.path))
    kept.set(path, { path, caption: entry.caption })
  }
  return { entries: [...kept.values()], warnings }
}

// What an evidence path may not hold: a control character or line break, a
// backtick, or an angle bracket. The path is written into the build log's code
// span and the pause's link target, where any of these would end the span or
// the link early or start a line of the agent's own.
const UNPRINTABLE_PATH = /[\p{Cc}\p{Zl}\p{Zp}`<>]/u

/**
 * Why one evidence path does not stand, or null when it does.
 */
function evidenceRefusal(root: string, folder: string, path: string): string | null {
  if (UNPRINTABLE_PATH.test(path)) {
    return 'the path must be one line with no backtick or angle bracket'
  }
  const given = toPosix(path)
  if (isAbsolute(path) || posix.isAbsolute(given) || /^[a-z]:/i.test(given)) {
    return 'the path must be relative to the repo root'
  }
  if (given.split('/').includes('..')) {
    return 'the path must not climb with ".."'
  }
  const clean = posix.normalize(given)
  if (!clean.startsWith(`${folder}/`) || clean.endsWith('/')) {
    return `it must be a file under ${folder}/`
  }
  // The folder is anchored to the real repo root and resolved no further, so
  // a link standing in for it, or for a folder above it, settles elsewhere.
  const home = join(settled(root), folder)
  const real = settled(join(root, clean))
  if (!real.startsWith(`${home}${sep}`)) {
    return `it resolves outside ${folder}/`
  }
  if (isDirectory(real)) {
    return `it must be a file under ${folder}/`
  }
  return null
}

/** Whether a path is a directory that exists; a path not there yet is not one. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * A path with every symlink on the way resolved, whether or not it exists.
 *
 * The nearest ancestor that exists is resolved and the missing tail is put
 * back on it, so a folder nobody has made yet still settles to where it would
 * be.
 */
function settled(path: string): string {
  let at = path
  for (;;) {
    try {
      return join(realpathSync(at), relative(at, path))
    } catch {
      const up = dirname(at)
      if (up === at) return path
      at = up
    }
  }
}

/**
 * A path with forward slashes, the way an envelope and a markdown link write
 * one.
 */
function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * The one line a dropped evidence entry gets on stderr: what it was, then why.
 * A name that would not print on one line is quoted as JSON, so it does.
 */
function evidenceWarning(named: string, reason: string): string {
  const quoted = JSON.stringify(named).replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)
  return `plumbbob: dropped evidence ${UNPRINTABLE_PATH.test(named) ? quoted : named} (${reason})`
}

/**
 * Coerce an optional prose field (description, when, body, notes) to a string.
 *
 * Absent and blank read the same to the host model, and a non-string value is
 * coerced away rather than refused, because these are advisory prose, not
 * gates.
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * True when a string names one of the envelope statuses.
 */
function isStatus(value: string): value is EnvelopeStatus {
  return (ENVELOPE_STATUSES as ReadonlyArray<string>).includes(value)
}

/**
 * Wrap an error string as a failed manifest parse.
 */
function manifestFail(error: string): ManifestParse {
  return { ok: false, error }
}

/**
 * Wrap an error string as a failed envelope parse.
 */
function envelopeFail(error: string): EnvelopeParse {
  return { ok: false, error }
}

// --- resolution ---

/**
 * The tier an agent resolved from.
 *
 * `flag` is a `--agent <path>` override (top priority); `project` is
 * `.plumbbob/agents/` (tracked, so it rides the branch into the PR);
 * `personal` is `~/.plumbbob/agents/` (the user's own library); `builtin` is
 * the `builtin-agents/` directory plumbbob ships. Resolution walks flag →
 * project → personal → builtin, first hit wins: the same most-specific-wins
 * shape as the settings ladder. `path` is a binding written as a path, which
 * names its directory outright and walks no tier.
 */
export type AgentOrigin = 'flag' | 'project' | 'personal' | 'builtin' | 'path'

/**
 * Where the tiers outside the repo sit, for a caller that needs them somewhere
 * else.
 *
 * Verbs pass nothing and get the environment's home and the directory shipped
 * with the package; tests pass a temp `home` or `builtinDir` to exercise a tier
 * without touching process.env or the shipped directory.
 */
export type AgentTiers = {
  readonly home?: string
  readonly builtinDir?: string
}

/**
 * A resolved agent: its validated manifest, the tier it came from, and its own
 * directory.
 *
 * The directory is what `runAgent` exposes to the child as PLUMBBOB_AGENT_DIR,
 * so an agent whose cwd is the repo root can still reach its own files.
 */
export type ResolvedAgent = {
  readonly manifest: AgentManifest
  readonly origin: AgentOrigin
  readonly dir: string
}

export type AgentResolution =
  | { readonly ok: true; readonly agent: ResolvedAgent }
  | { readonly ok: false; readonly error: string }

/**
 * One agent's line in `agent list`: its name, the tier it resolves from, and
 * the resolution (a valid manifest, or the parse error so list/doctor can flag
 * a malformed agent.json rather than hide it).
 */
export type AgentListing = {
  readonly name: string
  readonly origin: AgentOrigin
  readonly resolution: AgentResolution
}

/**
 * The project agents tier: `.plumbbob/agents/` under the repo root.
 */
export function projectAgentsDir(root: string): string {
  return join(root, '.plumbbob', 'agents')
}

/**
 * The personal agents tier: `~/.plumbbob/agents/`, the user's own library.
 */
export function personalAgentsDir(home: string): string {
  return join(home, '.plumbbob', 'agents')
}

/**
 * The built-in agents tier: the `builtin-agents/` directory at the package
 * root, holding the agents plumbbob ships.
 *
 * Resolved relative to the compiled module URL, the way `templates/` is, so
 * the same hop works from `src/lib/` and `dist/lib/`. It is not named
 * `agents/` because a host reads a plugin's `agents/` as its own subagent
 * definitions.
 */
export function builtinAgentsDir(): string {
  return fileURLToPath(new URL('../../builtin-agents', import.meta.url))
}

/**
 * The home dir the personal tier resolves under.
 *
 * Callers (verbs) pass nothing and get the environment's HOME (matching
 * doctor.ts); tests pass an explicit dir to exercise an HOME-overridden
 * personal library without touching process.env.
 */
function agentsHome(home?: string): string {
  return home ?? process.env.HOME ?? homedir()
}

/**
 * Resolve an agent by name across the tiers, first hit wins.
 *
 * A `flagPath` (from `--agent <path>`) points straight at an agent directory
 * and takes top priority. A tier "hits" when it holds an `agent.json`: a
 * malformed one there is surfaced as an error (project still shadows
 * personal, and both shadow a built-in), never silently skipped in favor of a
 * different agent; an explicit ask fails loud. Returns the not-found error
 * only when no tier holds a manifest at all.
 */
export function resolveAgent(
  root: string,
  name: string,
  opts: AgentTiers & { readonly flagPath?: string } = {},
): AgentResolution {
  if (opts.flagPath !== undefined) {
    const hit = loadAgentDir(opts.flagPath, 'flag')
    return hit ?? { ok: false, error: `no agent.json at --agent path ${opts.flagPath}` }
  }
  const home = agentsHome(opts.home)
  const tiers: ReadonlyArray<readonly [string, AgentOrigin]> = [
    [join(projectAgentsDir(root), name), 'project'],
    [join(personalAgentsDir(home), name), 'personal'],
    [join(opts.builtinDir ?? builtinAgentsDir(), name), 'builtin'],
  ]
  for (const [dir, origin] of tiers) {
    const hit = loadAgentDir(dir, origin)
    if (hit !== null) return hit
  }
  return {
    ok: false,
    error: `no agent named "${name}", looked in ${projectAgentsDir(root)}, ${personalAgentsDir(home)}, and plumbbob's built-in agents`,
  }
}

/**
 * A binding's resolution: the agent, or the error and whether it is `loud`.
 *
 * A loud miss is a mistake in the repo, so the run refuses; a quiet one is a
 * teammate who lacks the agent, so the run warns and skips the binding.
 */
export type BindingResolution =
  | { readonly ok: true; readonly agent: ResolvedAgent }
  | { readonly ok: false; readonly error: string; readonly loud: boolean }

/**
 * True when a binding is written as a path and not a name: `./` or `../`
 * (from the repo root), `~/` (from the home directory), or an absolute path.
 */
export function isPathBinding(binding: string): boolean {
  return /^(\.{1,2}|~)(\/|$)/.test(binding) || isAbsolute(binding)
}

/**
 * Resolve one binding from harness.json or the settings defaults: a name
 * through the tiers, a path as the directory it names.
 *
 * A name that misses is quiet, because the agent may live in one person's
 * library. A path splits on where it points. `./` resolves from the repo root
 * and must stay inside it, lexically and once every symlink is resolved, and a
 * `../` path cannot; both are loud when they miss or break, since the path is
 * in the repo and so is the mistake. `~/` resolves from the home directory and
 * an absolute path stands as written; either one names a place on one person's
 * machine in a file the whole team tracks, so a miss there is quiet like a
 * missing name.
 */
export function resolveBinding(root: string, binding: string, opts: AgentTiers = {}): BindingResolution {
  if (!isPathBinding(binding)) {
    const named = resolveAgent(root, binding, opts)
    return named.ok ? named : { ok: false, error: named.error, loud: false }
  }
  const inRepo = binding.startsWith('.')
  const escape = inRepo ? repoEscape(root, binding) : null
  if (escape !== null) {
    return { ok: false, error: escape, loud: true }
  }
  const dir = inRepo
    ? resolve(root, binding)
    : binding.startsWith('~')
      ? join(agentsHome(opts.home), binding.slice(1))
      : binding
  const hit = loadAgentDir(dir, 'path')
  if (hit === null) {
    return { ok: false, error: `no agent.json at binding path ${binding}`, loud: inRepo }
  }
  return hit.ok ? hit : { ok: false, error: hit.error, loud: inRepo }
}

/**
 * Why a `./` or `../` binding does not stay in the repo, or null when it does.
 *
 * The path is judged twice: as written, where a `..` segment may carry it
 * above the root, and with every symlink resolved, where a linked folder or a
 * linked `agent.json` may. A path that is not there yet is judged by its
 * nearest existing ancestor.
 */
function repoEscape(root: string, binding: string): string | null {
  const dir = resolve(root, binding)
  if (climbsAbove(binding) || !isInside(resolve(root), dir)) {
    return `binding path ${binding} leaves the repo, and a relative binding must stay inside it`
  }
  const home = settled(root)
  if (!isInside(home, settled(dir)) || !isInside(home, settled(join(dir, 'agent.json')))) {
    return `binding path ${binding} resolves outside the repo, and a relative binding must stay inside it`
  }
  return null
}

/**
 * Whether a relative path steps above where it started at any point on the
 * way, even when later segments bring it back down.
 *
 * `../repo/tools/walk` lands inside a checkout whose folder is named `repo`
 * and nowhere else, so where it lands says nothing about whether it stayed.
 */
function climbsAbove(binding: string): boolean {
  let depth = 0
  for (const segment of binding.split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue
    depth += segment === '..' ? -1 : 1
    if (depth < 0) return true
  }
  return false
}

/** Whether `path` is `folder` itself or sits somewhere under it. */
function isInside(folder: string, path: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`)
}

/**
 * Every resolvable agent across the three tiers, sorted by name.
 *
 * Project shadows personal, and both shadow a built-in: a name defined in
 * more than one tier resolves (and lists) from the first. Each entry carries
 * its origin and resolution; a malformed manifest lands as an errored
 * resolution rather than crashing the walk. An empty or missing tier
 * directory lists nothing.
 */
export function listAgents(root: string, opts: AgentTiers = {}): ReadonlyArray<AgentListing> {
  const home = agentsHome(opts.home)
  const builtinDir = opts.builtinDir ?? builtinAgentsDir()
  const tiers: ReadonlyArray<readonly [string, AgentOrigin]> = [
    [projectAgentsDir(root), 'project'],
    [personalAgentsDir(home), 'personal'],
    [builtinDir, 'builtin'],
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
    resolution: resolveAgent(root, name, { home, builtinDir }),
  }))
}

/**
 * Render `agent list`'s output.
 *
 * Pure so the verb stays a thin read-write shell and the formatting is
 * unit-tested here. Prints name, origin, slots, and description per agent; a
 * malformed manifest gets a `✗ … invalid:` line.
 */
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

/**
 * Load and validate the `agent.json` in one agent directory.
 *
 * Returns null when the directory holds no manifest (a tier miss, so
 * resolution falls through), an errored resolution when the manifest is
 * present but unreadable/malformed, else the resolved agent. A missing file
 * (ENOENT throw) is the miss signal: one read, no TOCTOU race.
 */
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

/**
 * The names of subdirectories under an agents tier that carry an `agent.json`.
 *
 * Filtering here means `listAgents` never lists a bare folder that resolution
 * would then miss. An absent tier directory yields no names.
 */
function agentDirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'agent.json')))
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

// --- step context ---

/**
 * The input JSON a child agent reads on stdin: the whole picture of the step
 * it runs against, composed deterministically from intent.md + settings.
 *
 * `mode` is the slot being run; `context[]` carries earlier before-slot
 * outputs inline (the simplest transport until size proves otherwise);
 * `settings` is plumbbob's own relevant settings and nothing else; plumbbob
 * never touches a provider key, so auth, model choice, and sandboxing stay the
 * agent's business. The step's `seam` (the paths the step is granted to
 * edit) is parsed strictly because seams gate git behavior; the title,
 * proof, decisions, and constraints are best-effort prose for the agent's
 * context. `step.proof` is the step's proof as written, with the command it
 * opens on when there is one; `step.doneWhen` is the same text under the name
 * it had first, kept so an agent reading it still works. `step.evidenceDir`
 * is the repo-relative folder the agent may save evidence under, which it
 * makes itself when it has something to show. `step.like` is the
 * files the step names to copy the pattern from, empty when it names none;
 * they are advice, read loosely, and whether each exists is not checked.
 */
export type StepContext = {
  readonly contract: number
  readonly mode: Slot
  readonly build: { readonly slug: string; readonly title: string }
  readonly step: {
    readonly n: number
    readonly title: string
    readonly doneWhen: string
    readonly proof: { readonly command: string | null; readonly text: string }
    readonly seam: ReadonlyArray<string>
    readonly like: ReadonlyArray<string>
    readonly evidenceDir: string
  }
  readonly decisions: ReadonlyArray<string>
  readonly constraints: ReadonlyArray<string>
  readonly context: ReadonlyArray<string>
  readonly settings: Record<string, unknown>
}

export type StepContextResult =
  | { readonly ok: true; readonly input: StepContext; readonly warnings: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/**
 * Compose the StepContext for one step.
 *
 * The strict seam parse is the only refusal path: a missing step or
 * unparseable seam gates git behavior, so it fails loud; everything else is
 * best-effort and lands whatever it can, returning `warnings` (skipped-bullet
 * lines) for the caller to print on stderr rather than writing there itself;
 * this module stays pure, the verb does the IO.
 */
export function composeStepContext(params: {
  readonly intent: string
  readonly slug: string
  readonly step: number
  readonly mode: Slot
  readonly context?: ReadonlyArray<string>
  readonly settings?: Record<string, unknown>
  readonly evidenceDir?: string
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
      step: {
        n: params.step,
        title: meta.title,
        doneWhen: meta.proof.text,
        proof: meta.proof,
        seam: seam.seam,
        like: parseStepLike(params.intent, params.step),
        evidenceDir: params.evidenceDir ?? '',
      },
      decisions: decisions.items,
      constraints: constraints.items,
      context: params.context ?? [],
      settings: params.settings ?? {},
    },
    warnings,
  }
}

/**
 * Format the skipped-line warnings for one scraped intent.md section.
 */
function skipWarnings(heading: string, skipped: ReadonlyArray<string>): string[] {
  return skipped.map(
    (line) => `intent.md: skipped a non-bullet line under ${heading} — ${JSON.stringify(line.trim())}`,
  )
}

// --- harness bindings ---

/**
 * A slot→agents map: the agents bound to each of the three lifecycle points.
 *
 * Only bound slots are present as keys; an absent slot falls through the
 * merge ladder, so the map must distinguish "not bound here" from "bound to
 * nothing". Shared by a harness `defaults` block, a per-step entry, and the
 * settings-level defaults.
 */
export type SlotBindings = Partial<Record<Slot, ReadonlyArray<string>>>

/**
 * One step's entry in the harness: its slot bindings plus `note`.
 *
 * `note` is prose the host model reads (like a manifest `when`), never the
 * CLI's mechanics: the harness stays bindings + prose, no control flow.
 * Loops, retries, and conditionals belong in agents (as code) or in prose (read
 * by the host model), never in config.
 */
export type StepBinding = {
  readonly bindings: SlotBindings
  readonly note: string
}

/**
 * harness.json: the planned per-step agent bindings for one build.
 *
 * Authored at /plumbbob:plan time as a sibling of intent.md in the build's tracked
 * `builds/<slug>/` folder: the plan says what/why, the harness says with-what.
 * Contract-gated like the manifest and envelope. `defaults` bind agents to
 * every step; a per-step entry under `steps.<n>` overrides the defaults for
 * the slots it names (replace, not append).
 */
export type HarnessBindings = {
  readonly contract: number
  readonly defaults: SlotBindings
  readonly steps: ReadonlyMap<number, StepBinding>
}

export type HarnessParse =
  | { readonly ok: true; readonly harness: HarnessBindings }
  | { readonly ok: false; readonly error: string }

/**
 * Validate a parsed harness.json.
 *
 * Contract first (a major mismatch gets the same upgrade hint as the manifest
 * and envelope). Structure is strict: a `steps` that is not an object, a
 * non-numeric step key, or a step entry that is not an object is the author's
 * error and is refused loud. Slot *contents* stay lenient: a slot value may be
 * one name or a list, and blanks/non-strings drop rather than refuse, because
 * bindings feed a spawn, not a git-gating parse.
 */
function parseHarness(raw: unknown): HarnessParse {
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

/**
 * Read and validate a harness.json at `path`.
 *
 * The caller builds the path from the build folder; this module stays
 * ignorant of the sidecar layout, taking the full path. Returns null when the
 * file is absent (a build with no bound agents: a clean no-op); an errored
 * parse when present-but-broken (invalid JSON or a malformed structure the
 * author must fix); else the validated bindings. Shared so every reader
 * (`agent run`, `status`) parses the harness the same way.
 */
export function readHarnessFile(path: string): HarnessParse | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: `${path} is not valid JSON.` }
  }
  return parseHarness(parsed)
}

/**
 * Narrow a raw slot→agents object to the slots it actually binds.
 *
 * Accepts a harness `defaults` block, a per-step entry, or the settings-level
 * defaults. A slot value may be a single agent name or a list; blanks and
 * non-strings drop. Only the three real slots are read; `note` and any
 * stranger key are ignored here. A slot present but naming no valid agent
 * still counts as bound-to-nothing (an explicit override to none), so callers
 * get clean replace semantics up the ladder.
 */
export function parseSlotBindings(raw: unknown): SlotBindings {
  if (!isObject(raw)) return {}
  const out: { -readonly [K in Slot]?: ReadonlyArray<string> } = {}
  for (const slot of SLOTS) {
    if (slot in raw) out[slot] = asNameList(raw[slot])
  }
  return out
}

/**
 * The agents bound to one slot for one step, merged down the bindings ladder.
 *
 * A per-step slot entry overrides the harness `defaults`, which override the
 * settings-level defaults: the first level that names the slot wins, replace
 * not append, the same most-specific-wins shape as the settings ladder. The
 * `--agent` flag and an explicit name sit above all of this, but the verb
 * takes the single-agent path for those and never reaches here. Returns []
 * when no level binds the slot: nothing to run, a clean no-op.
 */
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

/**
 * Coerce a slot value (one agent name or a list) to a trimmed name list,
 * dropping blanks and non-strings.
 */
function asNameList(value: unknown): ReadonlyArray<string> {
  const items = Array.isArray(value) ? value : [value]
  return items.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
}

/**
 * True when a value is a plain JSON object: not null, not an array.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// --- invocation ---

/**
 * The outcome of one spawned agent run: a discriminated union the verb maps
 * to terminal reporting and side effects.
 *
 * Exactly one arm is authoritative: `ok` only when the child exited 0 AND its
 * stdout parsed to a valid envelope. A non-zero exit is a failed run reported
 * verbatim: the envelope of a child that failed is not trusted; `contract` is
 * exit-0-but-garbage (unparseable stdout or a version mismatch, carrying
 * parseEnvelope's hint); `timeout` and `interrupted` are the stop paths, and
 * a `timeout` carries the grace the agent was given to stop in and whether it
 * took the SIGKILL to end it (`killed`), or it went on the SIGTERM; `spawn` is
 * a shell that never started. `stdout` rides along on the outcomes
 * that have it so the verb can surface the raw bytes when a run went sideways.
 */
export type AgentRunResult =
  | {
      readonly ok: true
      readonly envelope: AgentEnvelope
      readonly stdout: string
      readonly warnings: ReadonlyArray<string>
    }
  | { readonly ok: false; readonly reason: 'exit'; readonly code: number; readonly stdout: string }
  | { readonly ok: false; readonly reason: 'contract'; readonly error: string; readonly stdout: string }
  | {
      readonly ok: false
      readonly reason: 'timeout'
      readonly seconds: number
      readonly graceSeconds: number
      readonly killed: boolean
    }
  | { readonly ok: false; readonly reason: 'interrupted' }
  | { readonly ok: false; readonly reason: 'spawn'; readonly error: string }

/**
 * How many seconds a stopped agent has to clean up before its process group
 * is killed.
 *
 * An agent that started an app server or a browser needs a moment to close
 * it. Five seconds covers a tidy shutdown and is short enough that a person
 * who pressed Ctrl-C is still at the keyboard when the run reports.
 */
export const STOP_GRACE_SECONDS = 5

// The signals that mean plumbbob itself is being stopped while an agent runs:
// Ctrl-C, a host ending the command, and the terminal going away.
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

// How often a stop looks to see whether the agent's process group has emptied.
const STOP_POLL_MS = 25

// How long a stop still waits after the group's SIGKILL before it reports
// anyway, for the process a kill cannot reach.
const KILL_SETTLE_MS = 1000

/**
 * Spawn an agent's `command` and settle with the run's outcome.
 *
 * The command runs via the shell (`sh -c` on POSIX) at the repo root, so a
 * build-slot agent's repo-relative seam edits resolve; the agent's own
 * directory rides in `PLUMBBOB_AGENT_DIR` so a root-cwd agent can still reach
 * its files. The composed StepContext is delivered as JSON on stdin. Stdout is
 * piped and captured (the envelope); stderr is inherited so the child's prose
 * streams live to the terminal: production (narrating) never collides with
 * consumption (one structured result at the pause). Async `spawn`, not
 * `spawnSync`, so the parent stays live to interrupt gracefully. Never
 * rejects: every failure mode is a resolved `AgentRunResult`.
 *
 * The agent is spawned as the leader of its own process group, so a stop
 * reaches everything it started and not the shell alone. A stop sends the
 * group SIGTERM, waits up to `graceSeconds` (STOP_GRACE_SECONDS when absent)
 * for the group to empty, then sends it SIGKILL, and the run settles once the
 * group is gone. Three things stop an agent: a positive `timeoutSeconds`
 * expiring (0 = off; a timeout is the user's explicit opt-in), reported as
 * `timeout`; a SIGINT, SIGTERM or SIGHUP reaching plumbbob while the agent
 * runs, reported as `interrupted`; and the agent exiting while something it
 * started is still running, where the stop sweeps what is left and the run
 * reports the exit it had. A second signal during the grace skips the rest of
 * it. An agent that leaves nothing behind settles the moment it closes.
 */
export function runAgent(params: {
  readonly root: string
  readonly command: string
  readonly agentDir: string
  readonly input: StepContext
  readonly timeoutSeconds: number
  readonly graceSeconds?: number
}): Promise<AgentRunResult> {
  const graceSeconds = params.graceSeconds ?? STOP_GRACE_SECONDS
  return new Promise((resolve) => {
    // Registered before the fork: the agent leads a group of its own, so a
    // signal that reached plumbbob in the gap between the spawn and these
    // handlers would kill plumbbob by default and leave the agent running with
    // nothing to stop it. A handler only runs from the event loop, after this
    // turn has set up everything it reads.
    for (const signal of STOP_SIGNALS) process.on(signal, onSignal)
    process.on('exit', onExit)

    const child = spawn(params.command, {
      cwd: params.root,
      shell: true,
      detached: true,
      env: { ...process.env, PLUMBBOB_AGENT_DIR: params.agentDir },
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    let stdout = ''
    let settled = false
    // The result a stop under way will report, and when its SIGKILL went out.
    let stopping: AgentRunResult | null = null
    let killedAt: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let grace: ReturnType<typeof setTimeout> | null = null
    let poll: ReturnType<typeof setInterval> | null = null

    // Signal the agent's whole process group; `0` only asks whether any of it
    // is left. False when there is nothing there to signal. Where a group
    // cannot be addressed at all, the signal goes to the child alone.
    const signalGroup = (signal: NodeJS.Signals | 0): boolean => {
      if (child.pid === undefined) return false
      try {
        process.kill(-child.pid, signal)
        return true
      } catch {
        return signal !== 0 && child.exitCode === null && child.signalCode === null && child.kill(signal)
      }
    }

    const finish = (result: AgentRunResult): void => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      if (grace !== null) clearTimeout(grace)
      if (poll !== null) clearInterval(poll)
      for (const signal of STOP_SIGNALS) process.off(signal, onSignal)
      process.off('exit', onExit)
      // A process that left the group may still hold the pipe; let go of it
      // so it cannot keep this one alive.
      child.stdout.destroy()
      resolve(result)
    }

    const kill = (): void => {
      if (killedAt !== null) return
      killedAt = Date.now()
      signalGroup('SIGKILL')
    }

    // Stop the group and report `result` once it is gone. A stop asked for
    // while one is under way keeps the first result and skips the grace.
    const stop = (result: AgentRunResult): void => {
      if (settled) return
      if (stopping !== null) {
        kill()
        return
      }
      stopping = result
      if (timer !== null) clearTimeout(timer)
      if (!signalGroup('SIGTERM')) {
        finish(result)
        return
      }
      grace = setTimeout(kill, graceSeconds * 1000)
      poll = setInterval(() => {
        const unreachable = killedAt !== null && Date.now() - killedAt >= KILL_SETTLE_MS
        if (signalGroup(0) && !unreachable) return
        // Only now is it known whether the SIGTERM was enough.
        finish(!result.ok && result.reason === 'timeout' ? { ...result, killed: killedAt !== null } : result)
      }, STOP_POLL_MS)
    }

    // Stop the agent and report, rather than let a Ctrl-C orphan it.
    function onSignal(): void {
      stop({ ok: false, reason: 'interrupted' })
    }

    // plumbbob going away by any other road has no time left to wait.
    function onExit(): void {
      signalGroup('SIGKILL')
    }

    if (params.timeoutSeconds > 0) {
      timer = setTimeout(() => {
        stop({ ok: false, reason: 'timeout', seconds: params.timeoutSeconds, graceSeconds, killed: false })
      }, params.timeoutSeconds * 1000)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    // A shell that never launched (for example `sh` itself missing): distinct from a
    // command that ran and exited non-zero, which arrives on `close`.
    child.on('error', (err: Error) => {
      finish({ ok: false, reason: 'spawn', error: err.message })
    })

    child.on('close', (code: number | null) => {
      // A stop already under way reports its own result once the group is gone.
      if (stopping !== null) return
      if (code !== 0) {
        stop({ ok: false, reason: 'exit', code: code ?? 1, stdout })
        return
      }
      const parsed = parseChildEnvelope(stdout)
      stop(
        parsed.ok
          ? { ok: true, envelope: parsed.envelope, stdout, warnings: parsed.warnings }
          : { ok: false, reason: 'contract', error: parsed.error, stdout },
      )
    })

    // Deliver the StepContext and close stdin so a child reading to EOF proceeds.
    child.stdin.write(JSON.stringify(params.input))
    child.stdin.end()
  })
}

/**
 * Parse the child's captured stdout into a validated envelope.
 *
 * JSON first (a non-JSON stdout is out of contract: the envelope must be one
 * JSON object), then the envelope validator, which carries the
 * contract-mismatch hint. Kept private; `runAgent` is the only caller and the
 * verb reads the union, not this.
 */
function parseChildEnvelope(stdout: string): EnvelopeParse {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return { ok: false, error: 'the agent wrote non-JSON to stdout, so the envelope is not a single JSON object' }
  }
  return parseEnvelope(raw)
}
