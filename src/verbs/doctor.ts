// `plumbbob doctor`: the health report, eight sections under one verb.
//
// 1. The global plugin link (read-only). After `plumbbob init`, plumbbob lives as a
//    symlink at ~/.claude/skills/plumbbob pointing at the installed package; Claude
//    Code loads it in place as a plugin (skills `/plumbbob:*`, the hooks from
//    hooks.json). doctor verifies the link resolves to a package carrying the manifest,
//    the skills, and the hooks, and names the fix for anything missing. The failure
//    class it exists for is SILENT (a `/plumbbob:status` that opens an empty dashboard
//    because the plugin never linked).
//
// 2. The repo sidecar layout. plumbbob keeps its per-repo state in a `.plumbbob/`
//    sidecar: a tracked artifact plane (settings.json plus one `builds/<slug>/` folder
//    per build (intent, build-log, checkpoints, report) that rides its branch into
//    the PR) and a git-excluded control plane of per-worktree files. A repo scaffolded
//    by an older plumbbob carries the legacy FLAT sidecar instead (`.plumbbob/intent.md`,
//    `config`, `archive/`), fully git-excluded, whose record dies with
//    `git worktree remove`. doctor detects it and, with `--migrate`, moves it into the
//    tracked `builds/<slug>/` layout: archive entries and the active session become
//    build folders, `config` becomes `settings.json`, and the whole move is STAGED but
//    never committed: the human owns that commit.
//
// 3. Repo setup. Whether the repo is ready for a first build: the `.plumbbob/`
//    folder, its settings.json, every control file ignored by git (by whatever
//    rule: plumbbob's info/exclude lines or the repo's own), and a commit for
//    `start` to record as the baseline. Each gap is a ○ warning naming
//    `plumbbob setup`, never a failure, since a person may set the repo up by
//    hand however they like.
//
// 4. Agent validation. Every resolvable user-authored agent gets its manifest and its
//    `command` statically checked, so a broken agent surfaces here rather than mid-build.
//    A binding written as a path, in the active build's harness.json or the settings
//    `agents` key, is resolved the way a run resolves it and gets a row of its own.
//
// 5. The check gate. When a `check` setting overrides checkride (the default heavy
//    check), doctor names the command; otherwise it runs checkride's own doctor and
//    prints the slot/adapter table: "detected but tool missing" is the footgun this
//    exists for.
//
// 6. The approval latch. Reports whether the harness's turn ledger is live (checkpoint
//    can latch on a recorded human turn) or dormant (guidance only): dormant is a
//    state, never a failure.
//
// 7. The reach. Whether atis is on PATH to split a step's diff at the pause;
//    optional, so never a failure.
//
// 8. The contract paths. When `contractPaths` lists any, each entry that can
//    never match (one the seam grammar refuses, or a folder written without its
//    slash) is a problem with its fix, since it would read `none touched` in
//    every report; an entry that names nothing in the tree yet is a ○ line.
//
// Functional, node builtins plus checkride.

import { accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDoctor } from 'checkride'
import type { DoctorCheck } from 'checkride'
import {
  type AgentListing,
  type AgentTiers,
  type BindingResolution,
  type Slot,
  type SlotBindings,
  SLOTS,
  isPathBinding,
  listAgents,
  parseSlotBindings,
  readHarnessFile,
  resolveBinding,
} from '../lib/agents.ts'
import { gateDetectsTools } from '../lib/check.ts'
import { contractIssues, contractPaths } from '../lib/contract.ts'
import { atisVersion } from '../lib/reachfile.ts'
import { marketplacePlumbbob } from '../lib/plugins.ts'
import { findRepoRoot, gitPath, hasCommit, stagePath } from '../lib/git.ts'
import {
  activeBuild,
  buildDir,
  buildFolder,
  buildFolderIgnored,
  excludeControl,
  listBuilds,
  readTurn,
  setActiveBuild,
  sidecarDir,
  slugify,
  unignoredControl,
} from '../lib/sidecar.ts'
import { resolveBoolean, resolveRecord, resolveString, settingsPath } from '../lib/settings.ts'

/**
 * The injectable toolchain-probe seam checkride's doctor accepts.
 *
 * checkride's `DoctorEnv` isn't a named export, so it is derived from `runDoctor`'s
 * options. The check-gate tests inject a deterministic probe to stay hermetic: the
 * real env spawns `pnpm --version` with a 5s cap that the full-suite parallel load
 * intermittently blows, adding a spurious `✗ pnpm`.
 */
export type GateEnv = NonNullable<Parameters<typeof runDoctor>[0]['env']>

// One printable doctor row; `fix` prints under a failed check.
type Check = { readonly ok: boolean; readonly label: string; readonly fix?: string }

/**
 * Resolve a directory shipped inside the plumbbob package (for example its skills/).
 *
 * Resolved off this module's URL so it lands the same from src/ (dev) and
 * dist/ (published).
 */
