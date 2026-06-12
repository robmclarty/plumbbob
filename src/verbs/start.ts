// `plumbbob start "<title>"` — scaffold the sidecar, record the baseline, enter
// DESIGN. Refuses on a dirty tree (D22), an existing session, or a non-git dir.

import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findRepoRoot, hasCommit, headSha, isDirty } from '../lib/git.ts'
import {
  sidecarDir,
  checkpointsPath,
  configPath,
  intentPath,
  buildLogPath,
  writeState,
  hasSession,
  excludeSidecar,
} from '../lib/sidecar.ts'

const DEFAULT_CHECK = 'pnpm run check'

export function start(cwd: string, args: ReadonlyArray<string>): number {
  const positionals = args.filter((a) => !a.startsWith('--'))
  const allowDirty = args.includes('--allow-dirty')
  const title = (positionals[0] ?? '').trim()

  if (title.length === 0) {
    process.stderr.write('plumbbob: start needs a title. Try: plumbbob start "what you are building".\n')
    return 1
  }

  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(
      'plumbbob: not a git repository. Plumbbob records a baseline commit — run `git init` and make an initial commit first.\n',
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

  const sha = headSha(root)
  const check = detectCheck(root)

  mkdirSync(sidecarDir(root), { recursive: true })
  writeState(root, 'DESIGN')
  writeFileSync(checkpointsPath(root), `baseline ${sha}\n`)
  writeFileSync(configPath(root), `check=${check.command}\n`)
  writeFileSync(intentPath(root), stamp(readTemplate('intent.md'), title, check.command))
  writeFileSync(buildLogPath(root), stamp(readTemplate('build-log.md'), title, check.command))
  excludeSidecar(root)

  if (check.warn) {
    process.stderr.write(
      `plumbbob: WARNING the heavy check '${check.command}' is not defined in this repo's package.json. Edit .plumbbob/config (check=...) to set the real gate before \`review\`/\`done\`.\n`,
    )
  }
  process.stdout.write(
    `plumbbob: started "${title}" — STATE=DESIGN, baseline ${sha.slice(0, 9)}. Frame and decide in .plumbbob/intent.md; flip to BUILD only once the decisions are made.\n`,
  )
  return 0
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
