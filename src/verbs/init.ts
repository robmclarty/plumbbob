// `plumbbob init [--uninstall]` — link plumbbob into Claude Code as an in-place
// skills-directory plugin. This is the whole install: it symlinks the installed
// package into ~/.claude/skills/plumbbob, where Claude Code discovers it as
// `plumbbob@skills-dir` — the skills load namespaced (`/plumbbob:*`) and the
// post-edit hook auto-registers from hooks/hooks.json. Global-only by design:
// plumbbob is a personal tool (like firecrawl/gh), and install scope is NOT
// session scope — sessions stay per-project via `plumbbob start`. Idempotent +
// reversible (`--uninstall` drops the link); it NEVER writes settings.json.
// Functional, node builtins only (C1/C2).

import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The installed package root (parent of .claude-plugin/, skills/, hooks/, dist/),
// off this module's URL — the global install when run as the published bin, the
// checkout in dev. No trailing slash, so it compares clean against a readlink.
function packageRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url)).replace(/\/+$/, '')
}

function linkPath(home: string): string {
  return join(home, '.claude', 'skills', 'plumbbob')
}

// lstat-based existence: true even for a broken symlink (existsSync follows the
// link and would miss one whose target moved).
function present(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

// The symlink's target (no trailing slash), or null if `path` is not a symlink.
function symlinkTarget(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path).replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

export function init(args: ReadonlyArray<string>): number {
  const home = process.env.HOME ?? homedir()
  const link = linkPath(home)
  const target = packageRoot()

  if (args.includes('--uninstall')) {
    return uninstall(link)
  }

  mkdirSync(join(home, '.claude', 'skills'), { recursive: true })

  if (present(link)) {
    const current = symlinkTarget(link)
    if (current === null) {
      process.stderr.write(
        `plumbbob: ${link} already exists and is not a plumbbob link. Move or remove it, then re-run \`plumbbob init\`.\n`,
      )
      return 1
    }
    if (current === target) {
      process.stdout.write(`plumbbob: already linked (${link} → ${target}). Nothing to do.\n`)
      return 0
    }
    rmSync(link) // a stale link from an earlier install location — repoint it
  }

  symlinkSync(target, link)
  process.stdout.write(
    `plumbbob: linked ${link} → ${target}.\n` +
      'plumbbob: Claude Code loads it as a plugin — skills as `/plumbbob:*`, the post-edit hook auto-registered from hooks.json. Restart Claude Code (or /reload-plugins) to activate.\n' +
      'plumbbob: nothing else under ~ is touched and settings.json is left alone. Sessions are per-project — run `plumbbob start "<goal>"` in any repo, then `plumbbob doctor` to verify.\n',
  )
  return 0
}

function uninstall(link: string): number {
  if (!present(link)) {
    process.stdout.write(`plumbbob: nothing to uninstall — no link at ${link}.\n`)
    return 0
  }
  if (symlinkTarget(link) === null) {
    process.stderr.write(`plumbbob: ${link} is not a plumbbob link (a real directory/file) — leaving it untouched.\n`)
    return 1
  }
  rmSync(link)
  process.stdout.write(`plumbbob: unlinked ${link}. Restart Claude Code to drop the plugin.\n`)
  return 0
}