function packageDir(name: string): string {
  return fileURLToPath(new URL(`../../${name}/`, import.meta.url))
}

/**
 * Skill directories (those carrying a SKILL.md) under `dir`.
 */
function listSkills(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md')))
  } catch {
    return []
  }
}

/**
 * Resolve the dir the plugin link points at: a symlink's target, or the path
 * itself if a real directory was copied there. null if nothing is linked.
 */
function linkedPackage(link: string): string | null {
  try {
    const st = lstatSync(link)
    if (st.isSymbolicLink()) {
      return readlinkSync(link)
    }
    return st.isDirectory() ? link : null
  } catch {
    return null
  }
}

/**
 * The link-install checks: manifest, skill set, and hooks, each with its fix.
 *
 * `shipped` is the canonical skill list read from the package itself; an installed
 * count below it means a stale or partial link, and every fix is the same re-link.
 */
function buildChecks(link: string, pkg: string, shipped: ReadonlyArray<string>): Check[] {
  const installed = listSkills(join(pkg, 'skills'))
  return [
    { ok: true, label: `linked (${link} → ${pkg})` },
    existsSync(join(pkg, '.claude-plugin', 'plugin.json'))
      ? { ok: true, label: 'plugin manifest present (.claude-plugin/plugin.json)' }
      : { ok: false, label: 'plugin manifest missing — the link does not point at a plumbbob package', fix: 're-link: plumbbob init' },
    installed.length >= shipped.length && shipped.length > 0
      ? { ok: true, label: `skills present (${installed.length}) — load as /plumbbob:*` }
      : { ok: false, label: `skills incomplete (${installed.length}/${shipped.length})`, fix: 're-link: plumbbob init' },
    existsSync(join(pkg, 'hooks', 'hooks.json'))
      ? { ok: true, label: hooksLabel(wiredEvents(join(pkg, 'hooks', 'hooks.json'))) }
      : { ok: false, label: 'hook missing (hooks/hooks.json)', fix: 're-link: plumbbob init' },
  ]
}

/**
 * The hooks line's label: every event the package wires, so a link that
 * predates a hook reads as one at a glance. A file whose events cannot be read
 * still counts as present, the way the line read before it named any.
 */
function hooksLabel(events: ReadonlyArray<string>): string {
  const named = events.length === 0 ? '' : `: ${events.join(', ')}`
  return `hooks present (hooks/hooks.json${named}; auto-registers)`
}

/** The events a hooks.json wires, in file order, or none when it does not parse. */
function wiredEvents(path: string): ReadonlyArray<string> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { hooks?: unknown }
    return typeof parsed.hooks === 'object' && parsed.hooks !== null ? Object.keys(parsed.hooks) : []
  } catch {
    return []
  }
}

/**
 * The plugin-link diagnostic: how plumbbob is installed into Claude Code, as checks.
 *
 * Two install kinds are recognized: the marketplace plugin (one green line: skills
 * load and the CLI rides the plugin's bin/, nothing to verify piecemeal) and the
 * init-style link at ~/.claude/skills/plumbbob (verified piece by piece). Both at
 * once is a collision (two plugins named plumbbob fight over /plumbbob:*), reported
 * first, with the keep-one fix.
 */
function pluginChecks(): Check[] {
  const home = process.env.HOME ?? homedir()
  const link = join(home, '.claude', 'skills', 'plumbbob')
  const shipped = listSkills(packageDir('skills'))
  const pkg = linkedPackage(link)
  const market = marketplacePlumbbob(home)

  if (pkg === null) {
    return market.length > 0
      ? [{ ok: true, label: `installed via marketplace (${market.join(', ')}) — skills load as /plumbbob:*, the CLI is on PATH from the plugin bin/. No init needed.` }]
      : [{ ok: false, label: `not linked — no plugin at ${link}`, fix: 'install the marketplace plugin (/plugin install plumbbob@<marketplace>) or run: plumbbob init' }]
  }

  const checks = buildChecks(link, pkg, shipped)
  if (market.length > 0) {
    checks.unshift({
      ok: false,
      label: `collision — also installed via marketplace (${market.join(', ')}); two plugins named plumbbob fight over /plumbbob:* and skills can drop to flat names`,
      fix: 'keep one — `plumbbob init --uninstall` to use the marketplace plugin, or `/plugin uninstall` the marketplace one to keep this link',
    })
  }
  return checks
}

// --- sidecar migration (the legacy flat layout → tracked builds/) ---

// What the legacy flat sidecar holds: the pieces `--migrate` moves.
type Legacy = {
  readonly config: boolean // .plumbbob/config present (the legacy check-command store)
  readonly archive: ReadonlyArray<string> // archive/<slug> folder names
  readonly session: boolean // a flat active session (.plumbbob/intent.md at the root)
}

