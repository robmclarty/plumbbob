import { describe, expect, it } from 'vitest'
import { evaluateCommitBody, readCommitBody, SOCKET_REFUSAL } from '../commitbody.ts'

function throwingRead(): string {
  throw new Error('read must not be called for this shape')
}

describe('evaluateCommitBody — the fd-0 shape decision', () => {
  it('no --body flag: null body, whatever the shape — read is never called', () => {
    expect(evaluateCommitBody(false, 'other', throwingRead)).toEqual({ ok: true, body: null })
    expect(evaluateCommitBody(false, 'socket', throwingRead)).toEqual({ ok: true, body: null })
  })

  it('a TTY skips the read — a terminal never sends EOF', () => {
    expect(evaluateCommitBody(true, 'tty', throwingRead)).toEqual({ ok: true, body: null })
  })

  it('a socket refuses instead of blocking, naming the heredoc form', () => {
    const result = evaluateCommitBody(true, 'socket', throwingRead)
    expect(result).toEqual({ ok: false, message: SOCKET_REFUSAL })
    if (!result.ok) {
      expect(result.message).toContain("<<'BODY'")
    }
  })

  it('any other shape (heredoc, pipe, /dev/null) reads to EOF and trims the end', () => {
    expect(evaluateCommitBody(true, 'other', () => '  the body  \n')).toEqual({ ok: true, body: '  the body' })
  })

  it('an empty read degrades to the caller\'s own fallback body', () => {
    expect(evaluateCommitBody(true, 'other', () => '   \n')).toEqual({ ok: true, body: null })
  })

  it('a read error (no stdin attached) degrades to the fallback rather than failing', () => {
    expect(
      evaluateCommitBody(true, 'other', () => {
        throw new Error('no stdin')
      }),
    ).toEqual({ ok: true, body: null })
  })
})

describe('readCommitBody — the real fd 0', () => {
  it('with no --body flag, never touches the fallback: always null', () => {
    expect(readCommitBody(['1'])).toEqual({ ok: true, body: null })
    expect(readCommitBody([])).toEqual({ ok: true, body: null })
  })
})
