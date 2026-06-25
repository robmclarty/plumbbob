// `plumbbob doctor` — diagnose a project's install end to end and print the fix
// for anything broken. Read-only: it inspects, it never writes. The failure
// class it exists for is SILENT — a skill's status pre-injection resolving to an
// empty/garbled bin (e.g. the pre-0.3 `$CLAUDE_PROJECT_DIR` form, a hooks-only
// variable that expands empty in a skill's bash) leaves an empty dashboard with
// no error. doctor names the problem and the remedy instead. Functional,
// node builtins only (C1/C2).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRepoRoot } from '../lib/git.ts'
import { readSettings } from '../lib/settings.ts'

type Check = { readonly ok: boolean; readonly label: string; readonly fix?: string }

// The plumbbob package's own skills/ dir (the canonical set setup installs). Off
// this module's URL so it resolves the same from src/ (dev) and dist/ (published).
function packageDir(name: string): string {
  return fileURLToPath(new URL(`../../${name}/`, import.meta.url))
}

// The pb-* skill directories under `dir` that actually carry a SKILL.md.
function listSkills(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md')))
  } catch {
    return []
  }
}

// Pull the bin token out of a skill's status pre-injection — the text between
// `!`` and ` status`. Returns null if the skill carries no injection line.
function injectionBin(body: string): string | null {
  const m = body.match(/!`(.+?) status\b/)
  return m === null ? null : (m[1] ?? null)
}

// The distinct bin tokens the installed skills inject. They should be uniform; a
// set surfaces a partial/failed setup that left some skills on the old token.
function installedBins(skillsDir: string, skills: ReadonlyArray<string>): string[] {
  const bins = skills
    .map((n) => injectionBin(readFileSync(join(skillsDir, n, 'SKILL.md'), 'utf8')))
    .filter((b): b is string => b !== null)
  return [...new Set(bins)]
}

// Classify the injected bins: ok, or a list of human-readable problems. Catches
// the unresolved placeholder (setup never substituted) and the legacy
// $CLAUDE_PROJECT_DIR form (empty in a skill), and verifies an absolute bin
// actually exists on disk. A bare `plumbbob` resolves from PATH — accepted.
function binProblems(bins: ReadonlyArray<string>): string[] {
  const problems: string[] = []
  for (const bin of bins) {
    if (bin.includes('__PLUMBBOB_BIN__')) {
      problems.push('placeholder not substituted (setup did not finish)')
    } else if (bin.includes('$CLAUDE_PROJECT_DIR')) {
      problems.push('legacy $CLAUDE_PROJECT_DIR bin — expands empty in a skill (pre-0.3 install)')
    } else if (bin.startsWith('/') && !existsSync(bin)) {
      problems.push(`absolute bin not found on disk: ${bin}`)
    }
  }
  return problems
}

type LooseEntry = { readonly hooks?: ReadonlyArray<{ readonly command?: string }> }

// True iff any registered hook command points into our hooks dir (the marker the
// settings module also uses for strip/merge).
function hasOurHook(settings: ReturnType<typeof readSettings>): boolean {
  const hooks = (settings as { hooks?: Record<string, ReadonlyArray<LooseEntry> | undefined> }).hooks ?? {}
  return Object.values(hooks).some((list) =>
    (list ?? []).some((e) => (e.hooks ?? []).some((h) => (h.command ?? '').includes('plumbbob/hooks/'))),
  )
}

// The repo-scoped (self-contained) install: skills under <repo>/.claude, the CLI
// and hook in <repo>/node_modules, registration in either settings file.
function selfChecks(repoRoot: string, shipped: ReadonlyArray<string>): Check[] {
  const skillsDir = join(repoRoot, '.claude', 'skills')
  const installed = listSkills(skillsDir)
  const bins = installedBins(skillsDir, installed)
  const problems = binProblems(bins)
  const localFile = join(repoRoot, '.claude', 'settings.local.json')
  const projFile = join(repoRoot, '.claude', 'settings.json')
  const registeredIn = [localFile, projFile].filter((f) => hasOurHook(readSettings(f)))
  const hookScript = join(repoRoot, 'node_modules', 'plumbbob', 'hooks', 'post-edit.sh')

  return [
    installed.length >= shipped.length
      ? { ok: true, label: `skills installed (${installed.length}) in .claude/skills` }
      : {
          ok: false,
          label: `skills incomplete (${installed.length}/${shipped.length}) in .claude/skills`,
          fix: 'rerun: pnpm exec plumbbob setup --local',
        },
    problems.length === 0
      ? { ok: true, label: `skill bin resolves (${bins.join(', ') || 'n/a'})` }
      : { ok: false, label: `skill bin broken — ${problems.join('; ')}`, fix: 'rerun: pnpm exec plumbbob setup --local' },
    existsSync(join(repoRoot, 'node_modules', 'plumbbob'))
      ? { ok: true, label: 'plumbbob dependency present (node_modules/plumbbob)' }
      : { ok: false, label: 'plumbbob is not a project dependency', fix: 'add it: pnpm add -D plumbbob' },
    existsSync(join(repoRoot, 'node_modules', '.bin', 'plumbbob'))
      ? { ok: true, label: 'CLI shim present (node_modules/.bin/plumbbob)' }
      : { ok: false, label: 'CLI shim missing (node_modules/.bin/plumbbob)', fix: 'reinstall deps: pnpm install' },
    registeredIn.length > 0
      ? { ok: true, label: `post-edit hook registered (${registeredIn.map((f) => basename(f)).join(', ')})` }
      : {
          ok: false,
          label: 'post-edit hook not registered in .claude/settings*.json',
          fix: 'rerun: pnpm exec plumbbob setup --local',
        },
    existsSync(hookScript)
      ? { ok: true, label: 'hook script resolves (node_modules/plumbbob/hooks/post-edit.sh)' }
      : {
          ok: false,
          label: 'hook script missing (node_modules/plumbbob/hooks/post-edit.sh)',
          fix: 'reinstall the dep so the registered hook resolves: pnpm add -D plumbbob',
        },
  ]
}

// The global install: skills + hook copied under ~/.claude, the CLI on PATH from
// `npm i -g`. The bare on-PATH bin can't be probed from here without spawning, so
// this scope verifies the copied artifacts and the registration.
function globalChecks(home: string, shipped: ReadonlyArray<string>): Check[] {
  const skillsDir = join(home, '.claude', 'skills')
  const installed = listSkills(skillsDir)
  const problems = binProblems(installedBins(skillsDir, installed))
  const hookScript = join(home, '.claude', 'plumbbob', 'hooks', 'post-edit.sh')

  return [
    installed.length >= shipped.length
      ? { ok: true, label: `skills installed (${installed.length}) in ~/.claude/skills` }
      : { ok: false, label: `skills incomplete (${installed.length}/${shipped.length})`, fix: 'rerun: plumbbob setup --global' },
    problems.length === 0
      ? { ok: true, label: 'skill bin resolves (plumbbob, on PATH from the global install)' }
      : { ok: false, label: `skill bin broken — ${problems.join('; ')}`, fix: 'rerun: plumbbob setup --global' },
    existsSync(hookScript)
      ? { ok: true, label: 'hook script present (~/.claude/plumbbob/hooks/post-edit.sh)' }
      : { ok: false, label: 'hook script missing under ~/.claude/plumbbob/hooks', fix: 'rerun: plumbbob setup --global' },
    hasOurHook(readSettings(join(home, '.claude', 'settings.json')))
      ? { ok: true, label: 'post-edit hook registered (~/.claude/settings.json)' }
      : { ok: false, label: 'post-edit hook not registered (~/.claude/settings.json)', fix: 'rerun: plumbbob setup --global' },
  ]
}

export function doctor(cwd: string): number {
  const home = process.env.HOME ?? homedir()
  const shipped = listSkills(packageDir('skills'))
  const repoRoot = findRepoRoot(cwd)
  const repoSkills = repoRoot === null ? [] : listSkills(join(repoRoot, '.claude', 'skills'))
  const globalSkills = listSkills(join(home, '.claude', 'skills'))

  const out: string[] = [`plumbbob doctor — ${repoRoot ?? cwd}`]
  let checks: Check[]
  if (repoSkills.length > 0 && repoRoot !== null) {
    out.push('install shape: self-contained (<repo>/.claude)')
    checks = selfChecks(repoRoot, shipped)
  } else if (globalSkills.length > 0) {
    out.push('install shape: global (~/.claude)')
    checks = globalChecks(home, shipped)
  } else {
    out.push('install shape: none detected')
    checks = [
      {
        ok: false,
        label: 'no pb-* skills found under <repo>/.claude/skills or ~/.claude/skills',
        fix:
          repoRoot === null
            ? 'global install: npm i -g plumbbob && plumbbob setup --global'
            : 'project install: pnpm add -D plumbbob && pnpm exec plumbbob setup --local',
      },
    ]
  }

  for (const c of checks) {
    out.push(c.ok ? `  ✓ ${c.label}` : `  ✗ ${c.label}\n      → ${c.fix}`)
  }

  const failed = checks.filter((c) => !c.ok).length
  out.push('')
  out.push(
    failed === 0
      ? 'plumbbob: all checks passed. If a skill still misbehaves, restart Claude Code to reload settings.'
      : `plumbbob: ${failed} problem(s) found — apply the → fixes above, then restart Claude Code.`,
  )
  process.stdout.write(`${out.join('\n')}\n`)
  return failed === 0 ? 0 : 1
}
