import { describe, expect, it } from 'vitest'
import { conventionalSubject, parseConventionalTitle, subjectFromTitle, withMarker } from '../commitmsg.ts'

describe('parseConventionalTitle', () => {
  it('splits a full `type(scope): description` prefix', () => {
    expect(parseConventionalTitle('feat(escape-hatch): add the bail-out flag')).toEqual({
      type: 'feat',
      scope: 'escape-hatch',
      breaking: false,
      description: 'add the bail-out flag',
    })
  })

  it('splits a type-only prefix, leaving the scope null for the caller to fill', () => {
    expect(parseConventionalTitle('fix: correct the off-by-one')).toEqual({
      type: 'fix',
      scope: null,
      breaking: false,
      description: 'correct the off-by-one',
    })
  })

  it('captures the breaking-change `!` marker', () => {
    expect(parseConventionalTitle('feat(api)!: drop the legacy field')).toEqual({
      type: 'feat',
      scope: 'api',
      breaking: true,
      description: 'drop the legacy field',
    })
  })

  it('does NOT misread a prose title whose first word is not a recognised type', () => {
    // `Note` is not in the type vocabulary: the whole title stays the description.
    expect(parseConventionalTitle('Note: rewire the cache')).toEqual({
      type: null,
      scope: null,
      breaking: false,
      description: 'Note: rewire the cache',
    })
  })

  it('returns a bare prose title whole', () => {
    expect(parseConventionalTitle('Add the widget')).toEqual({
      type: null,
      scope: null,
      breaking: false,
      description: 'Add the widget',
    })
  })
})

describe('conventionalSubject', () => {
  it('assembles `type(scope): description`', () => {
    expect(conventionalSubject({ type: 'feat', scope: 'widget', description: 'add it' })).toBe('feat(widget): add it')
  })

  it('omits the scope segment when there is no scope', () => {
    expect(conventionalSubject({ type: 'chore', scope: null, description: 'finish' })).toBe('chore: finish')
  })

  it('emits the `!` breaking marker after the scope', () => {
    expect(conventionalSubject({ type: 'feat', scope: 'api', breaking: true, description: 'drop it' })).toBe(
      'feat(api)!: drop it',
    )
  })
})

describe('subjectFromTitle', () => {
  it('honours an author-written prefix verbatim, its scope winning over the build scope', () => {
    expect(subjectFromTitle('fix(parser): handle empty seam', 'feat', 'escape-hatch')).toBe(
      'fix(parser): handle empty seam',
    )
  })

  it('fills a type-only prefix with the build scope', () => {
    expect(subjectFromTitle('fix: correct the off-by-one', 'feat', 'escape-hatch')).toBe(
      'fix(escape-hatch): correct the off-by-one',
    )
  })

  it('defaults the type and de-capitalises a sentence-case bare title', () => {
    expect(subjectFromTitle('Add the bail-out flag', 'feat', 'escape-hatch')).toBe(
      'feat(escape-hatch): add the bail-out flag',
    )
  })

  it('leaves an all-caps acronym opener alone', () => {
    expect(subjectFromTitle('API rework', 'feat', 'core')).toBe('feat(core): API rework')
  })

  it('omits the scope when none resolves', () => {
    expect(subjectFromTitle('Build the widget', 'feat', null)).toBe('feat: build the widget')
  })
})

describe('withMarker', () => {
  it('prepends the marker and a blank line to a body', () => {
    expect(withMarker('plumbbob step 1', 'done when: ok')).toBe('plumbbob step 1\n\ndone when: ok')
  })

  it('returns the marker alone when the body is empty or absent', () => {
    expect(withMarker('plumbbob plan')).toBe('plumbbob plan')
    expect(withMarker('plumbbob plan', '')).toBe('plumbbob plan')
    expect(withMarker('plumbbob plan', '   ')).toBe('plumbbob plan')
  })
})
