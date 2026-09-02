// `plumbbob start "<title>"`: open a session: scaffold the sidecar (the
// `.plumbbob/` tree of build artifacts and control files), record the baseline
// commit, and point the session at a new build. Refuses on a dirty tree (a
// clean baseline is the contract; `--allow-dirty` overrides), an existing
// session, or a non-git directory.

import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { detectGate } from '../lib/check.ts'
import { readTemplate, stampTemplate } from '../lib/templates.ts'
import { findRepoRoot, hasCommit, headSha, isDirty, isIgnored } from '../lib/git.ts'
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
import { notice, transition } from '../lib/notice.ts'

/**
 * Human-readable echo of the default check gate, stamped into the templates'
 * {{CHECK}} line.
 *
 * The gate is checkride unless a `check` setting overrides it, so settings.json
 * seeds with no `check` key at all; absence IS the default; this line says
 * that in prose where the templates need it.
 */
const CHECK_ECHO = 'checkride (set a "check" key in .plumbbob/settings.json to override)'

/**
 * Open a session: validate the repo, scaffold the build folder, record the
 * baseline commit.
 *
 * Refuses without a title, outside a git repo, on a commitless repo, when a
 * session is already active, and on a dirty tree (`--allow-dirty` records the
 * current HEAD anyway, with a data-loss warning). The default layout is a
 * tracked `.plumbbob/builds/<slug>/` folder that rides the branch into the PR;
 * `--local` keeps the whole sidecar untracked for repos that won't carry tool
 * folders. Ends with a plan-time probe of the check gate so an unconfigured
 * repo hears about it while the human is still deciding.
 */
