// Claude Code settings.json hook registration (D27). A pure-TS JSON merge (zero
// runtime deps, node builtins only — C2): strip our entries, then re-add them, so
// a re-run is byte-identical. The same logic serves all three D27 scopes — only
// the settings file path and the command-path representation differ, both chosen
// by the `setup` verb. Functional/procedural, no classes (C1).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// A registration entry is "ours" iff one of its hook commands points into our
// installed hooks dir. This marker matches BOTH the absolute (global) and the
// `~`-prefixed (repo-scoped) command forms, so uninstall finds either.
const OURS_MARKER = '.claude/plumbline/hooks/'

// The PreToolUse edit matcher covers all four editing tools (D5).
const EDIT_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit'

type HookCommand = { readonly type: string; readonly command: string }
type HookEntry = { readonly matcher?: string; readonly hooks?: ReadonlyArray<HookCommand> }
type HookMap = { readonly [event: string]: ReadonlyArray<HookEntry> | undefined }
interface Settings {
  hooks?: HookMap
  [key: string]: unknown
}

// The three hook registration entries, pointing at `hooksDir` (absolute for the
// global scope; `~`-prefixed for the repo-scoped files so committed settings
// carry no machine-absolute home dir — a leading `~/` is shell-expanded when the
// hook command runs). Mirrors the PreToolUse/PostToolUse shape dev-install wrote.
function registrationEntries(hooksDir: string): { readonly PreToolUse: HookEntry[]; readonly PostToolUse: HookEntry[] } {
  const dir = hooksDir.endsWith('/') ? hooksDir.slice(0, -1) : hooksDir
  const entry = (matcher: string, file: string): HookEntry => ({
    matcher,
    hooks: [{ type: 'command', command: `${dir}/${file}` }],
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
export function mergeRegistration(settings: Settings, hooksDir: string): Settings {
  const entries = registrationEntries(hooksDir)
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
