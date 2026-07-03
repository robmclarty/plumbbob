import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveString, resolveBoolean, settingsPath, localSettingsPath } from '../settings.ts'
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
