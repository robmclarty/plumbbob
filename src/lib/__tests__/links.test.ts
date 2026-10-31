import { describe, expect, it } from 'vitest'
import { rerootLinks } from '../links.ts'

const FROM = '/r/.plumbbob'
const TO = '/r/.plumbbob/builds/x'

describe('rerootLinks', () => {
  it('re-aims a relative file link one directory deeper, keeping its fragment', () => {
    expect(rerootLinks('See [D5 (no-link-no-reconnect)](builds/x/intent.md#d5).', FROM, TO)).toBe(
      'See [D5 (no-link-no-reconnect)](intent.md#d5).',
    )
  })

  it('re-aims a relative file link with no fragment', () => {
    expect(rerootLinks('The [intent](builds/x/intent.md) file.', FROM, TO)).toBe('The [intent](intent.md) file.')
  })

  it('climbs further for a link that already climbed out of the source directory', () => {
    expect(rerootLinks('Read the [readme](../README.md).', FROM, TO)).toBe('Read the [readme](../../../README.md).')
  })

  it('re-aims an image the same way as a link', () => {
    expect(rerootLinks('![the card](media/card.png)', FROM, TO)).toBe('![the card](../../media/card.png)')
  })

  it('keeps a quoted title beside the moved target', () => {
    expect(rerootLinks('[intent](builds/x/intent.md "The intent")', FROM, TO)).toBe('[intent](intent.md "The intent")')
    expect(rerootLinks("[intent](builds/x/intent.md 'The intent')", FROM, TO)).toBe("[intent](intent.md 'The intent')")
  })

  it('leaves a URL, a mailto, a root-relative path, and a bare anchor alone', () => {
    const text = [
      '[site](https://plumbbob.dev/docs/a.md)',
      '[mail](mailto:hello@example.com)',
      '[root](/docs/a.md)',
      '[anchor](#summary)',
    ].join(' ')
    expect(rerootLinks(text, FROM, TO)).toBe(text)
  })

  it('leaves an empty target alone', () => {
    expect(rerootLinks('[nothing]()', FROM, TO)).toBe('[nothing]()')
  })

  it('leaves a link inside inline code alone while moving one outside it on the same line', () => {
    expect(rerootLinks('Write `[x](builds/x/intent.md)` to cite [it](builds/x/intent.md).', FROM, TO)).toBe(
      'Write `[x](builds/x/intent.md)` to cite [it](intent.md).',
    )
  })

  it('reads a double-backtick span as code up to its own closer', () => {
    expect(rerootLinks('``a ` [x](builds/x/intent.md)`` and [y](builds/x/intent.md)', FROM, TO)).toBe(
      '``a ` [x](builds/x/intent.md)`` and [y](intent.md)',
    )
  })

  it('treats a lone backtick as prose, so the link after it still moves', () => {
    expect(rerootLinks('a ` b [x](builds/x/intent.md)', FROM, TO)).toBe('a ` b [x](intent.md)')
  })

  it('leaves a link inside a backtick fence alone and moves the one after it', () => {
    const text = ['```md', '[x](builds/x/intent.md)', '```', '[y](builds/x/intent.md)'].join('\n')
    expect(rerootLinks(text, FROM, TO)).toBe(['```md', '[x](builds/x/intent.md)', '```', '[y](intent.md)'].join('\n'))
  })

  it('leaves a link inside a tilde fence alone', () => {
    const text = ['~~~', '[x](builds/x/intent.md)', '~~~', '[y](builds/x/intent.md)'].join('\n')
    expect(rerootLinks(text, FROM, TO)).toBe(['~~~', '[x](builds/x/intent.md)', '~~~', '[y](intent.md)'].join('\n'))
  })

  it('keeps a fence open past a shorter marker and closes it on a longer one', () => {
    const text = ['````', '```', '[x](builds/x/intent.md)', '```', '[still](builds/x/intent.md)', '`````', '[y](builds/x/intent.md)'].join(
      '\n',
    )
    expect(rerootLinks(text, FROM, TO)).toBe(
      ['````', '```', '[x](builds/x/intent.md)', '```', '[still](builds/x/intent.md)', '`````', '[y](intent.md)'].join('\n'),
    )
  })

  it('is the identity when the two directories are one, even spelled differently', () => {
    const text = 'See [D5 (no-link-no-reconnect)](builds/x/intent.md#d5).'
    expect(rerootLinks(text, FROM, FROM)).toBe(text)
    expect(rerootLinks(text, FROM, '/r/.plumbbob/builds/../')).toBe(text)
  })

  it('moves two links on one line', () => {
    expect(rerootLinks('[a](builds/x/intent.md#d1) and [b](../README.md#top)', FROM, TO)).toBe(
      '[a](intent.md#d1) and [b](../../../README.md#top)',
    )
  })

  it('returns text with no links byte for byte', () => {
    const text = '## Summary\n\nPlain prose, (parentheses), [brackets] and a trailing newline.\n'
    expect(rerootLinks(text, FROM, TO)).toBe(text)
  })

  it('moves a link back up when the copy goes the other way', () => {
    expect(rerootLinks('[intent](intent.md#d5)', TO, FROM)).toBe('[intent](builds/x/intent.md#d5)')
  })

  it('names the destination itself as `.` rather than as nothing', () => {
    expect(rerootLinks('[here](builds/x/)', FROM, TO)).toBe('[here](.)')
  })
})
