// Claude Code settings.json hook registration (D27). A pure-TS JSON merge (zero
// runtime deps, node builtins only — C2): strip our entries, then re-add them, so
// a re-run is byte-identical. The same logic serves all three D27 scopes — only
// the settings file path and the command-path representation differ, both chosen
// by the `setup` verb. Functional/procedural, no classes (C1).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// A registration entry is "ours" iff one of its hook commands points into our
// hooks dir. This marker matches every command form we emit: the global
// `~/.claude/plumbbob/hooks/...` copy and the self-contained
// `$CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks/...` reference both contain
// `plumbbob/hooks/`, so uninstall finds either.
const OURS_MARKER = 'plumbbob/hooks/'

// The PreToolUse edit matcher covers all four editing tools (D5).
const EDIT_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit'

type HookCommand = { readonly type: string; readonly command: string }
type HookEntry = { readonly matcher?: string; readonly hooks?: ReadonlyArray<HookCommand> }
type HookMap = { readonly [event: string]: ReadonlyArray<HookEntry> | undefined }
interface Settings {
  hooks?: HookMap
  [key: string]: unknown
}

// The three hook registration entries, pointing at `hooksDir`. Two command forms:
//   global       — a direct absolute path to the +x copy under ~/.claude.
//   self (viaSh) — `sh "<dir>/<file>"` against the package's hooks/ under
//                  node_modules, addressed through `$CLAUDE_PROJECT_DIR` so the
//                  committed/portable form carries no machine-absolute path and
//                  needs no execute bit (pnpm's store may not preserve one).
// Mirrors the PreToolUse/PostToolUse shape dev-install wrote.
function registrationEntries(
  hooksDir: string,
  viaSh: boolean,
): { readonly PreToolUse: HookEntry[]; readonly PostToolUse: HookEntry[] } {
  const dir = hooksDir.endsWith('/') ? hooksDir.slice(0, -1) : hooksDir
  const command = (file: string): string => (viaSh ? `sh "${dir}/${file}"` : `${dir}/${file}`)
  const entry = (matcher: string, file: string): HookEntry => ({
    matcher,
    hooks: [{ type: 'command', command: command(file) }],
  })
  return {
    PreToolUse: [entry(EDIT_MATCHER, 'pre-edit.sh'), entry('Bash', 'bash-guard.sh')],
    PostToolUse: [entry(EDIT_MATCHER, 'post-edit.sh')],
  }
}

function isOurs(entry: HookEntry): boolean {
  return (entry.hooks ?? []).some((h) => h.command.includes(OURS_MARKER))
}

function stripOurs(list: ReadonlyArray<HookEntry> | undefined): HookEntry[] {
  return (list ?? []).filter((e) => !isOurs(e))
}

// Merge our registration into a parsed settings object (strip-then-add). Returns
// a new object; every unrelated key and unrelated hook is preserved, and key
// order is stable across runs so a second merge is byte-identical.
export function mergeRegistration(settings: Settings, hooksDir: string, viaSh = false): Settings {
  const entries = registrationEntries(hooksDir, viaSh)
  const existing: HookMap = settings.hooks ?? {}
  const hooks: { [event: string]: ReadonlyArray<HookEntry> | undefined } = { ...existing }
  hooks.PreToolUse = [...stripOurs(existing.PreToolUse), ...entries.PreToolUse]
  hooks.PostToolUse = [...stripOurs(existing.PostToolUse), ...entries.PostToolUse]
  return { ...settings, hooks }
}

// Remove only our entries from the two events we manage, leaving everything else
// untouched (uninstall, and the idempotent strip half of a re-install).
export function stripRegistration(settings: Settings): Settings {
  const existing = settings.hooks
  if (existing === undefined) {
    return settings
  }
  const hooks: { [event: string]: ReadonlyArray<HookEntry> | undefined } = { ...existing }
  if (existing.PreToolUse !== undefined) {
    hooks.PreToolUse = stripOurs(existing.PreToolUse)
  }
  if (existing.PostToolUse !== undefined) {
    hooks.PostToolUse = stripOurs(existing.PostToolUse)
  }
  return { ...settings, hooks }
}

export function readSettings(path: string): Settings {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Settings
  } catch {
    return {}
  }
}

export function writeSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`)
}