/**
 * Read a directory's immediate sub-directory names, sorted; [] when it is absent.
 */
function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Detect a legacy flat sidecar, or null when the repo is on the current layout
 * (or has no sidecar).
 *
 * `config` and `archive/` are unambiguous legacy markers: the builds/ layout has
 * neither. A flat `intent.md` alone would also match today's `--local` layout, so it
 * only counts as legacy when the repo is NOT already migrated (no `builds/`, no
 * `settings.json`): that guard is what keeps `--local` untouched.
 */
export function inspectLegacy(root: string): Legacy | null {
  const dir = sidecarDir(root)
  if (!existsSync(dir)) return null
  const config = existsSync(join(dir, 'config'))
  const archive = subdirs(join(dir, 'archive'))
  const migrated = existsSync(join(dir, 'builds')) || existsSync(settingsPath(root))
  const session = existsSync(join(dir, 'intent.md')) && !migrated
  if (!config && archive.length === 0 && !session) return null
  return { config, archive, session }
}

/**
 * The first `# Heading` in a flat intent.md: the build title the slug derives from.
 */
function titleFromIntent(path: string): string {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^#\s+(.+?)\s*$/)
      if (m) return m[1] ?? ''
    }
  } catch {
    /* fall through to the empty default */
  }
  return ''
}

/**
 * The `check=<cmd>` line from a legacy `.plumbbob/config`, or null when absent.
 */
function configCheck(path: string): string | null {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*check\s*=\s*(.+?)\s*$/)
      if (m && (m[1] ?? '').length > 0) return m[1] ?? null
    }
  } catch {
    /* fall through to null */
  }
  return null
}

/**
 * A slug not already claimed by `taken`, suffixing `-2`, `-3`, … only on collision.
 *
 * `start` refuses a colliding slug outright (the human picks a new title), but
 * migration is mechanically moving folders that already exist, so it disambiguates
 * rather than aborting mid-move.
 */
function uniqueSlug(base: string, taken: Set<string>): string {
  const slug = base.length > 0 ? base : 'migrated-build'
  if (!taken.has(slug)) return slug
  let n = 2
  while (taken.has(`${slug}-${n}`)) n += 1
  return `${slug}-${n}`
}

/**
 * Move whichever of `names` exist from `from/` into `to/`.
 */
function moveInto(from: string, to: string, names: ReadonlyArray<string>): void {
  mkdirSync(to, { recursive: true })
  for (const name of names) {
    const src = join(from, name)
    if (existsSync(src)) renameSync(src, join(to, name))
  }
}

/**
 * Replace the legacy blanket `.plumbbob/` exclude with the narrowed control-plane
 * patterns.
 *
 * The flat layout excluded the whole sidecar via the shared gitdir's info/exclude;
 * dropping that line and writing the per-worktree control patterns is what lets the
 * moved `builds/` and `settings.json` become trackable while the control files stay
 * excluded.
 */
function narrowExcludes(root: string): void {
  const exclude = gitPath(root, 'info/exclude')
  try {
    const kept = readFileSync(exclude, 'utf8')
      .split('\n')
      .filter((line) => {
        const t = line.trim()
        return t !== '.plumbbob/' && t !== '.plumbbob'
      })
    writeFileSync(exclude, kept.join('\n'))
  } catch {
    /* no exclude yet: excludeControl creates it */
  }
  excludeControl(root)
}

/**
 * Perform the migration and return a human-readable list of what moved.
 *
 * STAGES the result but never commits: the human owns that commit. In a repo
 * that gitignores the sidecar the stage is skipped (stagePath's record-only
 * guard) and the report says so: the files move but stay untracked. Call only
 * when `inspectLegacy` reported a legacy layout; doctor prints the returned
 * actions.
 */
