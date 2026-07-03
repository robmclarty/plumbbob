// `plumbbob doctor` — two diagnostics under one verb.
//
// 1. The global plugin link (read-only). After `plumbbob init`, plumbbob lives as a
//    symlink at ~/.claude/skills/plumbbob pointing at the installed package; Claude
//    Code loads it in place as a plugin (skills `/plumbbob:*`, the post-edit hook from
//    hooks.json). doctor verifies the link resolves to a package carrying the manifest,
//    the skills, and the hook — and names the fix for anything missing. The failure
//    class it exists for is SILENT (a `/plumbbob:pb-status` that opens an empty dashboard
//    because the plugin never linked).
//
// 2. The repo sidecar layout. A repo scaffolded by a pre-restructure plumbbob carries a
//    legacy FLAT sidecar (`.plumbbob/intent.md`, `config`, `archive/`) fully git-excluded.
//    doctor detects it and, with `--migrate`, moves it into the tracked `builds/<slug>/`
//    layout (D2): archive entries and the active session become build folders, `config`
//    becomes `settings.json`, and the whole move is STAGED but never committed — the human
//    owns that commit (Q8). The move is the one that turns a build's record from local-only
//    (dies with `git worktree remove`) into a tracked folder that rides the branch into
//    the PR (supersedes D20).
//
// 3. The check gate (D32). When a `check` setting overrides checkride, doctor names the
//    command; otherwise it runs checkride's own doctor and prints the slot/adapter table —
//    "detected but tool missing" is the footgun this exists for.
//
// Functional, node builtins plus checkride (C1/C2).

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDoctor } from 'checkride'
import type { DoctorCheck } from 'checkride'
import { marketplacePlumbbob } from '../lib/plugins.ts'
import { findRepoRoot, gitPath, stagePath } from '../lib/git.ts'
import { buildDir, excludeControl, listBuilds, sidecarDir, slugify } from '../lib/sidecar.ts'
import { resolveString, settingsPath, setLocalSetting } from '../lib/settings.ts'

type Check = { readonly ok: boolean; readonly label: string; readonly fix?: string }

// The plumbbob package's own skills/ dir (the canonical set), off this module's
// URL so it resolves the same from src/ (dev) and dist/ (published).
function packageDir(name: string): string {
  return fileURLToPath(new URL(`../../${name}/`, import.meta.url))
}

// Skill directories (those carrying a SKILL.md) under `dir`.
function listSkills(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md')))
  } catch {
    return []
  }
}

// Resolve the dir the plugin link points at: a symlink's target, or the path
// itself if a real directory was copied there. null if nothing is linked.
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
      ? { ok: true, label: 'post-edit hook present (hooks/hooks.json, auto-registers)' }
      : { ok: false, label: 'hook missing (hooks/hooks.json)', fix: 're-link: plumbbob init' },
  ]
}

// The plugin-link diagnostic: the checks to print plus how many failed.
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

// --- sidecar migration (the pre-restructure flat layout → tracked builds/) ---

type Legacy = {
  readonly config: boolean // .plumbbob/config present (the pre-settings.json check store)
  readonly archive: ReadonlyArray<string> // archive/<slug> folder names
  readonly session: boolean // a flat active session (.plumbbob/intent.md at the root)
}

// Read a directory's immediate sub-directory names, sorted; [] when it is absent.
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

// Detect a legacy flat sidecar, or null when the repo is already on the new layout
// (or has no sidecar). `config` and `archive/` are unambiguous pre-restructure markers
// — the new layout has neither. A flat `intent.md` alone would also match today's
// `--local` layout, so it only counts as legacy when the repo is NOT already migrated
// (no `builds/`, no `settings.json`): that guard is what keeps `--local` untouched.
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

// The first `# Heading` in a flat intent.md — the build title the slug derives from.
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

// The `check=<cmd>` line from a legacy `.plumbbob/config`, or null when absent.
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

// A slug not already claimed by `taken`, suffixing `-2`, `-3`, … only on collision.
// `start` refuses on collision (D17), but migration is mechanically moving folders that
// already exist, so it disambiguates rather than aborting mid-move.
function uniqueSlug(base: string, taken: Set<string>): string {
  const slug = base.length > 0 ? base : 'migrated-build'
  if (!taken.has(slug)) return slug
  let n = 2
  while (taken.has(`${slug}-${n}`)) n += 1
  return `${slug}-${n}`
}

// Move whichever of `names` exist from `from/` into `to/`.
function moveInto(from: string, to: string, names: ReadonlyArray<string>): void {
  mkdirSync(to, { recursive: true })
  for (const name of names) {
    const src = join(from, name)
    if (existsSync(src)) renameSync(src, join(to, name))
  }
}

// Drop the blanket `.plumbbob/` line the legacy layout wrote to info/exclude, then add
// the narrowed control-plane patterns (D2) — so the moved `builds/` and `settings.json`
// become trackable while the per-worktree control files stay excluded.
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
    /* no exclude yet — excludeControl creates it */
  }
  excludeControl(root)
}

