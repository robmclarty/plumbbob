import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  commit,
  findRepoRoot,
  gitDir,
  hasCommit,
  headSha,
  isDirty,
  resetHard,
  stageAll,
  untrackedPaths,
} from '../git.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

describe('findRepoRoot', () => {
  it('returns the toplevel when cwd is inside a repo', () => {
    const dir = makeTempRepo()
    expect(findRepoRoot(dir)).toBe(realpathSync(dir))
  })

  it('returns null outside a git repo', () => {
    expect(findRepoRoot(makeTempDir())).toBeNull()
  })
})

describe('gitDir', () => {
  it('points at the repo .git directory', () => {
    const dir = makeTempRepo()
    expect(gitDir(dir)).toBe(join(realpathSync(dir), '.git'))
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