export async function start(cwd: string, args: ReadonlyArray<string>): Promise<number> {
  const positionals = args.filter((a) => !a.startsWith('--'))
  const allowDirty = args.includes('--allow-dirty')
  const local = args.includes('--local')
  const title = (positionals[0] ?? '').trim()
  const slug = (flagValue(args, '--slug') ?? datedSlug(title)).trim()

  if (title.length === 0) {
    process.stderr.write(
      notice({ fact: 'start needs a title', remedy: 'plumbbob start "what you are building"' }),
    )
    return 1
  }

  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(
      notice({
        fact: 'not a git repository',
        detail: ['plumbbob records a baseline commit'],
        remedy: 'git init, then make an initial commit',
      }),
    )
    return 1
  }
  if (!hasCommit(root)) {
    process.stderr.write(
      notice({
        fact: 'this repository has no commits yet',
        remedy: 'make an initial commit, so start can record a baseline',
      }),
    )
    return 1
  }
  if (hasSession(root)) {
    process.stderr.write(
      notice({ fact: 'a session is already active here', remedy: 'plumbbob finish to close it before starting another' }),
    )
    return 1
  }
  if (isDirty(root)) {
    if (!allowDirty) {
      process.stderr.write(
        notice({
          fact: 'the working tree is dirty',
          remedy: 'commit or stash first, or plumbbob start --allow-dirty "<title>" to record HEAD as the baseline',
        }),
      )
      return 1
    }
    process.stderr.write(
      notice({
        fact: 'recording HEAD as the baseline with a dirty tree',
        advisory: true,
        detail: ['--allow-dirty'],
        remedy: 'a later revert to baseline will DISCARD the uncommitted work',
      }),
    )
  }

  if (!local && slug.length === 0) {
    process.stderr.write(
      notice({
        fact: `could not derive a build slug from "${title}"`,
        remedy: 'pass --slug <name>, or retitle with letters or digits',
      }),
    )
    return 1
  }
  if (!local && listBuilds(root).includes(slug)) {
    process.stderr.write(
      notice({
        fact: `a build named "${slug}" already exists in .plumbbob/builds/`,
        remedy: 'retitle, or pass --slug <name> to choose another',
      }),
    )
    return 1
  }

  const sha = headSha(root)

  mkdirSync(sidecarDir(root), { recursive: true })
  // beginSession writes STATE: one file that is both the session sentinel (its
  // existence means a session is live) and the active-build cursor (its single
  // line names the build every verb acts on). Point it at this build: null
  // under --local, which has no cursor. The cursor lives in STATE, not
  // settings.local.json, so that personal overlay stays purely human-owned.
  beginSession(root, local ? null : slug)
  // Scaffold the tracked settings.json ONLY when absent, and seed it EMPTY: the
  // human owns this file once it exists (their `check` gate lives here), so a
  // re-start must never touch it. Inject no opinions even on first create:
  // absence of `check` already means checkride and absence of `auto` already
  // means false (see settings.ts), so `{}` is exactly "all defaults". `auto` in
  // particular is a personal preference that belongs in settings.local.json,
  // never this tracked file.
  if (!existsSync(settingsPath(root))) {
    writeFileSync(settingsPath(root), `${JSON.stringify({}, null, 2)}\n`)
  }

  // `--local` keeps a fully untracked flat layout (the whole `.plumbbob/`
  // git-excluded); the default plants a tracked `builds/<slug>/` folder (the
  // build's record [intent, build-log, checkpoints] rides its branch into the
  // PR) and git-excludes only the per-worktree control files. The slug is
  // date-prefixed when derived (see datedSlug) and validated unique above;
  // the CLI refuses a collision, never auto-suffixes.
  let intentLocation: string
  if (local) {
    writeFileSync(checkpointsPath(root), `baseline ${sha}\n`)
    writeFileSync(intentPath(root), stampBuild(readTemplate('intent.md'), title))
    writeFileSync(buildLogPath(root), stampBuild(readTemplate('build-log.md'), title))
    excludeSidecar(root)
    intentLocation = '.plumbbob/intent.md'
  } else {
    const dir = buildDir(root, slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'checkpoints'), `baseline ${sha}\n`)
    writeFileSync(join(dir, 'intent.md'), stampBuild(readTemplate('intent.md'), title))
    writeFileSync(join(dir, 'build-log.md'), stampBuild(readTemplate('build-log.md'), title))
    excludeControl(root)
    intentLocation = `.plumbbob/builds/${slug}/intent.md`
  }

  // The plan's entry stamp for the checkpoint latch: set TICK to the current
  // TURN, so `checkpoint --plan` only lands once the harness ledger records a
  // human turn after this moment. Skipped when TURN is absent: a hookless host
  // grows no ledger and the latch stays dormant, which also covers a first
  // session where the hook has never ticked; that one plan commit stays
  // guidance-governed. Any GRANT file lying around predates this session (a
  // legitimate one is minted by a `/build` prompt, which never runs `start`);
  // clear it so a stale grant can't self-approve this session's plan; a
  // grant's lifetime is one turn.
  setGrant(root, null)
  stampTick(root, local ? null : slug)

  process.stdout.write(
    transition({
      label: 'Session',
      fact: `started "${title}"`,
      detail: [`baseline ${sha.slice(0, 9)}`],
      remedy: `frame and decide in ${intentLocation}, then build a step`,
    }),
  )

  // The tracked layout plants `builds/<slug>/` to ride the branch into the PR,
  // but a repo whose own `.gitignore` excludes `.plumbbob/` overrides that, and
  // an explicit `git add` of an ignored folder is a hard error. Detect it here,
  // once, so the record-only mode (plan/finish commits land empty; their bodies
  // carry the record, the files stay untracked) is a known mode from the start
  // rather than a surprise at the first `checkpoint --plan`. `--local` already
  // excludes the whole sidecar by design and says so, so skip the probe there.
  // Guidance only, and the session is already open: a probe hiccup stays silent
  // rather than half-crashing a scaffolded session.
  if (!local && sidecarIsIgnored(root, slug)) {
    process.stderr.write(
      notice({
        fact: 'this repo gitignores .plumbbob/',
        advisory: true,
        detail: ['the build folder cannot ride the branch', 'plan and finish commits will be record-only'],
        remedy: 'unignore .plumbbob/builds/ before the first checkpoint to keep the record in the tree',
      }),
    )
  }

  // The plan-time gate probe: if checkride sees no code checks here, say so
  // NOW (while the human is still deciding) instead of at the first
  // checkpoint, where the gate either refuses a vacuous run or, worse, greens
  // on the always-on repo checks alone. Guidance only: it never changes the
  // exit code, and a configured `check` or a probe hiccup stays silent.
  const gate = await detectGate(root)
  if (gate.configured === null && !gate.detected) {
    process.stderr.write(
      notice({
        fact: 'the check gate sees no code checks in this repo',
        advisory: true,
        detail: ['checkride detected no tools', 'checkpoints gate on it and would green vacuously'],
        remedy: 'add {"check": "npm test"} to .plumbbob/settings.json while you are still planning',
      }),
    )
  }
  return 0
}

/**
 * Derive a `YYYY-MM-DD-<slug>` build slug from the title (local time).
 *
 * The date prefix makes `builds/` sort chronologically under `listBuilds`'
 * plain lexical sort: ordering by construction, not by titling convention. An
 * explicit `--slug` bypasses this and stays verbatim: the CLI never rewrites
 * what the caller chose. An untitleable title yields `''` so the empty-slug
 * guard fires instead of minting a date-only slug.
 */
function datedSlug(title: string): string {
  const base = slugify(title)
  if (base.length === 0) return ''
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${base}`
}

/**
 * Whether the tracked build folder is gitignored: the record-only advisory's
 * predicate, probing exactly the path `checkpoint --plan` will try to stage.
 *
 * Best-effort: a probe that throws (a fatal `git check-ignore`) reads as
 * not-ignored so the advisory stays silent rather than crashing a session that
 * is already open.
 */
function sidecarIsIgnored(root: string, slug: string): boolean {
  try {
    return isIgnored(root, buildDir(root, slug))
  } catch {
    return false
  }
}

/**
 * Read the value that follows a `--flag` in argv (for example `--slug my-build`), or
 * undefined when the flag is absent or trails with no value.
 */
function flagValue(args: ReadonlyArray<string>, flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

/**
 * Stamp a build template's `{{TITLE}}`/`{{CHECK}}`: the check is always the
 * echo constant, since an absent `check` setting IS the checkride default.
 */
function stampBuild(template: string, title: string): string {
  return stampTemplate(template, { TITLE: title, CHECK: CHECK_ECHO })
}
