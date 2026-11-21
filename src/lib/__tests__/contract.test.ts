import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { contractIssues, contractPaths, contractTouched, type ContractTree } from '../contract.ts'
import { localSettingsPath, settingsPath } from '../settings.ts'
import { sidecarDir } from '../sidecar.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

function writeProject(root: string, obj: unknown): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(settingsPath(root), JSON.stringify(obj))
}

function writeLocal(root: string, obj: unknown): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(localSettingsPath(root), JSON.stringify(obj))
}

describe('contractPaths — D164 (contract-paths)', () => {
  it('lists nothing when no settings file exists', () => {
    expect(contractPaths(makeTempDir())).toEqual([])
  })

  it('lists nothing when settings.json has no contractPaths', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    expect(contractPaths(dir)).toEqual([])
  })

  it('reads a file entry and a dir/ grant from settings.json, in the order it lists them', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: ['schemas/api.json', 'packages/shared/'] })
    expect(contractPaths(dir)).toEqual(['schemas/api.json', 'packages/shared/'])
  })

  it('ignores a settings.local.json that sets it where the tracked file does not', () => {
    const dir = makeTempDir()
    writeLocal(dir, { contractPaths: ['packages/shared/'] })
    expect(contractPaths(dir)).toEqual([])
  })

  it('ignores a settings.local.json that narrows, empties or replaces the tracked list', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: ['packages/shared/', 'schemas/api.json'] })
    for (const overlay of [['schemas/api.json'], [], ['src/other/'], 'none', null]) {
      writeLocal(dir, { contractPaths: overlay })
      expect(contractPaths(dir)).toEqual(['packages/shared/', 'schemas/api.json'])
    }
  })

  it('reads a value that is not a list as nothing', () => {
    for (const value of ['packages/shared/', 3, false, null, { a: 'packages/shared/' }]) {
      const dir = makeTempDir()
      writeProject(dir, { contractPaths: value })
      expect(contractPaths(dir)).toEqual([])
    }
  })

  it('reads an entry that is not a non-blank string as nothing, and keeps the rest', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: [7, 'packages/shared/', '', '  ', null, ['schemas/'], { path: 'schemas/' }, 'schemas/api.json'] })
    expect(contractPaths(dir)).toEqual(['packages/shared/', 'schemas/api.json'])
  })

  it('reads a malformed settings.json as nothing', () => {
    const dir = makeTempDir()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), '{ not json')
    expect(contractPaths(dir)).toEqual([])
  })

  it('trims an entry and drops a leading ./, as the seam parse does, and names an entry once', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: ['./packages/shared/', ' schemas/api.json ', 'packages/shared/', './'] })
    expect(contractPaths(dir)).toEqual(['packages/shared/', 'schemas/api.json'])
  })
})

describe('contractTouched — D164 (contract-paths)', () => {
  const contract = ['packages/shared/', 'schemas/api.json', 'src/generated/']

  it('names nothing when no path is under a contract entry', () => {
    expect(contractTouched(['src/cli.ts', 'README.md'], contract)).toEqual([])
  })

  it('names nothing for no paths, or for no contract', () => {
    expect(contractTouched([], contract)).toEqual([])
    expect(contractTouched(['packages/shared/types.ts'], [])).toEqual([])
  })

  it('covers a file entry by that exact file alone', () => {
    expect(contractTouched(['schemas/api.json'], contract)).toEqual(['schemas/api.json'])
    expect(contractTouched(['schemas/api.json/draft', 'schemas/other.json', 'docs/schemas/api.json'], contract)).toEqual([])
  })

  it('covers a dir/ grant by any file beneath it, at any depth', () => {
    expect(contractTouched(['packages/shared/types.ts'], contract)).toEqual(['packages/shared/'])
    expect(contractTouched(['packages/shared/a/b/c.ts'], contract)).toEqual(['packages/shared/'])
  })

  it('does not cover a dir/ grant by a sibling that shares its prefix, or by the directory named bare', () => {
    expect(contractTouched(['packages/shared-ui/button.ts', 'packages/shared'], contract)).toEqual([])
  })

  it('reads an entry with no trailing slash as a file, so it covers nothing beneath it', () => {
    expect(contractTouched(['packages/shared/types.ts'], ['packages/shared'])).toEqual([])
  })

  it('returns the entries in the order the setting lists them, whatever order the paths arrive in', () => {
    const paths = ['src/generated/client.ts', 'schemas/api.json', 'packages/shared/types.ts']
    expect(contractTouched(paths, contract)).toEqual(['packages/shared/', 'schemas/api.json', 'src/generated/'])
    expect(contractTouched([...paths].reverse(), contract)).toEqual(['packages/shared/', 'schemas/api.json', 'src/generated/'])
  })

  it('names an entry once however many paths it covers', () => {
    const paths = ['packages/shared/a.ts', 'src/cli.ts', 'packages/shared/b.ts', 'packages/shared/c/d.ts']
    expect(contractTouched(paths, contract)).toEqual(['packages/shared/'])
  })

  it('names an entry once when the contract lists it twice, at its first place', () => {
    const doubled = ['schemas/api.json', 'packages/shared/', 'schemas/api.json']
    expect(contractTouched(['packages/shared/a.ts', 'schemas/api.json'], doubled)).toEqual(['schemas/api.json', 'packages/shared/'])
  })

  it('names every entry that covers a path when two entries overlap', () => {
    const nested = ['packages/', 'packages/shared/types.ts']
    expect(contractTouched(['packages/shared/types.ts'], nested)).toEqual(['packages/', 'packages/shared/types.ts'])
    expect(contractTouched(['packages/app/main.ts'], nested)).toEqual(['packages/'])
  })

  it('leaves both lists as it found them', () => {
    const paths = ['schemas/api.json', 'packages/shared/a.ts']
    const listed = [...contract]
    contractTouched(paths, listed)
    expect(paths).toEqual(['schemas/api.json', 'packages/shared/a.ts'])
    expect(listed).toEqual(contract)
  })
})

