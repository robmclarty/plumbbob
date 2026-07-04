// The settings ladder (D27): a resolved setting comes from, in priority order,
//   1. a CLI flag           — passed in by the verb (undefined when absent)
//   2. settings.local.json  — untracked personal overlay + per-worktree cursor
//   3. settings.json        — tracked project defaults
//   4. a built-in default   — supplied by the caller
// The first defined rung wins. Both files are optional JSON; a missing or
// malformed file contributes nothing rather than throwing, so a broken personal
// overlay can never wedge the tool. Functional/procedural, node builtins (C1/C2).
//
// Known keys: `check` (string — the heavy gate, tracked in settings.json) and
// `auto` (boolean — whether the agent approves in the human's place; a personal
// preference, so it belongs in settings.local.json). `activeBuild` (the
// per-worktree cursor) also lives in settings.local.json but is resolved by
// sidecar.ts, not here.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DIRNAME = '.plumbbob'

export function settingsPath(root: string): string {
  return join(root, DIRNAME, 'settings.json')
}

export function localSettingsPath(root: string): string {
  return join(root, DIRNAME, 'settings.local.json')
}

type Settings = Record<string, unknown>

function readSettings(path: string): Settings {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Settings) : {}
  } catch {
    return {}
  }
}

// The raw ladder: flag → local overlay → project defaults → undefined. The typed
// helpers below apply the built-in default and reject wrong-typed rungs.
function resolveSetting(root: string, key: string, flag: unknown): unknown {
  if (flag !== undefined) return flag
  const local = readSettings(localSettingsPath(root))[key]
  if (local !== undefined) return local
  return readSettings(settingsPath(root))[key]
}

// Resolve a string setting (e.g. `check`). A missing rung, or one holding a
// non-string / blank value, yields the caller's fallback rather than gating on
// garbage.
export function resolveString(root: string, key: string, fallback: string, flag?: string): string {
  const value = resolveSetting(root, key, flag)
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

// Resolve a boolean setting (e.g. `auto`). A missing or non-boolean rung yields
// the caller's fallback.
export function resolveBoolean(root: string, key: string, fallback: boolean, flag?: boolean): boolean {
  const value = resolveSetting(root, key, flag)
  return typeof value === 'boolean' ? value : fallback
}

// Resolve a non-negative integer setting (e.g. `agentTimeout`, D51). A missing
// rung, or one holding a non-finite / negative / non-integer number, yields the
// caller's fallback rather than a garbage timeout — 0 means "no timeout", so a
// broken value must never silently become one.
export function resolveNumber(root: string, key: string, fallback: number, flag?: number): number {
  const value = resolveSetting(root, key, flag)
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

// Resolve an object-valued setting (e.g. the `agents` slot-binding defaults, D57)
// across the same ladder. The first defined, object-typed rung wins; a missing
// rung, or one holding a non-object / array / scalar, yields {} rather than
// garbage — mirrors the string/boolean/number resolvers above. No flag rung: the
// caller (`agent run`) merges these under the per-build harness, not over a flag.
export function resolveRecord(root: string, key: string): Record<string, unknown> {
  const value = resolveSetting(root, key, undefined)
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// Read one key from the untracked local overlay ONLY — no project or built-in
// fallback. The `activeBuild` cursor lives here and must never resolve from the
// tracked settings.json (it is per-worktree state, not a shared default).
export function localSetting(root: string, key: string): unknown {
  return readSettings(localSettingsPath(root))[key]
}

// Merge one key into settings.local.json, preserving the other keys and creating
// the file when absent. Pretty-printed so the overlay stays hand-editable. A
// malformed existing file contributes nothing (readSettings yields {}) and is
// overwritten with a clean object rather than throwing.
export function setLocalSetting(root: string, key: string, value: unknown): void {
  const path = localSettingsPath(root)
  mkdirSync(dirname(path), { recursive: true })
  const merged = { ...readSettings(path), [key]: value }
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`)
}
