import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { marketplacePlumbbob } from '../plugins.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// A fake $HOME with ~/.claude/plugins/installed_plugins.json holding `plugins`.
// `plugins` is passed through JSON.stringify verbatim so tests can write the
// malformed shapes (null, non-object) a real file might contain.
function makeHome(plugins: unknown): string {
  const home = makeTempDir()
  const dir = join(home, '.claude', 'plugins')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'installed_plugins.json'), JSON.stringify({ plugins }))
  return home
}

describe('marketplacePlumbbob', () => {
  it('matches the bare id and any marketplace-qualified id, nothing else', () => {
    const home = makeHome({
      'plumbbob': {},
      'plumbbob@robmclarty': {},
      'plumbbob@some-marketplace': {},
      'plumbbob-spike@robmclarty': {}, // shares the prefix but is a different plugin
      'plumbbobx': {}, // no separator — not ours
      'not-plumbbob@x': {},
    })
    expect(marketplacePlumbbob(home).sort()).toEqual([
      'plumbbob',
      'plumbbob@robmclarty',
      'plumbbob@some-marketplace',
    ])
  })

  it('returns [] when no installed plugin is plumbbob', () => {
    expect(marketplacePlumbbob(makeHome({ 'other@market': {} }))).toEqual([])
  })

  it('returns [] when the plugins key is missing or null', () => {
    // Both degenerate shapes mean "none installed", not a crash.
    const missing = makeTempDir()
    mkdirSync(join(missing, '.claude', 'plugins'), { recursive: true })
    writeFileSync(join(missing, '.claude', 'plugins', 'installed_plugins.json'), '{}')
    expect(marketplacePlumbbob(missing)).toEqual([])
    expect(marketplacePlumbbob(makeHome(null))).toEqual([])
  })

  it('returns [] when the file is absent', () => {
    expect(marketplacePlumbbob(makeTempDir())).toEqual([])
  })

  it('returns [] when the file is malformed JSON', () => {
    const home = makeTempDir()
    const dir = join(home, '.claude', 'plugins')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'installed_plugins.json'), '{not json')
    expect(marketplacePlumbbob(home)).toEqual([])
  })
})
