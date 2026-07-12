// `plumbbob start "<title>"` — scaffold the sidecar, record the baseline, open
// the session. Refuses on a dirty tree (D22), an existing session, or a non-git dir.

import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { detectGate } from '../lib/check.ts'
import { findRepoRoot, hasCommit, headSha, isDirty } from '../lib/git.ts'
import {
  sidecarDir,
  buildDir,
  listBuilds,
  slugify,
  checkpointsPath,
  intentPath,
  buildLogPath,
  beginSession,
  hasSession,
  excludeControl,
  excludeSidecar,
  setGrant,
  stampTick,
} from '../lib/sidecar.ts'
import { settingsPath } from '../lib/settings.ts'

// D24/D32: the gate is checkride unless a `check` setting overrides it, so
// settings.json seeds with no `check` key at all — absence IS the default. The
// templates' {{CHECK}} line is a human-readable echo of that.
const CHECK_ECHO = 'checkride (set a "check" key in .plumbbob/settings.json to override)'

export async function start(cwd: string, args: ReadonlyArray<string>): Promise<number> {
  const positionals = args.filter((a) => !a.startsWith('--'))
  const allowDirty = args.includes('--allow-dirty')
  const local = args.includes('--local')
  const title = (positionals[0] ?? '').trim()
  const slug = (flagValue(args, '--slug') ?? datedSlug(title)).trim()

  if (title.length === 0) {
    process.stderr.write('plumbbob: start needs a title. Try: plumbbob start "what you are building".\n')
    return 1
  }

  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(
      'plumbbob: not a git repository. PlumbBob records a baseline commit — run `git init` and make an initial commit first.\n',
    )
    return 1
  }
  if (!hasCommit(root)) {
    process.stderr.write(
      'plumbbob: this repository has no commits yet. Make an initial commit so `start` can record a baseline.\n',
    )
    return 1
  }
  if (hasSession(root)) {
    process.stderr.write(
      'plumbbob: a session is already active here. Run `plumbbob finish` to close it before starting another.\n',
    )
    return 1
  }
  if (isDirty(root)) {
    if (!allowDirty) {
      process.stderr.write(
        'plumbbob: the working tree is dirty. Commit or stash first, or `plumbbob start --allow-dirty "<title>"` to record the current HEAD as the baseline.\n',
      )
      return 1
    }
    process.stderr.write(
      'plumbbob: WARNING --allow-dirty: recording HEAD as baseline with a dirty tree. A later revert-to-baseline will DISCARD the uncommitted work.\n',
    )
  }

  if (!local && slug.length === 0) {
    process.stderr.write(
      `plumbbob: could not derive a build slug from "${title}". Pass --slug <name>, or retitle with letters or digits.\n`,
    )
    return 1
  }
  if (!local && listBuilds(root).includes(slug)) {
    process.stderr.write(
      `plumbbob: a build named "${slug}" already exists in .plumbbob/builds/. Retitle, or pass --slug <name> to choose another.\n`,
    )
    return 1
  }

  const sha = headSha(root)

  mkdirSync(sidecarDir(root), { recursive: true })
  // beginSession writes STATE — the session sentinel and, in its content, the cursor
  // (D28). Point it at this build (null under --local, which has no cursor). The
  // cursor lives in STATE, not settings.local.json, so that overlay stays human-owned.
  beginSession(root, local ? null : slug)
  // Scaffold the tracked settings.json ONLY when absent, and seed it EMPTY — the
  // human owns this file once it exists (their `check` gate lives here), so a
  // re-start must never touch it. We inject no opinions even on first create:
  // absence of `check` already means checkride and absence of `auto` already means
  // false (see settings.ts), so `{}` is exactly "all defaults". `auto` in
  // particular is a personal preference that belongs in settings.local.json, not
  // this tracked file — seeding it here was the bug that clobbered custom checks.
  if (!existsSync(settingsPath(root))) {
    writeFileSync(settingsPath(root), `${JSON.stringify({}, null, 2)}\n`)
  }

  // D26: `--local` keeps today's fully-untracked flat layout (whole `.plumbbob/`
  // excluded); the default plants a tracked, PR-riding `builds/<slug>/` folder
  // (D26) and points the per-worktree cursor at it (D28), excluding only control
  // files (D17). The slug is date-prefixed when derived (see datedSlug) and
  // validated unique above — the CLI refuses, never suffixes (D38).
  let intentLocation: string
  if (local) {
    writeFileSync(checkpointsPath(root), `baseline ${sha}\n`)
    writeFileSync(intentPath(root), stamp(readTemplate('intent.md'), title, CHECK_ECHO))
    writeFileSync(buildLogPath(root), stamp(readTemplate('build-log.md'), title, CHECK_ECHO))
    excludeSidecar(root)
    intentLocation = '.plumbbob/intent.md'
  } else {
    const dir = buildDir(root, slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'checkpoints'), `baseline ${sha}\n`)
    writeFileSync(join(dir, 'intent.md'), stamp(readTemplate('intent.md'), title, CHECK_ECHO))
    writeFileSync(join(dir, 'build-log.md'), stamp(readTemplate('build-log.md'), title, CHECK_ECHO))
    excludeControl(root)
    intentLocation = `.plumbbob/builds/${slug}/intent.md`
  }

  // The plan's entry stamp (D64): `checkpoint --plan` latches on this tick. Skipped
  // when TURN is absent — including the known first-session seam where the hook has
  // never ticked, which leaves that one plan commit guidance-governed. Any grant
  // lying around is a leftover from an earlier session (a legitimate one is minted
  // by a `/pb-build` prompt, which never runs `start`) — clear it so a stale `auto`
  // can't self-approve this session's plan (D65: one-turn lifetime).
  setGrant(root, null)
  stampTick(root, local ? null : slug)

  process.stdout.write(
    `plumbbob: started "${title}" — baseline ${sha.slice(0, 9)}. Frame and decide in ${intentLocation}; \`build\` a step once the decisions are made.\n`,
  )

  // The plan-time gate probe (research/07 Build 2a): if checkride sees no code
  // checks here, say so NOW — while the human is still deciding — instead of at
  // the first checkpoint, where the gate either refuses a vacuous run or, worse,
  // greens on the always-on repo checks alone. Guidance only: never the exit
  // code (C1), and a configured `check` or a probe hiccup stays silent.
  const gate = await detectGate(root)
  if (gate.configured === null && !gate.detected) {
    process.stderr.write(
      'plumbbob: heads-up — the check gate sees no code checks in this repo (checkride detected no tools).\n' +
        '  Set one while you are still planning: add {"check": "npm test"} to .plumbbob/settings.json.\n' +
        '  Checkpoints gate on it — with nothing to run, the gate refuses or greens vacuously.\n',
    )
  }
  return 0
}

// Derived slugs carry a `YYYY-MM-DD-` prefix (local time) so `builds/` sorts
// chronologically under `listBuilds`' plain lexical sort — ordering by
// construction, not by titling convention. An explicit `--slug` stays verbatim
// (D38: the CLI never rewrites what the caller chose). An untitleable title
// yields `''` so the empty-slug guard fires instead of minting a date-only slug.
function datedSlug(title: string): string {
  const base = slugify(title)
  if (base.length === 0) return ''
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${base}`
}

// Read the value that follows a `--flag` in argv (e.g. `--slug my-build`), or
// undefined when the flag is absent or trails with no value.
function flagValue(args: ReadonlyArray<string>, flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

function readTemplate(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), 'utf8')
}

function stamp(template: string, title: string, check: string): string {
  return template.split('{{TITLE}}').join(title).split('{{CHECK}}').join(check)
}