export function migrateSidecar(root: string): string[] {
  const dir = sidecarDir(root)
  const actions: string[] = []
  const taken = new Set<string>(listBuilds(root))

  // config → settings.json (skipped when settings.json already exists).
  const configPath = join(dir, 'config')
  if (existsSync(configPath)) {
    if (!existsSync(settingsPath(root))) {
      // Carry forward ONLY what the legacy config actually held: a `check` line,
      // nothing else. No invented `auto` (the config never had one, it defaults to
      // false, and it belongs in settings.local.json): migration yields exactly what
      // a fresh `start` would, plus the check. An empty config → an empty `{}`.
      const check = configCheck(configPath)
      const settings = check === null ? {} : { check }
      writeFileSync(settingsPath(root), `${JSON.stringify(settings, null, 2)}\n`)
      actions.push(check === null ? 'config → settings.json' : `config → settings.json (check: ${check})`)
    }
    rmSync(configPath, { force: true })
  }

  // The flat active session → its own build folder, and the active-build cursor
  // (.plumbbob/STATE) points at it: it is the one in-flight build. Migrate it first
  // so it keeps the slug from its title.
  const flatIntent = join(dir, 'intent.md')
  if (existsSync(flatIntent)) {
    const slug = uniqueSlug(slugify(titleFromIntent(flatIntent)), taken)
    taken.add(slug)
    moveInto(dir, buildDir(root, slug), ['intent.md', 'build-log.md', 'checkpoints', 'STEP', 'SEAM', 'SPIKE'])
    setActiveBuild(root, slug)
    actions.push(`active session → builds/${slug} (the cursor)`)
  }

  // archive/<slug> → builds/<slug>. These are "done" by simply not being the cursor.
  const archiveDir = join(dir, 'archive')
  for (const name of subdirs(archiveDir)) {
    const slug = uniqueSlug(slugify(name) || name, taken)
    taken.add(slug)
    const target = buildDir(root, slug)
    mkdirSync(dirname(target), { recursive: true })
    renameSync(join(archiveDir, name), target)
    actions.push(`archive/${name} → builds/${slug}`)
  }
  rmSync(archiveDir, { recursive: true, force: true })

  narrowExcludes(root)
  const staged = stagePath(root, '.plumbbob')
  actions.push(
    staged
      ? 'staged the move (builds/ + settings.json) — commit it yourself'
      : 'moved but not staged (the sidecar is gitignored) — the files stay untracked',
  )
  return actions
}

/**
 * The sidecar section: legacy detection plus the migrate offer, or the migration
 * report under `--migrate`.
 *
 * Returns the lines to print and how many problems it found (an un-migrated legacy
 * layout counts as one, so the exit code flags it).
 */
function sidecarReport(cwd: string, migrate: boolean): { readonly lines: string[]; readonly failed: number } {
  const root = findRepoRoot(cwd)
  const legacy = root === null ? null : inspectLegacy(root)
  if (root === null || legacy === null) return { lines: [], failed: 0 }

  const lines = ['', 'plumbbob doctor — sidecar layout']
  if (migrate) {
    for (const action of migrateSidecar(root)) lines.push(`  ✓ ${action}`)
    lines.push('  migrated. Review with `git status`, then commit the staged move yourself.')
    return { lines, failed: 0 }
  }

  const parts: string[] = []
  if (legacy.session) parts.push('an active session')
  if (legacy.archive.length > 0) parts.push(`${legacy.archive.length} archived build(s)`)
  if (legacy.config) parts.push('a config file')
  lines.push(`  ✗ legacy flat sidecar detected at .plumbbob/ (${parts.join(', ')}) — the pre-builds/ layout`)
  lines.push('      → move it into the tracked builds/ layout: plumbbob doctor --migrate')
  lines.push('        (archive/ + the active session → builds/, config → settings.json; staged, never committed)')
  return { lines, failed: 1 }
}

// --- repo setup ---

/**
 * The repo-setup section: is this repo ready for a first build?
 *
 * Every gap is a ○ warning and adds nothing to the problem count, since the
 * person may have set the repo up by hand; the one remedy line names the verb
 * that adds what is missing. Skipped outside a repo, and over a legacy flat
 * sidecar, whose own section already names the move that comes first.
 */
function setupReport(cwd: string): { readonly lines: string[]; readonly failed: number } {
  const root = findRepoRoot(cwd)
  if (root === null || inspectLegacy(root) !== null) return { lines: [], failed: 0 }

  const lines = ['', 'plumbbob doctor — repo setup']
  const gaps: string[] = []
  if (!existsSync(sidecarDir(root))) {
    gaps.push('no .plumbbob/ folder yet')
  } else if (!existsSync(settingsPath(root))) {
    gaps.push('no .plumbbob/settings.json yet (absent reads as all defaults)')
  }
  const unignored = unignoredControl(root)
  if (unignored.length > 0) {
    const files = unignored.length === 1 ? 'control file' : 'control files'
    gaps.push(`${unignored.length} ${files} not ignored by git (${named(unignored)})`)
  }
  for (const gap of gaps) lines.push(`  ○ repo: ${gap}`)
  if (gaps.length > 0) {
    lines.push('      → plumbbob setup (or /plumbbob:setup) adds what is missing; a setup by hand works too')
  }

  if (!hasCommit(root)) {
    lines.push('  ○ repo: no commits yet', '      → make an initial commit, so plumbbob start can record a baseline')
  } else if (gaps.length === 0) {
    const whole = buildFolderIgnored(root, 'example') ? ' (.plumbbob/ is ignored whole, so build folders stay untracked)' : ''
    lines.push(`  ✓ repo: ready for a first build${whole}`)
  }
  return { lines, failed: 0 }
}

/**
 * A list short enough for one doctor line: every item when there are three or
 * fewer, else the first two and a count of the rest.
 */