// A tree of the named files and folders (a folder ends on a slash), and nothing else.
function treeOf(...names: ReadonlyArray<string>): ContractTree {
  const folders = new Set(names.filter((n) => n.endsWith('/')).map((n) => n.slice(0, -1)))
  const files = new Set(names.filter((n) => !n.endsWith('/')))
  return { exists: (path) => folders.has(path) || files.has(path), isDirectory: (path) => folders.has(path) }
}

describe('contractIssues — D164 (contract-paths)', () => {
  const tree = treeOf('packages/shared/', 'schemas/', 'schemas/api.json')

  it('finds nothing wrong with a file that is a file and a grant that is a folder', () => {
    expect(contractIssues(['packages/shared/', 'schemas/api.json'], tree)).toEqual([])
    expect(contractIssues([], tree)).toEqual([])
  })

  it('names an entry the seam grammar refuses, with what it is and the remedy', () => {
    const issues = contractIssues(['src/**/*.ts', '/etc/passwd', 'a\\b.ts', 'packages/../secrets/'], tree)
    expect(issues.map((i) => [i.entry, i.kind, i.words])).toEqual([
      ['src/**/*.ts', 'refused', 'is a glob; an entry is a file or a `dir/` grant'],
      ['/etc/passwd', 'refused', 'is absolute; an entry is a file or a `dir/` grant'],
      ['a\\b.ts', 'refused', 'holds a backslash; an entry is a file or a `dir/` grant'],
      ['packages/../secrets/', 'refused', 'has an empty, `.` or `..` segment; an entry is a file or a `dir/` grant'],
    ])
    expect(issues.every((i) => i.fix === 'name the file, or the folder as `dir/`')).toBe(true)
  })

  it('names a folder written with no trailing slash, which would be read as a file and match nothing', () => {
    expect(contractIssues(['packages/shared'], tree)).toEqual([
      {
        entry: 'packages/shared',
        kind: 'mistyped',
        words: 'names a folder, and an entry with no trailing slash is read as a file',
        fix: 'write it `packages/shared/`',
      },
    ])
  })

  it('names a file written with a trailing slash, which would be read as a folder', () => {
    expect(contractIssues(['schemas/api.json/'], tree)).toEqual([
      {
        entry: 'schemas/api.json/',
        kind: 'mistyped',
        words: 'names a file, and an entry with a trailing slash is read as a folder',
        fix: 'write it `schemas/api.json`',
      },
    ])
  })

  it('reports an entry that names nothing in the tree with no fix, since a path still to be created reads the same', () => {
    expect(contractIssues(['pakages/shared/', 'schemas/next.json'], tree)).toEqual([
      { entry: 'pakages/shared/', kind: 'missing', words: 'names nothing in the tree yet', fix: null },
      { entry: 'schemas/next.json', kind: 'missing', words: 'names nothing in the tree yet', fix: null },
    ])
  })

  it("keeps the setting's order, and leaves the sound entries out", () => {
    const issues = contractIssues(['schemas/', 'packages/shared', 'schemas/api.json', 'src/*'], tree)
    expect(issues.map((i) => i.entry)).toEqual(['packages/shared', 'src/*'])
  })
})
