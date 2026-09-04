import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  commit,
  commitsSince,
  diffNumstat,
  diffPatch,
  findRepoRoot,
  gitPath,
  hasCommit,
  headSha,
  isDirty,
  isIgnored,
  resetHard,
  stageAll,
  stagePath,
  untrackedPaths,
} from '../git.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// Run git directly in a fixture, for the states the exported helpers cannot set
// up themselves (a staged-only change, a rename).
function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

describe('diffNumstat', () => {
  it('counts an unstaged edit against HEAD as tracked', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'README.md'), '# fixture\nmore\n')
    expect(diffNumstat(dir)).toEqual([{ added: 1, removed: 0, path: 'README.md', untracked: false }])
  })

  it('counts a file staged and then edited again once, as its net change', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'README.md'), '# fixture\none\n')
    git(dir, 'add', '-A')
    writeFileSync(join(dir, 'README.md'), '# fixture\none\ntwo\n')
    expect(diffNumstat(dir)).toEqual([{ added: 2, removed: 0, path: 'README.md', untracked: false }])
  })

  it('lists a non-ignored untracked file with its line count, flagged untracked', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'new.txt'), 'a\nb\nc')
    expect(diffNumstat(dir)).toEqual([{ added: 3, removed: 0, path: 'new.txt', untracked: true }])
  })

  it('counts an untracked binary file 0/0, the way numstat prints `-`', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47]))
    expect(diffNumstat(dir)).toEqual([{ added: 0, removed: 0, path: 'logo.png', untracked: true }])
  })

  it('leaves gitignored untracked files out', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, '.gitignore'), 'secret.txt\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'ignore')
    writeFileSync(join(dir, 'secret.txt'), 'shh\n')
    expect(diffNumstat(dir)).toEqual([])
  })

  it('splits a staged rename into two plain paths, never an arrow', () => {
    const dir = makeTempRepo()
    git(dir, 'mv', 'README.md', 'DOCS.md')
    const paths = diffNumstat(dir).map((e) => e.path).sort()
    expect(paths).toEqual(['DOCS.md', 'README.md'])
    expect(paths.join(' ')).not.toContain('=>')
  })

  it('is empty on a clean tree and outside a repo', () => {
    expect(diffNumstat(makeTempRepo())).toEqual([])
    expect(diffNumstat(makeTempDir())).toEqual([])
  })

  it('still lists untracked files when HEAD is unborn', () => {
    const dir = makeTempRepo({ commit: false })
    writeFileSync(join(dir, 'new.txt'), 'a\n')
    expect(diffNumstat(dir)).toEqual([{ added: 1, removed: 0, path: 'new.txt', untracked: true }])
  })
})

describe('diffPatch', () => {
  it('renders a staged new file and an untracked new file in one patch', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'staged.txt'), 'one\n')
    git(dir, 'add', '-A')
    writeFileSync(join(dir, 'loose.txt'), 'two\n')
    const patch = diffPatch(dir, diffNumstat(dir))
    expect(patch).toContain('+++ b/staged.txt')
    expect(patch).toContain('+++ b/loose.txt')
    expect(patch.match(/new file mode/g)).toHaveLength(2)
    expect(patch).toContain('+one')
    expect(patch).toContain('+two')
  })

  it('is empty for no entries and for a path that has vanished', () => {
    const dir = makeTempRepo()
    expect(diffPatch(dir, [])).toBe('')
    writeFileSync(join(dir, 'gone.txt'), 'x\n')
    const entries = diffNumstat(dir)
    rmSync(join(dir, 'gone.txt'))
    expect(diffPatch(dir, entries)).toBe('')
  })

  it('shows a rename as a delete plus an add', () => {
    const dir = makeTempRepo()
    git(dir, 'mv', 'README.md', 'DOCS.md')
    const patch = diffPatch(dir, diffNumstat(dir))
    expect(patch).toContain('--- a/README.md')
    expect(patch).toContain('+++ b/DOCS.md')
    expect(patch).not.toContain('rename from')
  })
})

describe('findRepoRoot', () => {
  it('returns the toplevel when cwd is inside a repo', () => {
    const dir = makeTempRepo()
    expect(findRepoRoot(dir)).toBe(realpathSync(dir))
  })

  it('returns null outside a git repo', () => {
    expect(findRepoRoot(makeTempDir())).toBeNull()
  })
})

describe('gitPath', () => {
  it('resolves a common-dir entry to an absolute path under .git', () => {
    const dir = makeTempRepo()
    // `--git-path` returns a path relative to `root`, joined onto the caller's
    // `root` verbatim (not canonicalized), so compare against `dir` as passed.
    expect(gitPath(dir, 'info/exclude')).toBe(join(dir, '.git', 'info', 'exclude'))
  })

  it('resolves common-dir entries to the shared gitdir from a linked worktree — D33 (info-exclude)', () => {
    const main = makeTempRepo()
    const wt = join(makeTempDir(), 'wt')
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', 'wt-branch'])
    // From the linked worktree, info/exclude must still point at the common gitdir,
    // not the per-worktree gitdir (which has no info/).
    expect(gitPath(wt, 'info/exclude')).toBe(join(realpathSync(main), '.git', 'info', 'exclude'))
  })
})

