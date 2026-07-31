// The CLI surface is written down in three places: the VERBS spec in
// cli-core.ts (which drives `--help` and the unknown-flag refusal), the synopsis
// table in docs/cli-reference.md, and the hand-maintained verbDef literal in
// site/api.html. There is no generator, so they drift silently — api.html was
// already missing four verbs, and both docs claimed every session verb took
// `--build` when four of them refuse it.
//
// This pins the thing that actually matters: the set of flags. Comparing flag
// names rather than whole synopsis strings keeps the test from failing on
// whitespace or prose edits while still catching a flag that exists in one
// place and not another — which is what sends a reader (or an agent) to type a
// flag the CLI will now refuse.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { verbNames, verbSpec } from '../../src/cli-core.ts'

const REFERENCE = readFileSync(fileURLToPath(new URL('../../docs/cli-reference.md', import.meta.url)), 'utf8')
const API_HTML = readFileSync(fileURLToPath(new URL('../../site/api.html', import.meta.url)), 'utf8')

/** Every distinct `--flag` / `-m`-style token in a chunk of text, as a sorted list. */
function flagsIn(text: string): ReadonlyArray<string> {
  return [...new Set(text.match(/(?<![\w-])--?[a-z][a-z-]*/g) ?? [])].sort()
}

/** The flag names a verb's spec declares, sorted to match flagsIn. */
function declaredFlags(name: string): ReadonlyArray<string> {
  const spec = verbSpec(name)
  return [...new Set((spec?.flags ?? []).map((f) => f.name))].sort()
}

/** The `| \`verb\` | \`synopsis\` |` cell from the "Verbs at a glance" table. */
function referenceSynopsis(name: string): string | null {
  const row = new RegExp(`^\\| \`${name}\` \\| (.+?) \\| `, 'm').exec(REFERENCE)
  return row?.[1] ?? null
}

/** The synopsis string from api.html's verbDef literal. */
function apiSynopsis(name: string): string | null {
  const row = new RegExp(`\\['${name}', '((?:[^'\\\\]|\\\\.)*)'`, 'm').exec(API_HTML)
  return row?.[1] ?? null
}

describe('docs/cli-reference.md matches the CLI spec', () => {
  it('documents every verb', () => {
    for (const name of verbNames()) {
      expect(referenceSynopsis(name), `${name} missing from the verb table`).not.toBeNull()
    }
  })

  it('gives every verb its own section, so --help can point at an anchor', () => {
    // formatVerbHelp emits `See: docs/cli-reference.md#<verb>` — a dead anchor
    // would send the reader nowhere.
    for (const name of verbNames()) {
      expect(REFERENCE, `no '### ${name}' heading`).toContain(`### ${name}\n`)
    }
  })

  it('lists exactly the flags each verb declares', () => {
    for (const name of verbNames()) {
      const synopsis = referenceSynopsis(name) as string
      expect(flagsIn(synopsis), `${name} synopsis`).toEqual(declaredFlags(name))
    }
  })
})

describe('site/api.html matches the CLI spec', () => {
  it('documents every verb', () => {
    for (const name of verbNames()) {
      expect(apiSynopsis(name), `${name} missing from verbDef`).not.toBeNull()
    }
  })

  it('lists exactly the flags each verb declares', () => {
    for (const name of verbNames()) {
      const synopsis = apiSynopsis(name) as string
      expect(flagsIn(synopsis), `${name} synopsis`).toEqual(declaredFlags(name))
    }
  })
})
