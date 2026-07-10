// Plugin-dir resolution for the two sweeps (intent D4). `latched` is this repo
// itself — it carries `.claude-plugin/`, `skills/`, `hooks/`, `bin/`, and the
// built `dist/` the bin shim resolves. `baseline` is a temp copy of exactly
// those five entries with the UserPromptSubmit (turn ledger) and PreToolUse
// (commit ask-hook) entries stripped from hooks.json: TURN never ticks, so the
// latch is dormant by design and the sweep measures prose alone. PostToolUse
// stays — work-plane guidance is not the latch. The copy is built once per
// process and reused across runs.

import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Sweep = 'baseline' | 'latched'

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

// package.json rides along because the CLI reads its version from
// `../package.json` relative to dist; node_modules is symlinked (not copied)
// because dist imports checkride at module load — without it the copy's CLI
// cannot even print a version.
const PLUGIN_ENTRIES = ['.claude-plugin', 'skills', 'hooks', 'bin', 'dist', 'package.json'] as const

// The hook events the baseline strips. Everything else in hooks.json survives.
const LATCH_HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse'] as const

let baselineDir: string | null = null

export function resolvePluginDir(sweep: Sweep): string {
  if (!existsSync(join(REPO_ROOT, 'dist', 'cli.js'))) {
    throw new Error('dist/cli.js is missing — run `pnpm build` before an eval sweep (the plugin bin shim needs it).')
  }
  if (sweep === 'latched') return REPO_ROOT
  if (baselineDir === null) baselineDir = buildBaselineCopy()
  return baselineDir
}

function buildBaselineCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plumbbob-baseline-plugin-'))
  for (const entry of PLUGIN_ENTRIES) {
    cpSync(join(REPO_ROOT, entry), join(dir, entry), { recursive: true })
  }
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
  const hooksPath = join(dir, 'hooks', 'hooks.json')
  writeFileSync(hooksPath, `${JSON.stringify(stripLatchHooks(readHooks(hooksPath)), null, 2)}\n`)
  return dir
}

type HooksFile = { readonly hooks: Record<string, unknown> }

function readHooks(path: string): HooksFile {
  return JSON.parse(readFileSync(path, 'utf8')) as HooksFile
}

// Exported so the model-free helper test can prove the strip does exactly what
// the sweep claims: latch events gone, everything else byte-for-byte intact.
export function stripLatchHooks(file: HooksFile): HooksFile {
  const kept: Record<string, unknown> = {}
  for (const [event, value] of Object.entries(file.hooks)) {
    if (!(LATCH_HOOK_EVENTS as ReadonlyArray<string>).includes(event)) kept[event] = value
  }
  return { hooks: kept }
}