function named(items: ReadonlyArray<string>): string {
  if (items.length <= 3) return items.join(', ')
  const rest = items.length - 2
  return `${items.slice(0, 2).join(', ')}, and ${rest} other${rest === 1 ? '' : 's'}`
}

// --- agent validation ---

/**
 * Interpreters recognized as the program of a manifest `command`: when the command
 * is `sh <script>` / `node <script>` / …, the checkable artifact is the script
 * argument (the interpreter reads it: the file need not carry +x), not the
 * interpreter, which we trust to be on PATH.
 */
const INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'dash', 'node', 'deno', 'bun', 'python', 'python3', 'ruby', 'perl'])

/**
 * Expand PLUMBBOB_AGENT_DIR in a command and split it into bare tokens
 * (surrounding quotes stripped).
 *
 * A deliberately shallow split: enough for the static command check below, not a
 * shell parser (which is neither possible nor wanted for a best-effort diagnostic).
 */
function commandTokens(command: string, agentDir: string): string[] {
  const expanded = command.replaceAll('${PLUMBBOB_AGENT_DIR}', agentDir).replaceAll('$PLUMBBOB_AGENT_DIR', agentDir)
  return expanded
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/^['"]/, '').replace(/['"]$/, ''))
}

/**
 * Statically check a manifest `command` for the silent footguns: a script file that
 * does not exist, or a directly invoked one missing its +x bit.
 *
 * The command is a shell string spawned via `sh -c` with the repo root as cwd, so a
 * relative path resolves against `root` and PLUMBBOB_AGENT_DIR points at the agent's
 * own dir. Best-effort by design: a path-shaped program or an interpreter's script
 * argument is checked; a bare command (a PATH binary, an inline `node -e` program)
 * is trusted, because we cannot prove a shell line broken without running it.
 * Returns the problem string, or null when nothing checkable is wrong.
 */
function checkCommand(command: string, agentDir: string, root: string): string | null {
  const tokens = commandTokens(command, agentDir)
  if (tokens.length === 0) return null
  const resolve = (p: string): string => (isAbsolute(p) ? p : join(root, p))
  const program = tokens[0] as string

  // A path-shaped program is invoked directly, so it must exist AND be executable.
  if (program.includes('/')) {
    const path = resolve(program)
    if (!existsSync(path)) return `command program ${program} does not exist`
    try {
      accessSync(path, constants.X_OK)
    } catch {
      return `command program ${program} is not executable — chmod +x it`
    }
    return null
  }

  // An interpreter reads its script argument, so the script need only exist.
  if (INTERPRETERS.has(program)) {
    const script = tokens.slice(1).find((t) => t.includes('/'))
    if (script !== undefined && !existsSync(resolve(script))) {
      return `command script ${script} does not exist`
    }
  }
  return null
}

/**
 * One agent's problem, or null when it validates.
 *
 * A malformed or unsupported-contract manifest surfaces as its resolution error; an
 * otherwise-valid agent is checked for a missing/non-executable command.
 */
function agentProblem(listing: AgentListing, root: string): string | null {
  if (!listing.resolution.ok) return listing.resolution.error
  const { manifest, dir } = listing.resolution.agent
  return checkCommand(manifest.command, dir, root)
}

/** A binding written as a path, the files that bind it, and the slots it is bound under. */
type BoundPath = { readonly binding: string; readonly where: string; readonly slots: ReadonlyArray<Slot> }

/**
 * Every binding written as a path in the active build's harness.json and in
 * the settings ladder's `agents` key, each once, sorted, with where it is
 * bound and under which slots.
 *
 * Names are left out: a name that resolves already has its row from the tier
 * walk, and one that does not is `status`'s warning. `error` is the harness's
 * own parse error when the file is there and broken, since a run refuses on
 * that before it reads a binding.
 */
function boundPaths(root: string): { readonly paths: ReadonlyArray<BoundPath>; readonly error: string | null } {
  const harness = readHarnessFile(join(buildFolder(root, activeBuild(root)), 'harness.json'))
  const inHarness: SlotBindings[] =
    harness === null || !harness.ok
      ? []
      : [harness.harness.defaults, ...[...harness.harness.steps.values()].map((step) => step.bindings)]
  const sources: ReadonlyArray<readonly [string, ReadonlyArray<SlotBindings>]> = [
    ['harness.json', inHarness],
    ['settings', [parseSlotBindings(resolveRecord(root, 'agents'))]],
  ]

  const found = new Map<string, { readonly wheres: string[]; readonly slots: Set<Slot> }>()
  for (const [where, levels] of sources) {
    for (const bindings of levels) {
      for (const slot of SLOTS) {
        for (const binding of bindings[slot] ?? []) {
          if (!isPathBinding(binding)) continue
          const entry = found.get(binding) ?? { wheres: [], slots: new Set<Slot>() }
          if (!entry.wheres.includes(where)) entry.wheres.push(where)
          entry.slots.add(slot)
          found.set(binding, entry)
        }
      }
    }
  }
  return {
    paths: [...found.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([binding, entry]) => ({
        binding,
        where: entry.wheres.join(' and '),
        // In lifecycle order, whatever order the files named them in.
        slots: SLOTS.filter((slot) => entry.slots.has(slot)),
      })),
    error: harness !== null && !harness.ok ? harness.error : null,
  }
}

/**
 * One path binding's row, and whether it counts as a problem.
 *
 * The binding is resolved by the rule a run uses, so the row says what the run
 * will do. One that resolves is named by its manifest, as a run labels it, and
 * has its `command` checked like any agent. One that does not is a failing row
 * where the run would refuse (a path inside the repo) and a warning where the
 * run would skip it (a path on one person's machine). One that resolves but is
 * bound under a slot its manifest does not declare is a warning as well: a run
 * of that slot warns and skips the binding, so the row is not counted.
 */
function pathRow(bound: BoundPath, resolution: BindingResolution, root: string): { readonly line: string; readonly failed: boolean } {
  if (!resolution.ok) {
    const fate = resolution.loud ? 'a run refuses it' : 'a run warns and skips it'
    return {
      line: `  ${resolution.loud ? '✗' : '○'} ${bound.binding} (path) — ${resolution.error.replace(/\.$/, '')}; bound in ${bound.where}, where ${fate}`,
      failed: resolution.loud,
    }
  }
  const { manifest, dir } = resolution.agent
  const head = `${manifest.name} (path ${bound.binding})`
  const problem = checkCommand(manifest.command, dir, root)
  if (problem !== null) return { line: `  ✗ ${head} — ${problem}`, failed: true }
  const declared = `[${manifest.slots.join(', ')}]`
  const undeclared = bound.slots.filter((slot) => !manifest.slots.includes(slot))
  if (undeclared.length === 0) return { line: `  ✓ ${head} ${declared}`, failed: false }
  const named = undeclared.map((slot) => `'${slot}'`).join(' and ')
  const noun = undeclared.length === 1 ? 'slot' : 'slots'
  return {
    line: `  ○ ${head} ${declared} — does not declare the ${named} ${noun}; bound in ${bound.where}, where a run warns and skips it`,
    failed: false,
  }
}

/**
 * The agent-validation section: walk every resolvable agent across the three
 * tiers (project `.plumbbob/agents/`, personal `~/.plumbbob/agents/`, and the
 * built-in ones plumbbob ships) and flag anything broken, then do the same for
 * every binding written as a path.
 *
 * Flags a malformed agent.json, an unsupported contract version (both arrive as the
 * listing's parse error), or a missing/non-executable command. A repo with no agents
 * and no path bindings shows no section (like the sidecar one), keeping doctor quiet
 * for the common case; outside a repo there is no project tier to anchor to, so the
 * section is skipped entirely. An empty tier adds no line of its own: a built-in
 * agent shows as a row with its origin when one ships, and not before. A harness.json
 * that does not parse is a failing row too, since no bound agent runs until it does.
 */
function agentReport(cwd: string, tiers: AgentTiers): { readonly lines: string[]; readonly failed: number } {
  const root = findRepoRoot(cwd)
  if (root === null) return { lines: [], failed: 0 }
  const listings = listAgents(root, tiers)
  const bound = boundPaths(root)
  if (listings.length === 0 && bound.paths.length === 0 && bound.error === null) return { lines: [], failed: 0 }

  const lines = ['', 'plumbbob doctor — agents — D48 (doctor-validates-agents)']
  let failed = 0
  for (const listing of listings) {
    const problem = agentProblem(listing, root)
    if (problem === null) {
      const slots = listing.resolution.ok ? ` [${listing.resolution.agent.manifest.slots.join(', ')}]` : ''
      lines.push(`  ✓ ${listing.name} (${listing.origin})${slots}`)
    } else {
      lines.push(`  ✗ ${listing.name} (${listing.origin}) — ${problem}`)
      failed += 1
    }
  }
  if (bound.error !== null) {
    lines.push(`  ✗ bindings — ${bound.error}`)
    failed += 1
  }
  for (const path of bound.paths) {
    const row = pathRow(path, resolveBinding(root, path.binding, tiers), root)
    lines.push(row.line)
    if (row.failed) failed += 1
  }
  return { lines, failed }
}

/**
 * The check-gate section: what gates `checkpoint`, and whether it can run.
 *
 * A configured `check` setting names the spawn override and asks nothing more;
 * otherwise checkride's own doctor reports the slot/adapter table. Only rows
 * checkride marks `required` count as problems; an empty slot ("no tool detected")
 * is informational, not a failure, because the runtime gate already refuses a
 * vacuous run.
 */
async function gateReport(cwd: string, env?: GateEnv): Promise<{ readonly lines: string[]; readonly failed: number }> {
  const root = findRepoRoot(cwd)
  if (root === null) return { lines: [], failed: 0 }

  const lines = ['', 'plumbbob doctor — check gate — D32 (checkride-gate)']
  const command = resolveString(root, 'check', '')
  if (command.length > 0) {
    lines.push(`  ✓ gate: '${command}' — the "check" setting overrides checkride`)
    return { lines, failed: 0 }
  }

  try {
    const silent = { write: () => true }
    // env is undefined in production → runDoctor falls back to its real toolchain
    // probe; tests inject a deterministic one (see GateEnv).
    const { report } = await runDoctor({ cwd: root, stdout: silent, env })
    let failed = 0
    for (const c of report.checks) {
      if (c.category === 'tool') {
        lines.push(toolRow(c))
      } else if (c.required && c.status !== 'ok') {
        lines.push(`  ✗ ${c.name}${c.hint === null ? '' : `\n      → ${c.hint}`}`)
      }
      if (c.required && c.status !== 'ok') failed += 1
    }
    // Called out where the human can see it coming: no CODE checks detected means
    // checkpoints would be gated only by checkride's always-on repo checks: either
    // a vacuous refusal or, worse, a green that tested nothing. Informational, with
    // the exact fix; `start` surfaces the same probe at plan time.
    if (!gateDetectsTools(report.checks)) {
      lines.push(
        '  ○ gate: no code checks detected — checkpoints would be gated by the always-on repo checks alone;' +
          ' set {"check": "npm test"} in .plumbbob/settings.json, or add tool configs checkride can see',
      )
    }
    return { lines, failed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { lines: [...lines, `  ✗ checkride doctor failed — ${message}`], failed: 1 }
  }
}

/**
 * One slot line: `✓ types ← tsc (6.0.3)`, `✗ dead ← fallow` with its install
 * hint, or `○ spell` joined by an em dash to "no tool detected" for an empty
 * (skipping) slot.
 */
function toolRow(c: DoctorCheck): string {
  if (c.adapter === null || c.adapter === undefined) {
    return `  ○ ${c.slot ?? c.name} — ${c.hint ?? 'no tool detected (slot skips)'}`
  }
  const mark = c.status === 'ok' ? '✓' : '✗'
  const version = c.found === null ? '' : ` (${c.found})`
  const hint = c.status !== 'ok' && c.hint !== null ? `\n      → ${c.hint}` : ''
  return `  ${mark} ${c.slot ?? c.name} ← ${c.adapter}${version}${hint}`
}

/**
 * The approval-latch health probe: is the turn ledger live?
 *
 * The latch is `checkpoint`'s refusal to land a step until the harness has recorded
 * a human turn since the step was entered. `.plumbbob/TURN` holds a count once the
 * UserPromptSubmit hook has ticked at least once, so a present count means the latch
 * is armed; its absence means the tick is guidance-only. Dormant is a legitimate
 * state (a host with no hooks simply has no ledger), never a failure, so this
 * section adds nothing to the problem count. The dormant hint names the hook because
 * a missing ledger almost always means it never wired, and that hook rides in either
 * install kind (the marketplace plugin's hooks/hooks.json or an init-style link).
 * Outside a repo there is no worktree ledger to read, so the section is skipped
 * entirely.
 */
function latchReport(cwd: string): { readonly lines: string[]; readonly failed: number } {
  const root = findRepoRoot(cwd)
  if (root === null) return { lines: [], failed: 0 }
  const turn = readTurn(root)
  const line =
    turn === null
      ? '  ○ latch: dormant — guidance only (no turn ledger yet; it ticks on your first prompt when the UserPromptSubmit hook is wired — re-run after one to confirm)'
      : `  ✓ latch: live (turn ${turn})`
  const lines = ['', 'plumbbob doctor — approval latch — D64 (approval-latch)', line]
  // The latch ignores a settings `auto`: a model can write that file, and a grant
  // the model can forge is no grant: self-approval comes only from the human's
  // typed `/build --auto`. Surface a set value so a human relying on it isn't
  // silently changed: informational, never a problem.
  if (resolveBoolean(root, 'auto', false)) {
    lines.push('  ○ auto: set in settings but not a grant since D67 (auto-not-a-grant) — self-approve per run with `/plumbbob:build --auto`')
  }
  return { lines, failed: 0 }
}

/**
 * The reach probe: is atis on PATH to split a step's diff at the pause?
 *
 * atis is optional. With it, the plan checkpoint stores what each step's seam
 * reaches and the pause reads the diff against seam and reach; without it the
 * pause reads the diff against the seam alone, as it always has. Either state
 * is fine, so this section never adds to the problem count. Outside a repo
 * there is no build to store a reach for, so the section is skipped.
 */
function reachReport(cwd: string): { readonly lines: string[]; readonly failed: number } {
  const root = findRepoRoot(cwd)
  if (root === null) return { lines: [], failed: 0 }
  const version = atisVersion(root)
  const line =
    version === null
      ? '  ○ atis: not on PATH (optional; without it the pause reads a step\'s diff against its seam alone)'
      : `  ✓ atis ${version}: the pause splits a step's diff into seam, reach, and out`
  return { lines: ['', 'plumbbob doctor — reach — D155 (reach-is-computed)', line], failed: 0 }
}

/**
 * The contract-paths probe: can every `contractPaths` entry match?
 *
 * The setting is read without validation, so an entry that can never match
 * stays in the list and reads `none touched` in every report's footprint: the
 * one silent failure the setting has. An entry the seam grammar refuses, and
 * one whose trailing slash disagrees with the tree (a folder written as a
 * file, or a file as a folder), is a `✗` row with its fix and a counted
 * problem. An entry that names nothing in the tree yet is a `○` row and no
 * problem, since a path still to be created reads the same as a typo. With
 * every entry sound, one `✓` line counts them. Silent when the setting lists
 * nothing, and outside a repo.
 */
function contractReport(cwd: string): { readonly lines: string[]; readonly failed: number } {
  const root = findRepoRoot(cwd)
  const contract = root === null ? [] : contractPaths(root)
  if (root === null || contract.length === 0) return { lines: [], failed: 0 }
  const issues = contractIssues(contract, {
    exists: (path) => existsSync(join(root, path)),
    isDirectory: (path) => {
      try {
        return statSync(join(root, path)).isDirectory()
      } catch {
        return false
      }
    },
  })
  const rows = issues.map((issue) =>
    issue.fix === null
      ? `  ○ contract: \`${issue.entry}\` ${issue.words}`
      : `  ✗ contract: \`${issue.entry}\` ${issue.words}\n      → ${issue.fix} in .plumbbob/settings.json`,
  )
  const sound = `  ✓ contract: ${contract.length} ${contract.length === 1 ? 'path' : 'paths'}`
  return {
    lines: ['', 'plumbbob doctor — contract paths — D164 (contract-paths)', ...(rows.length === 0 ? [sound] : rows)],
    failed: issues.filter((issue) => issue.fix !== null).length,
  }
}

/**
 * Run every doctor section, print the report, and return the exit code.
 *
 * Sections in order: plugin install, sidecar layout (migrating under `--migrate`),
 * repo setup, agents, check gate, approval latch, reach, contract paths. Exit 1 when any section reported a problem, so
 * scripts can gate on it; the closing lines cover the restart and the PATH story
 * either way. `env` injects a deterministic toolchain probe for tests (see GateEnv),
 * and `tiers` moves the agent tiers outside the repo for them.
 */
export async function doctor(
  cwd: string,
  args: ReadonlyArray<string> = [],
  env?: GateEnv,
  tiers: AgentTiers = {},
): Promise<number> {
  const checks = pluginChecks()
  const out: string[] = ['plumbbob doctor — plugin install']
  for (const c of checks) {
    out.push(c.ok ? `  ✓ ${c.label}` : `  ✗ ${c.label}\n      → ${c.fix}`)
  }

  const sidecar = sidecarReport(cwd, args.includes('--migrate'))
  out.push(...sidecar.lines)

  // Read after the sidecar section, so a `--migrate` that just moved a legacy
  // layout is judged as it now stands.
  const repo = setupReport(cwd)
  out.push(...repo.lines)

  const agents = agentReport(cwd, tiers)
  out.push(...agents.lines)

  const gate = await gateReport(cwd, env)
  out.push(...gate.lines)

  const latch = latchReport(cwd)
  out.push(...latch.lines)

  out.push(...reachReport(cwd).lines)

  const contract = contractReport(cwd)
  out.push(...contract.lines)

  const failed = checks.filter((c) => !c.ok).length + sidecar.failed + repo.failed + agents.failed + gate.failed + latch.failed + contract.failed
  out.push('')
  out.push(
    failed === 0
      ? 'plumbbob: all checks passed. If a skill still misbehaves, restart Claude Code (or /reload-plugins).'
      : `plumbbob: ${failed} problem(s) — apply the → fixes, then restart Claude Code.`,
  )
  out.push(
    'plumbbob: skills shell a bare `plumbbob`. The marketplace plugin puts it on PATH only inside a Claude Code session (via bin/) — there is no terminal `plumbbob`; for one (or the skills-dir install) run `npm i -g plumbbob`. In-session you can also run this as `/plumbbob:doctor`. Sessions are per-project via `plumbbob start`.',
  )

  process.stdout.write(`${out.join('\n')}\n`)
  return failed === 0 ? 0 : 1
}