// Perform the migration and return a human-readable list of what moved. STAGES the
// result but never commits (Q8). Returns the actions so doctor can print them; call
// only when `inspectLegacy` reported a legacy layout.
export function migrateSidecar(root: string): string[] {
  const dir = sidecarDir(root)
  const actions: string[] = []
  const taken = new Set<string>(listBuilds(root))

  // config → settings.json (only when the new file is not already present).
  const configPath = join(dir, 'config')
  if (existsSync(configPath)) {
    if (!existsSync(settingsPath(root))) {
      const check = configCheck(configPath)
      const settings = check === null ? { auto: false } : { check, auto: false }
      writeFileSync(settingsPath(root), `${JSON.stringify(settings, null, 2)}\n`)
      actions.push(check === null ? 'config → settings.json' : `config → settings.json (check: ${check})`)
    }
    rmSync(configPath, { force: true })
  }

  // The flat active session → its own build folder, and the cursor points at it: it is
  // the one in-flight build (D3). Migrate it first so it keeps the slug from its title.
  const flatIntent = join(dir, 'intent.md')
  if (existsSync(flatIntent)) {
    const slug = uniqueSlug(slugify(titleFromIntent(flatIntent)), taken)
    taken.add(slug)
    moveInto(dir, buildDir(root, slug), ['intent.md', 'build-log.md', 'checkpoints', 'STEP', 'SEAM', 'SPIKE'])
    setLocalSetting(root, 'activeBuild', slug)
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
  stagePath(root, '.plumbbob')
  actions.push('staged the move (builds/ + settings.json) — commit it yourself')
  return actions
}

// The sidecar section: legacy detection + the offer, or the migration report under
// `--migrate`. Returns the lines to print and how many problems it found (an
// un-migrated legacy layout counts as one, so the exit code flags it).
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

// The check-gate section (D32): a configured `check` setting names the spawn
// override and asks nothing more; otherwise checkride's own doctor reports the
// slot/adapter table. Only rows checkride marks `required` count as problems —
// an empty slot ("no tool detected") is informational, not a failure, because
// the runtime gate already refuses a vacuous run.
async function gateReport(cwd: string): Promise<{ readonly lines: string[]; readonly failed: number }> {
  const root = findRepoRoot(cwd)
  if (root === null) return { lines: [], failed: 0 }

  const lines = ['', 'plumbbob doctor — check gate (D32)']
  const command = resolveString(root, 'check', '')
  if (command.length > 0) {
    lines.push(`  ✓ gate: '${command}' — the "check" setting overrides checkride`)
    return { lines, failed: 0 }
  }

  try {
    const silent = { write: () => true }
    const { report } = await runDoctor({ cwd: root, stdout: silent })
    let failed = 0
    for (const c of report.checks) {
      if (c.category === 'tool') {
        lines.push(toolRow(c))
      } else if (c.required && c.status !== 'ok') {
        lines.push(`  ✗ ${c.name}${c.hint === null ? '' : `\n      → ${c.hint}`}`)
      }
      if (c.required && c.status !== 'ok') failed += 1
    }
    return { lines, failed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { lines: [...lines, `  ✗ checkride doctor failed — ${message}`], failed: 1 }
  }
}

// One slot line: `✓ types ← tsc (6.0.3)`, `✗ dead ← fallow` with its install
// hint, or `○ spell — no tool detected` for an empty (skipping) slot.
function toolRow(c: DoctorCheck): string {
  if (c.adapter === null || c.adapter === undefined) {
    return `  ○ ${c.slot ?? c.name} — ${c.hint ?? 'no tool detected (slot skips)'}`
  }
  const mark = c.status === 'ok' ? '✓' : '✗'
  const version = c.found === null ? '' : ` (${c.found})`
  const hint = c.status !== 'ok' && c.hint !== null ? `\n      → ${c.hint}` : ''
  return `  ${mark} ${c.slot ?? c.name} ← ${c.adapter}${version}${hint}`
}

export async function doctor(cwd: string, args: ReadonlyArray<string> = []): Promise<number> {
  const checks = pluginChecks()
  const out: string[] = ['plumbbob doctor — plugin install']
  for (const c of checks) {
    out.push(c.ok ? `  ✓ ${c.label}` : `  ✗ ${c.label}\n      → ${c.fix}`)
  }

  const sidecar = sidecarReport(cwd, args.includes('--migrate'))
  out.push(...sidecar.lines)

  const gate = await gateReport(cwd)
  out.push(...gate.lines)

  const failed = checks.filter((c) => !c.ok).length + sidecar.failed + gate.failed
  out.push('')
  out.push(
    failed === 0
      ? 'plumbbob: all checks passed. If a skill still misbehaves, restart Claude Code (or /reload-plugins).'
      : `plumbbob: ${failed} problem(s) — apply the → fixes, then restart Claude Code.`,
  )
  out.push(
    'plumbbob: skills shell a bare `plumbbob`. The marketplace plugin puts it on PATH only inside a Claude Code session (via bin/) — there is no terminal `plumbbob`; for one (or the skills-dir install) run `npm i -g plumbbob`. In-session you can also run this as `/plumbbob:pb-doctor`. Sessions are per-project via `plumbbob start`.',
  )

  process.stdout.write(`${out.join('\n')}\n`)
  return failed === 0 ? 0 : 1
}
