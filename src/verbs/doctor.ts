// `plumbbob doctor` — diagnose the global plugin link end to end. Read-only: it
// inspects, it never writes. After `plumbbob init`, plumbbob lives as a symlink at
// ~/.claude/skills/plumbbob pointing at the installed package; Claude Code loads it
// in place as a plugin (skills `/plumbbob:*`, the post-edit hook from hooks.json).
// doctor verifies the link resolves to a package carrying the manifest, the skills,
// and the hook — and names the fix for anything missing. The failure class it
// exists for is SILENT (a `/plumbbob:pb-status` that opens an empty dashboard because the
// plugin never linked). Functional, node builtins only (C1/C2).

import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marketplacePlumbbob } from '../lib/plugins.ts'

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

export function doctor(): number {
  const home = process.env.HOME ?? homedir()
  const link = join(home, '.claude', 'skills', 'plumbbob')
  const shipped = listSkills(packageDir('skills'))
  const pkg = linkedPackage(link)
  const market = marketplacePlumbbob(home)

  let checks: Check[]
  if (pkg === null) {
    checks =
      market.length > 0
        ? [{ ok: true, label: `installed via marketplace (${market.join(', ')}) — skills load as /plumbbob:*, the CLI is on PATH from the plugin bin/. No init needed.` }]
        : [{ ok: false, label: `not linked — no plugin at ${link}`, fix: 'install the marketplace plugin (/plugin install plumbbob@<marketplace>) or run: plumbbob init' }]
  } else {
    checks = buildChecks(link, pkg, shipped)
    if (market.length > 0) {
      checks.unshift({
        ok: false,
        label: `collision — also installed via marketplace (${market.join(', ')}); two plugins named plumbbob fight over /plumbbob:* and skills can drop to flat names`,
        fix: 'keep one — `plumbbob init --uninstall` to use the marketplace plugin, or `/plugin uninstall` the marketplace one to keep this link',
      })
    }
  }

  const out: string[] = ['plumbbob doctor — plugin install']
  for (const c of checks) {
    out.push(c.ok ? `  ✓ ${c.label}` : `  ✗ ${c.label}\n      → ${c.fix}`)
  }

  const failed = checks.filter((c) => !c.ok).length
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
