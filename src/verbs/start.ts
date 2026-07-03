// `plumbbob start "<title>"` — scaffold the sidecar, record the baseline, open
// the session. Refuses on a dirty tree (D22), an existing session, or a non-git dir.

import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
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
} from '../lib/sidecar.ts'
import { settingsPath, setLocalSetting } from '../lib/settings.ts'

const DEFAULT_CHECK = 'pnpm run check'

export function start(cwd: string, args: ReadonlyArray<string>): number {
  const positionals = args.filter((a) => !a.startsWith('--'))
  const allowDirty = args.includes('--allow-dirty')
  const local = args.includes('--local')
  const title = (positionals[0] ?? '').trim()
  const slug = (flagValue(args, '--slug') ?? slugify(title)).trim()

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
  const check = detectCheck(root)

  mkdirSync(sidecarDir(root), { recursive: true })
  beginSession(root)
  writeFileSync(settingsPath(root), `${JSON.stringify({ check: check.command, auto: false }, null, 2)}\n`)

  // D13: `--local` keeps today's fully-untracked flat layout (whole `.plumbbob/`
  // excluded); the default plants a tracked, PR-riding `builds/<slug>/` folder
  // (D2) and points the per-worktree cursor at it (D3), excluding only control
  // files (D2). The slug is validated unique above — the CLI refuses, never
  // suffixes (D17).
  let intentLocation: string
  if (local) {
    writeFileSync(checkpointsPath(root), `baseline ${sha}\n`)
    writeFileSync(intentPath(root), stamp(readTemplate('intent.md'), title, check.command))
    writeFileSync(buildLogPath(root), stamp(readTemplate('build-log.md'), title, check.command))
    excludeSidecar(root)
    intentLocation = '.plumbbob/intent.md'
  } else {
    const dir = buildDir(root, slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'checkpoints'), `baseline ${sha}\n`)
    writeFileSync(join(dir, 'intent.md'), stamp(readTemplate('intent.md'), title, check.command))
    writeFileSync(join(dir, 'build-log.md'), stamp(readTemplate('build-log.md'), title, check.command))
    setLocalSetting(root, 'activeBuild', slug)
    excludeControl(root)
    intentLocation = `.plumbbob/builds/${slug}/intent.md`
  }

  if (check.warn) {
    process.stderr.write(
      `plumbbob: WARNING the heavy check '${check.command}' is not defined in this repo's package.json. Set the "check" key in .plumbbob/settings.json to the real gate before \`review\`/\`done\`.\n`,
    )
  }
  process.stdout.write(
    `plumbbob: started "${title}" — baseline ${sha.slice(0, 9)}. Frame and decide in ${intentLocation}; \`build\` a step once the decisions are made.\n`,
  )
  return 0
}

// Read the value that follows a `--flag` in argv (e.g. `--slug my-build`), or
// undefined when the flag is absent or trails with no value.
function flagValue(args: ReadonlyArray<string>, flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

// D24: default the heavy check to `pnpm run check`; warn (but still record it)
// when the target repo has no such script, so a non-pnpm repo gets a clear nudge.
function detectCheck(root: string): { readonly command: string; readonly warn: boolean } {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    return { command: DEFAULT_CHECK, warn: pkg.scripts?.check === undefined }
  } catch {
    return { command: DEFAULT_CHECK, warn: true }
  }
}

function readTemplate(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), 'utf8')
}

function stamp(template: string, title: string, check: string): string {
  return template.split('{{TITLE}}').join(title).split('{{CHECK}}').join(check)
}