describe('hasCommit / headSha', () => {
  it('is false on an unborn HEAD and true once committed', () => {
    const dir = makeTempRepo({ commit: false })
    expect(hasCommit(dir)).toBe(false)
    const sha = commit(dir, 'first')
    expect(hasCommit(dir)).toBe(true)
    expect(headSha(dir)).toBe(sha)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('isDirty', () => {
  it('is clean after the initial commit and dirty after an edit', () => {
    const dir = makeTempRepo()
    expect(isDirty(dir)).toBe(false)
    writeFileSync(join(dir, 'README.md'), '# changed\n')
    expect(isDirty(dir)).toBe(true)
  })
})

describe('stageAll / untrackedPaths', () => {
  it('lists untracked files until they are staged', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'new.txt'), 'hi\n')
    expect(untrackedPaths(dir)).toEqual(['new.txt'])
    stageAll(dir)
    expect(untrackedPaths(dir)).toEqual([])
  })
})

describe('stagePath / isIgnored', () => {
  it('stages a tracked path and reports true', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'sub', 'a.txt'), 'a\n')
    expect(isIgnored(dir, join(dir, 'sub'))).toBe(false)
    expect(stagePath(dir, join(dir, 'sub'))).toBe(true)
    expect(untrackedPaths(dir)).not.toContain('sub/a.txt') // the add landed
  })

  it('skips a gitignored path, reporting false without throwing — the record-only guard', () => {
    const dir = makeTempRepo()
    // A repo that ignores the sidecar in its own .gitignore: git hard-refuses an
    // explicit `git add` of the folder (exit 1), so stagePath must skip it, not
    // die, and report that nothing staged.
    writeFileSync(join(dir, '.gitignore'), '/.plumbbob/\n')
    const ignored = join(dir, '.plumbbob', 'builds', 'x')
    mkdirSync(ignored, { recursive: true })
    writeFileSync(join(ignored, 'intent.md'), 'plan\n')
    expect(isIgnored(dir, ignored)).toBe(true)
    expect(() => stagePath(dir, ignored)).not.toThrow()
    expect(stagePath(dir, ignored)).toBe(false)
  })
})

describe('commit / resetHard', () => {
  it('rewinds the tree to a recorded checkpoint SHA', () => {
    const dir = makeTempRepo()
    const base = headSha(dir)
    writeFileSync(join(dir, 'README.md'), '# v2\n')
    stageAll(dir)
    const second = commit(dir, 'second')
    expect(second).not.toBe(base)
    resetHard(dir, base)
    expect(headSha(dir)).toBe(base)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('# fixture\n')
  })

  it('allows an empty commit (a step that staged nothing still checkpoints)', () => {
    const dir = makeTempRepo()
    const base = headSha(dir)
    expect(commit(dir, 'empty')).not.toBe(base)
  })
})

describe('commitsSince', () => {
  it('counts commits on HEAD since a SHA, and is 0 when HEAD is that SHA', () => {
    const dir = makeTempRepo()
    const base = headSha(dir)
    expect(commitsSince(dir, base)).toBe(0) // nothing since the checkpoint
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    stageAll(dir)
    commit(dir, 'one')
    writeFileSync(join(dir, 'b.txt'), 'b\n')
    stageAll(dir)
    commit(dir, 'two')
    expect(commitsSince(dir, base)).toBe(2) // two commits landed out of band
  })

  it('is 0 for an unknown SHA rather than throwing (best-effort, never a gate)', () => {
    const dir = makeTempRepo()
    expect(commitsSince(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(0)
  })

  it('counts a merge as one commit on the branch line, not the commits it carried', () => {
    const dir = makeTempRepo()
    const base = headSha(dir)
    // Two commits land on a side branch; merging them back is ONE event on the
    // branch's own line: the out-of-band-commit count `status` surfaces must
    // not read merged-in history as out-of-band work.
    execFileSync('git', ['-C', dir, 'checkout', '-q', '-b', 'side'], { stdio: 'ignore' })
    for (const name of ['s1', 's2']) {
      writeFileSync(join(dir, `${name}.txt`), `${name}\n`)
      stageAll(dir)
      commit(dir, name)
    }
    execFileSync('git', ['-C', dir, 'checkout', '-q', 'main'], { stdio: 'ignore' })
    execFileSync('git', ['-C', dir, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side'], { stdio: 'ignore' })
    expect(commitsSince(dir, base)).toBe(1)
  })
})
