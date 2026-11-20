import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveString, resolveBoolean, resolveTrackedList, settingsPath, localSettingsPath } from '../settings.ts'
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

describe('resolveString', () => {
  it('falls back to the built-in default when no settings file exists', () => {
    expect(resolveString(makeTempDir(), 'check', 'pnpm run check')).toBe('pnpm run check')
  })

  it('reads the value from settings.json', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    expect(resolveString(dir, 'check', 'pnpm run check')).toBe('make ci')
  })

  it('lets settings.local.json override settings.json', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    writeLocal(dir, { check: 'make ci-fast' })
    expect(resolveString(dir, 'check', 'pnpm run check')).toBe('make ci-fast')
  })

  it('lets the flag override both files', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    writeLocal(dir, { check: 'make ci-fast' })
    expect(resolveString(dir, 'check', 'pnpm run check', 'make override')).toBe('make override')
  })

  it('ignores a blank or non-string value and returns the default', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: '   ' })
    expect(resolveString(dir, 'check', 'pnpm run check')).toBe('pnpm run check')
  })

  it('survives a malformed settings file by falling back to the default', () => {
    const dir = makeTempDir()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), '{ not json')
    expect(resolveString(dir, 'check', 'pnpm run check')).toBe('pnpm run check')
  })
})

describe('resolveBoolean', () => {
  it('falls back to the built-in default when no settings file exists', () => {
    expect(resolveBoolean(makeTempDir(), 'auto', false)).toBe(false)
  })

  it('reads the value from settings.json', () => {
    const dir = makeTempDir()
    writeProject(dir, { auto: true })
    expect(resolveBoolean(dir, 'auto', false)).toBe(true)
  })

  it('lets settings.local.json override settings.json', () => {
    const dir = makeTempDir()
    writeProject(dir, { auto: false })
    writeLocal(dir, { auto: true })
    expect(resolveBoolean(dir, 'auto', false)).toBe(true)
  })

  it('lets the flag override both files', () => {
    const dir = makeTempDir()
    writeLocal(dir, { auto: false })
    expect(resolveBoolean(dir, 'auto', false, true)).toBe(true)
  })

  it('ignores a non-boolean value and returns the default', () => {
    const dir = makeTempDir()
    writeProject(dir, { auto: 'yes' })
    expect(resolveBoolean(dir, 'auto', false)).toBe(false)
  })
})

describe('resolveTrackedList', () => {
  it('is empty when no settings file exists', () => {
    expect(resolveTrackedList(makeTempDir(), 'contractPaths')).toEqual([])
  })

  it('is empty when settings.json lacks the key', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual([])
  })

  it('reads the list from settings.json, in the order it is written', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: ['schemas/api.json', 'packages/shared/'] })
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual(['schemas/api.json', 'packages/shared/'])
  })

  it('never reads settings.local.json: an overlay cannot add a list the tracked file lacks', () => {
    const dir = makeTempDir()
    writeProject(dir, {})
    writeLocal(dir, { contractPaths: ['packages/shared/'] })
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual([])
  })

  it('never reads settings.local.json: an overlay cannot narrow or empty the tracked list', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: ['packages/shared/', 'schemas/api.json'] })
    writeLocal(dir, { contractPaths: ['schemas/api.json'] })
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual(['packages/shared/', 'schemas/api.json'])
    writeLocal(dir, { contractPaths: [] })
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual(['packages/shared/', 'schemas/api.json'])
  })

  it('is empty for a value that is not a list', () => {
    for (const value of ['packages/shared/', 3, true, null, { 0: 'packages/shared/' }]) {
      const dir = makeTempDir()
      writeProject(dir, { contractPaths: value })
      expect(resolveTrackedList(dir, 'contractPaths')).toEqual([])
    }
  })

  it('drops an entry that is not a non-blank string and keeps the others in order', () => {
    const dir = makeTempDir()
    writeProject(dir, { contractPaths: ['packages/shared/', 3, '', '   ', null, true, ['nested/'], { path: 'x' }, 'schemas/api.json'] })
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual(['packages/shared/', 'schemas/api.json'])
  })

  it('survives a malformed settings file by reading nothing', () => {
    const dir = makeTempDir()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(settingsPath(dir), '{ "contractPaths": ["packages/shared/"')
    expect(resolveTrackedList(dir, 'contractPaths')).toEqual([])
  })
})
