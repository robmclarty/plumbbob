// Static contract tests for the shipped examples. docs/happy-path.md tells one
// session's story and examples/rate-limit-the-login-endpoint/ holds the folder
// that session leaves behind, so the two have to describe the same build: the
// same proofs, and card links that point at the lines they name. The agent
// demos are held to the envelope docs/agents.md documents. No fixture repos,
// no CLI subprocess: these read the files as they ship.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseStepProof } from '../../src/lib/intent.ts'
import { parseSteps } from '../../src/lib/orient.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

const EXAMPLE = 'examples/rate-limit-the-login-endpoint'
const happyPath = read('docs/happy-path.md')
const intent = read(`${EXAMPLE}/intent.md`)
const buildLog = read(`${EXAMPLE}/build-log.md`)

/** Every `[<file>:<n>](...<slug>/<file>#L<n>)` link in the happy path, with the card line it sits on. */
function anchors(file: string): ReadonlyArray<{ readonly line: number; readonly on: string }> {
  const link = new RegExp(`\\[${file}:(\\d+)\\]\\([^)]*rate-limit-the-login-endpoint/${file}#L(\\d+)\\)`, 'g')
  return happyPath.split('\n').flatMap((on) =>
    [...on.matchAll(link)].map((m) => {
      expect(m[1]).toBe(m[2]) // the label and the fragment name one line
      return { line: Number(m[1]), on }
    }),
  )
}

describe('the rate-limit example is the build the happy path tells', () => {
  it('writes every step with a proof line, never the older clause', () => {
    expect(intent).not.toMatch(/done[- ]when/i)
    expect(buildLog).not.toMatch(/done[- ]when/i)
    const steps = parseSteps(intent)
    expect(steps).toHaveLength(3)
    for (const step of steps) {
      expect(parseStepProof(intent, step.n)).toMatchObject({ ok: true, proof: { text: expect.stringMatching(/\S/) } })
    }
  })

  it('carries the proofs the happy path prints, word for word', () => {
    const shown = happyPath.slice(happyPath.indexOf('## Steps'))
    const printed = parseSteps(shown.slice(0, shown.indexOf('```')))
    expect(printed.map((s) => s.proof)).toEqual(parseSteps(intent).map((s) => s.proof))
    expect(printed[0]?.proof?.command).toBe('pnpm vitest run limiter')
  })

  it('keeps the measured row for the step whose proof has a command', () => {
    expect(buildLog).toMatch(/^ {2}proof {8}met: `pnpm vitest run limiter` · exit 0 · \d+\.\ds$/m)
  })

  it('points every intent.md link in the happy path at the line it names', () => {
    const lines = intent.split('\n')
    const found = anchors('intent.md')
    expect(found.length).toBeGreaterThan(0)
    for (const { line, on } of found) {
      const named = /\*\*(Step|Range) (\d+)\*\*/.exec(on)
      expect(named, on).not.toBeNull()
      const opener = named?.[1] === 'Step' ? `${named[2]}. [x] ` : `${named?.[2]}. \`/plumbbob:`
      expect(lines[line - 1]?.startsWith(opener), `${on}\n  -> intent.md:${line} is ${JSON.stringify(lines[line - 1])}`).toBe(true)
    }
  })

  it('points every build-log.md link in the happy path at a dated Log line', () => {
    const lines = buildLog.split('\n')
    const found = anchors('build-log.md')
    expect(found.length).toBeGreaterThan(0)
    for (const { line, on } of found) {
      const sha = /\(([0-9a-f]{9}), details:/.exec(on)?.[1]
      expect(sha, on).toBeDefined()
      expect(lines[line - 1], on).toMatch(/^- 2026-07-03 — /)
      expect(lines[line - 1], on).toContain(sha)
    }
  })
})

describe('the agent demos speak the envelope as documented', () => {
  it('writes the demo spec with a proof line on every step', () => {
    const spec = read('examples/agents/ollama-reviewer/demo/spec.md')
    expect(spec).not.toMatch(/done[- ]when/i)
    const steps = parseSteps(spec)
    expect(steps.map((s) => s.planned)).toEqual([true, true, true])
    expect(steps.map((s) => s.proof?.command)).toEqual(['node --test', null, 'echo "some long text" | node bin/wrap.js 20'])
  })

  it.each(['reviewer', 'ollama-reviewer'])('%s: the demo envelope carries step.proof, and doneWhen is its text', (agent) => {
    const context = JSON.parse(read(`examples/agents/${agent}/demo/stepcontext.json`)) as {
      step: { proof?: { command: string | null; text: string }; doneWhen?: string }
    }
    expect(context.step.proof).toEqual({ command: 'node --test', text: expect.stringMatching(/^`node --test` /) })
    expect(context.step.doneWhen).toBe(context.step.proof?.text)
  })

  it.each(['reviewer', 'ollama-reviewer'])('%s: the prompt reads the proof, falling back to doneWhen', (agent) => {
    const source = read(`examples/agents/${agent}/review.mjs`)
    expect(source).toContain('step.proof?.text ?? step.doneWhen')
    expect(source).toContain('`Proof: ${proof}`')
    expect(source).not.toMatch(/done[- ]when/i)
  })
})
