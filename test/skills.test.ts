// Static content-contract tests for the five skills (step 7). These parse the
// SKILL.md files directly — no fixture repos, no CLI subprocess — and assert the
// enforced contracts: D12 (fixed names, disable-model-invocation, model pins,
// status pre-injection, wrong-state refusal, /park is Bash-only) and D13 (the
// interrogate Open-questions-only and triage propose-then-confirm handoffs).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

// A minimal hand-rolled frontmatter split: `---` fence, `key: value` lines, body.
function parseSkill(dir: string): { data: Record<string, string>; body: string } {
  const src = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8')
  const lines = src.split('\n')
  if ((lines[0] ?? '').trim() !== '---') {
    return { data: {}, body: src }
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end === -1) {
    return { data: {}, body: src }
  }
  const data: Record<string, string> = {}
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? ''
    const colon = line.indexOf(':')
    if (colon === -1) {
      continue
    }
    data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return { data, body: lines.slice(end + 1).join('\n') }
}

const ALL = ['plumbbob-interrogate', 'park', 'plumbbob-triage', 'plumbbob-report', 'plumbbob-docs'] as const

const MODEL_PINS: Record<string, string> = {
  'plumbbob-interrogate': 'opus',
  park: 'haiku',
  'plumbbob-triage': 'opus',
  'plumbbob-report': 'opus',
  'plumbbob-docs': 'opus',
}

describe('every skill (the three reinforcing layers)', () => {
  for (const dir of ALL) {
    describe(dir, () => {
      const { data, body } = parseSkill(dir)

      it('names itself after its directory (D12: command name = directory name)', () => {
        expect(data.name).toBe(dir)
      })

      it('disables model invocation so the human owns every trigger', () => {
        expect(data['disable-model-invocation']).toBe('true')
      })

      it('pins the model per D12', () => {
        expect(data.model).toBe(MODEL_PINS[dir])
      })

      it('opens its body with the status pre-injection', () => {
        expect(body).toContain('!`plumbbob status`')
      })

      it('grants Bash(plumbbob status) so the pre-injection can run', () => {
        expect(data['allowed-tools']).toMatch(/Bash\(plumbbob status/)
      })

      it('carries a wrong-state refusal', () => {
        expect(body).toMatch(/refus/i)
      })
    })
  }
})

describe('plumbbob-interrogate — DESIGN-only, Open-questions-only (D13)', () => {
  const { data, body } = parseSkill('plumbbob-interrogate')

  it('is opus with Read + Edit and no Write', () => {
    expect(data.model).toBe('opus')
    expect(data['allowed-tools']).toMatch(/\bRead\b/)
    expect(data['allowed-tools']).toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).not.toMatch(/\bWrite\b/)
  })

  it('refuses outside DESIGN', () => {
    expect(body).toMatch(/DESIGN/)
  })

  it('appends only to Open questions, never to Decisions', () => {
    expect(body).toMatch(/open questions/i)
    expect(body).toMatch(/never[^\n]*decision/i)
  })

  it('ends its turn rather than resolving the holes', () => {
    expect(body).toMatch(/end (your|the|its) turn/i)
  })
})

describe('park — capture via the dumb CLI, never an edit (D12)', () => {
  const { data, body } = parseSkill('park')

  it('is pinned to haiku (transcription, not judgment)', () => {
    expect(data.model).toBe('haiku')
  })

  it('excludes Edit and Write from allowed-tools', () => {
    expect(data['allowed-tools']).not.toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).not.toMatch(/\bWrite\b/)
  })

  it('captures by shelling plumbbob park', () => {
    expect(data['allowed-tools']).toMatch(/Bash\(plumbbob park/)
    expect(body).toContain('plumbbob park')
  })

  it('requires in-turn human approval before the append', () => {
    expect(body).toMatch(/approv/i)
    expect(body).toMatch(/only after/i)
  })
})

describe('plumbbob-triage — propose, the human confirms (D13)', () => {
  const { data, body } = parseSkill('plumbbob-triage')

  it('is opus and DESIGN-only', () => {
    expect(data.model).toBe('opus')
    expect(body).toMatch(/DESIGN/)
  })

  it('offers the three classes with tangent as the default', () => {
    expect(body).toMatch(/blocker/)
    expect(body).toMatch(/tangent/)
    expect(body).toMatch(/pivot signal/)
    expect(body).toMatch(/default/i)
  })

  it('proposes but writes only after per-item confirmation', () => {
    expect(body).toMatch(/propose/i)
    expect(body).toMatch(/confirm/i)
    expect(body).toMatch(/only after/i)
  })
})

describe('plumbbob-report — FINISH, writes exactly report.md', () => {
  const { data, body } = parseSkill('plumbbob-report')

  it('is opus and may Write', () => {
    expect(data.model).toBe('opus')
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
  })

  it('writes exactly .plumbbob/report.md', () => {
    expect(body).toContain('.plumbbob/report.md')
  })

  it('tells the human to wrap when not in FINISH (D28)', () => {
    expect(body).toMatch(/FINISH/)
    expect(body).toContain('plumbbob wrap')
  })

  it('pins all five required sections', () => {
    expect(body).toMatch(/what shipped/i)
    expect(body).toMatch(/decisions and why/i)
    expect(body).toMatch(/parked items/i)
    expect(body).toMatch(/triag/i)
    expect(body).toMatch(/final status/i)
    expect(body).toMatch(/deferred tangents/i)
  })
})

describe('plumbbob-docs — FINISH-only, conservative by default (D19)', () => {
  const { data, body } = parseSkill('plumbbob-docs')

  it('is opus and may touch docs (Edit + Write)', () => {
    expect(data.model).toBe('opus')
    expect(data['allowed-tools']).toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
  })

  it('refuses outside FINISH', () => {
    expect(body).toMatch(/FINISH/)
  })

  it('is conservative by default', () => {
    expect(body).toMatch(/conservative/i)
    expect(body).toMatch(/bug fix/i)
  })
})
