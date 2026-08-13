// `plumbbob init [--uninstall] [--force]`: link plumbbob into Claude Code as an
// in-place skills-directory plugin. It symlinks the installed package into
// ~/.claude/skills/plumbbob, where Claude Code discovers it as `plumbbob@skills-dir`:
// the skills load namespaced (`/plumbbob:*`) and the post-edit hook auto-registers
// from hooks/hooks.json. This non-marketplace install path is first-class by design:
// it serves an `npm i -g` global, local dev, and clients predating plugins, and it
// keeps plumbbob usable as a standalone CLI outside any one host rather than
// Claude-marketplace-only. The marketplace plugin is the
// co-equal self-contained alternative (it ships skills AND the `plumbbob` CLI on PATH
// via bin/, so it needs neither `npm i -g` nor `init`). The two are mutually
// exclusive: both register a plugin named `plumbbob`, and a double-install collides
// over the /plumbbob:* namespace (skills can drop to flat `/status` names). So init
// REFUSES when a marketplace plumbbob is already installed: `--force` overrides
// (the dev-install path uses it). Global-only by design: install scope is NOT session
// scope: sessions stay per-project via `plumbbob start`. Idempotent + reversible
// (`--uninstall` drops the link); it NEVER writes settings.json. Node builtins only.

import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marketplacePlumbbob } from '../lib/plugins.ts'

/**
 * The installed package root: parent of .claude-plugin/, skills/, hooks/, dist/.
 *
 * Derived from this module's URL: the global install when run as the published
 * bin, the checkout in dev. No trailing slash, so it compares clean against a
 * readlink.
 */
function packageRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url)).replace(/\/+$/, '')
}

/**
 * The symlink location Claude Code scans for skills-directory plugins.
 */
function linkPath(home: string): string {
  return join(home, '.claude', 'skills', 'plumbbob')
}

/**
 * Whether anything exists at `path`, including a broken symlink.
 *
 * lstat-based: existsSync follows the link and would miss one whose target
 * moved.
 */
function present(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * The symlink's target (no trailing slash), or null if `path` is not a symlink.
 */
function symlinkTarget(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path).replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

/**
 * Link the installed package into ~/.claude/skills/plumbbob, or `--uninstall` it.
 *
 * Refuses when a marketplace plumbbob plugin is already installed (two plugins
 * named `plumbbob` collide over the /plumbbob:* namespace) unless `--force`.
 * Repoints a stale link from an earlier install location; already-linked is a
 * clean exit 0.
 */
export function init(args: ReadonlyArray<string>): number {
  const home = process.env.HOME ?? homedir()
  const link = linkPath(home)
  const target = packageRoot()

  if (args.includes('--uninstall')) {
    return uninstall(link)
  }

  const market = marketplacePlumbbob(home)
  if (market.length > 0 && !args.includes('--force')) {
    process.stderr.write(
      `plumbbob: a marketplace plumbbob plugin is already installed (${market.join(', ')}).\n` +
        'plumbbob: it already provides the skills (`/plumbbob:*`) and the `plumbbob` CLI on PATH (the plugin bin/) — no `plumbbob init` needed.\n' +
        `plumbbob: linking ${link} would register a SECOND plugin named \`plumbbob\`; the two collide over the /plumbbob:* namespace and skills can drop to flat names (\`/status\`).\n` +
        'plumbbob: to use the skills-dir link instead, first remove the marketplace one (`/plugin uninstall plumbbob@<marketplace>`), or re-run with `--force` if you know what you are doing.\n',
    )
    return 1
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
    rmSync(link) // a stale link from an earlier install location: repoint it
  }

  symlinkSync(target, link)
  process.stdout.write(
    `plumbbob: linked ${link} → ${target}.\n` +
      'plumbbob: Claude Code loads it as a plugin — skills as `/plumbbob:*`, the post-edit hook auto-registered from hooks.json. Restart Claude Code (or /reload-plugins) to activate.\n' +
      'plumbbob: nothing else under ~ is touched and settings.json is left alone. Sessions are per-project — run `plumbbob start "<goal>"` in any repo, then `plumbbob doctor` to verify.\n',
  )
  return 0
}

/**
 * Remove the skills-directory link, leaving anything that is not a plumbbob
 * symlink untouched.
 */
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
