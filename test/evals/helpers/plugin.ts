// Plugin-dir resolution for the sweeps (intent D4). `latched` is this repo
// itself — it carries `.claude-plugin/`, `skills/`, `hooks/`, `bin/`, and the
// built `dist/` the bin shim resolves. `baseline` is a temp copy of exactly
// those five entries with the UserPromptSubmit (turn ledger) and PreToolUse
// (commit ask-hook) entries stripped from hooks.json: TURN never ticks, so the
// latch is dormant by design and the sweep measures prose alone. PostToolUse
// stays — work-plane guidance is not the latch. `no-relay` is the same copy
// with only the Stop entry stripped: the latch and its ledger run as shipped,
// and nothing checks the relay, so beside `latched` at one commit it isolates
// the relay check (D89 (block-once)) without the product growing a switch. Each
// copy is built once per process and reused across runs.

import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Sweep = 'baseline' | 'no-relay' | 'latched'

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

// package.json rides along because the CLI reads its version from
// `../package.json` relative to dist; node_modules is symlinked (not copied)
// because dist imports checkride at module load — without it the copy's CLI
// cannot even print a version. templates/ rides along because `start` scaffolds
// from it: a session opened inside a baseline sweep would otherwise crash on a
// missing template.
const PLUGIN_ENTRIES = ['.claude-plugin', 'skills', 'hooks', 'bin', 'dist', 'package.json', 'templates'] as const

// The hook events each copy strips. Everything else in hooks.json survives.
const LATCH_HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse'] as const
const RELAY_HOOK_EVENTS = ['Stop'] as const

const copies = new Map<Sweep, string>()

export function resolvePluginDir(sweep: Sweep): string {
  if (!existsSync(join(REPO_ROOT, 'dist', 'cli.js'))) {
    throw new Error('dist/cli.js is missing — run `pnpm build` before an eval sweep (the plugin bin shim needs it).')
  }
  if (sweep === 'latched') return REPO_ROOT
  const cached = copies.get(sweep)
  if (cached !== undefined) return cached
  const dir = buildCopy(sweep, sweep === 'baseline' ? stripLatchHooks : stripRelayHook)
  copies.set(sweep, dir)
  return dir
}

function buildCopy(sweep: Sweep, strip: (file: HooksFile) => HooksFile): string {
  const dir = mkdtempSync(join(tmpdir(), `plumbbob-${sweep}-plugin-`))
  for (const entry of PLUGIN_ENTRIES) {
    cpSync(join(REPO_ROOT, entry), join(dir, entry), { recursive: true })
  }
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
  const hooksPath = join(dir, 'hooks', 'hooks.json')
  writeFileSync(hooksPath, `${JSON.stringify(strip(readHooks(hooksPath)), null, 2)}\n`)
  return dir
}

type HooksFile = { readonly hooks: Record<string, unknown> }

function readHooks(path: string): HooksFile {
  return JSON.parse(readFileSync(path, 'utf8')) as HooksFile
}

// Exported so the model-free helper test can prove the strip does exactly what
// the sweep claims: latch events gone, everything else byte-for-byte intact.
export function stripLatchHooks(file: HooksFile): HooksFile {
  return stripEvents(file, LATCH_HOOK_EVENTS)
}

// The `no-relay` arm's strip: the Stop entry gone, the latch and every other
// hook intact. Exported for the same proof.
export function stripRelayHook(file: HooksFile): HooksFile {
  return stripEvents(file, RELAY_HOOK_EVENTS)
}

function stripEvents(file: HooksFile, events: ReadonlyArray<string>): HooksFile {
  const kept: Record<string, unknown> = {}
  for (const [event, value] of Object.entries(file.hooks)) {
    if (!events.includes(event)) kept[event] = value
  }
  return { hooks: kept }
}
