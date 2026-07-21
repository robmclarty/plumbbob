// The settings ladder: a resolved setting comes from, in priority order,
//   1. a CLI flag           — passed in by the verb (undefined when absent)
//   2. settings.local.json  — untracked personal overlay, per-worktree
//   3. settings.json        — tracked project defaults
//   4. a built-in default   — supplied by the caller
// The first defined rung wins. Both files are optional JSON; a missing or
// malformed file contributes nothing rather than throwing, so a broken personal
// overlay can never wedge the tool. Functional and procedural, node builtins only.
//
// Known keys: `check` (string — the command for the heavy verify gate, a project
// default in settings.json) and `auto` (boolean — a personal preference, so it
// belongs in settings.local.json). `auto` is NOT a checkpoint grant: the approval
// latch never reads it to allow a land — a model can write this file, and a grant
// it can forge is no grant — only to name it at the pause when set; self-approval
// comes solely from the human's literal `/pb-build --auto` or a typed step range.
// The per-worktree active-build cursor is NOT here — it lives in the STATE file
// (see sidecar.ts), which keeps this overlay a human-authored file rather than
// tool-managed state.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DIRNAME = '.plumbbob' // the sidecar folder name at the repo root

/**
 * The tracked project-defaults file: `.plumbbob/settings.json`.
 */
export function settingsPath(root: string): string {
  return join(root, DIRNAME, 'settings.json')
}

/**
 * The untracked personal overlay: `.plumbbob/settings.local.json`.
 */
export function localSettingsPath(root: string): string {
  return join(root, DIRNAME, 'settings.local.json')
}

type Settings = Record<string, unknown>

/**
 * Read one settings file as a plain object.
 *
 * A missing, malformed, or non-object file yields {} — an empty rung that
 * contributes nothing rather than wedging the tool.
 */
function readSettings(path: string): Settings {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Settings) : {}
  } catch {
    return {}
  }
}

/**
 * The raw ladder: flag → local overlay → project defaults → undefined.
 *
 * The typed helpers below apply the built-in default and reject wrong-typed
 * rungs.
 */
function resolveSetting(root: string, key: string, flag: unknown): unknown {
  if (flag !== undefined) return flag
  const local = readSettings(localSettingsPath(root))[key]
  if (local !== undefined) return local
  return readSettings(settingsPath(root))[key]
}

/**
 * Resolve a string setting (e.g. `check`).
 *
 * A missing rung, or one holding a non-string / blank value, yields the
 * caller's fallback rather than gating on garbage.
 */
export function resolveString(root: string, key: string, fallback: string, flag?: string): string {
  const value = resolveSetting(root, key, flag)
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

/**
 * Resolve a boolean setting (e.g. `auto`). A missing or non-boolean rung
 * yields the caller's fallback.
 */
export function resolveBoolean(root: string, key: string, fallback: boolean, flag?: boolean): boolean {
  const value = resolveSetting(root, key, flag)
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Resolve a non-negative integer setting (e.g. `agentTimeout`).
 *
 * A missing rung, or one holding a non-finite / negative / non-integer number,
 * yields the caller's fallback rather than a garbage timeout — 0 means "no
 * timeout", so a broken value must never silently become one.
 */
export function resolveNumber(root: string, key: string, fallback: number, flag?: number): number {
  const value = resolveSetting(root, key, flag)
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

/**
 * Resolve an object-valued setting (e.g. the `agents` slot-binding defaults)
 * across the same ladder.
 *
 * The first defined, object-typed rung wins; a missing rung, or one holding a
 * non-object / array / scalar, yields {} rather than garbage — mirrors the
 * string/boolean/number resolvers above. No flag rung: the caller (`agent
 * run`) merges these under the per-build harness bindings, not over a flag.
 */
export function resolveRecord(root: string, key: string): Record<string, unknown> {
  const value = resolveSetting(root, key, undefined)
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * Merge one key into settings.local.json, preserving the other keys and
 * creating the file when absent.
 *
 * Pretty-printed so the overlay stays hand-editable. A malformed existing file
 * contributes nothing (readSettings yields {}) and is overwritten with a clean
 * object rather than throwing.
 */
export function setLocalSetting(root: string, key: string, value: unknown): void {
  const path = localSettingsPath(root)
  mkdirSync(dirname(path), { recursive: true })
  const merged = { ...readSettings(path), [key]: value }
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`)
}
