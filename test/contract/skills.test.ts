// Static content-contract tests for the skills (step 7). These parse the
// SKILL.md files directly — no fixture repos, no CLI subprocess — and assert the
// enforced contracts: D12 (fixed names, disable-model-invocation, model pins,
// status pre-injection, wrong-state refusal, /park is Bash-only) and the
// refine/harvest propose-then-confirm handoffs.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills')

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

const ALL = ['pb-refine', 'pb-park', 'pb-harvest'] as const

const MODEL_PINS: Record<string, string> = {
  'pb-refine': 'opus',
  'pb-park': 'haiku',
  'pb-harvest': 'opus',
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

      it('opens its body with the status pre-injection (bin placeholder, resolved at setup)', () => {
        expect(body).toContain('!`plumbbob status 2>/dev/null')
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

// The driver skills: human-fired chat triggers for the transition verbs
// (A). They are pure mechanism — shell one verb, report it verbatim — and so are
// pinned to haiku, disable model invocation, and carry no Edit/Write.
// The surviving thin drivers: status (orient) plus the optional power moves
// revert and spike. build is the default engine (own contract); the superseded
// start/review/done drivers were removed in step 8.
const DRIVER_VERB: Record<string, string> = {
  'pb-status': 'status',
  'pb-revert': 'revert',
  'pb-spike': 'spike',
}

describe('driver skills — the human fires the transition from the chat', () => {
  for (const dir of Object.keys(DRIVER_VERB)) {
    describe(dir, () => {
      const { data, body } = parseSkill(dir)
      const verb = DRIVER_VERB[dir]

      it('names itself after its directory (D12)', () => {
        expect(data.name).toBe(dir)
      })

      it('disables model invocation so only the human fires the transition', () => {
        expect(data['disable-model-invocation']).toBe('true')
      })

      it('is pinned to haiku (pure mechanism, not judgment)', () => {
        expect(data.model).toBe('haiku')
      })

      it('grants exactly its verb + status, and no Edit/Write', () => {
        expect(data['allowed-tools']).toContain(`Bash(plumbbob ${verb}`)
        expect(data['allowed-tools']).toContain('Bash(plumbbob status')
        expect(data['allowed-tools']).not.toMatch(/\bEdit\b/)
        expect(data['allowed-tools']).not.toMatch(/\bWrite\b/)
      })

      it('opens with the status pre-injection and shells the verb in its body', () => {
        expect(body).toContain('!`plumbbob status 2>/dev/null')
        expect(body).toContain(`plumbbob ${verb}`)
      })

      it('defers to the CLI: reports verbatim, never retries or works around a refusal', () => {
        expect(body).toMatch(/verbatim/i)
        expect(body).toMatch(/never retry/i)
      })
    })
  }
})

describe('finish — the close-out: report by default, final commit, clear (D9/D15)', () => {
  const { data, body } = parseSkill('pb-finish')

  it('names itself, disables model invocation, is opus', () => {
    expect(data.name).toBe('pb-finish')
    expect(data['disable-model-invocation']).toBe('true')
    expect(data.model).toBe('opus')
  })

  it('opens with the status pre-injection', () => {
    expect(body).toContain('!`plumbbob status 2>/dev/null')
  })

  it('writes the report (Write) and shells finish', () => {
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
    expect(data['allowed-tools']).toContain('plumbbob finish')
  })

  it('writes the report by default, never a gate (D9)', () => {
    expect(body).toMatch(/report by default/i)
    expect(body).toMatch(/gate/i)
  })

  it('keeps the folder as the record, never destroys (C4/D8)', () => {
    expect(body).toMatch(/archive/i) // "the folder IS the archive" — the record survives
    expect(body).toMatch(/clear/i)
  })

  it('pins the required report sections', () => {
    expect(body).toMatch(/what shipped/i)
    expect(body).toMatch(/decisions/i)
    expect(body).toMatch(/final status/i)
  })
})

describe('plan — the whole-goal move: scaffold + frame, no code', () => {
  const { data, body } = parseSkill('pb-plan')

  it('names itself, disables model invocation, is opus', () => {
    expect(data.name).toBe('pb-plan')
    expect(data['disable-model-invocation']).toBe('true')
    expect(data.model).toBe('opus')
  })

  it('opens with the status pre-injection', () => {
    expect(body).toContain('!`plumbbob status 2>/dev/null')
  })

  it('scaffolds via start and authors intent (Edit/Write)', () => {
    expect(data['allowed-tools']).toContain('plumbbob start')
    expect(data['allowed-tools']).toMatch(/\bEdit\b/)
  })

  it('authors the whole plan up front — frame, decisions, constraints, and steps', () => {
    expect(body).toMatch(/frame/i)
    expect(body).toMatch(/decisions/i)
    expect(body).toMatch(/constraints/i)
    expect(body).toMatch(/## Steps/)
    expect(body).toMatch(/done.?when/i)
    expect(body).toMatch(/seam/i)
  })

  it('disambiguates the three input modes (interview / file / inline)', () => {
    expect(body).toMatch(/interview/i)
    expect(body).toMatch(/\bfile\b/i)
    expect(body).toMatch(/inline|free-form|expand/i)
  })

  it('offers /pb-refine to stress-test the frame', () => {
    expect(body).toMatch(/\/pb-refine/)
  })

  it('keeps the human the converger — holes are Open questions, not guesses', () => {
    expect(body).toMatch(/open question/i)
    expect(body).toMatch(/human/i)
  })
})

describe('step — the single-increment move: one verifiable step', () => {
  const { data, body } = parseSkill('pb-step')

  it('names itself, disables model invocation, is opus', () => {
    expect(data.name).toBe('pb-step')
    expect(data['disable-model-invocation']).toBe('true')
    expect(data.model).toBe('opus')
  })

  it('opens with the status pre-injection', () => {
    expect(body).toContain('!`plumbbob status 2>/dev/null')
  })

  it('proposes a step with a done-when and a seam', () => {
    expect(body).toMatch(/done.?when/i)
    expect(body).toMatch(/seam/i)
  })

  it('writes ## Steps in the standard format the parser reads', () => {
    expect(body).toMatch(/## Steps/)
    expect(body).toMatch(/done when:/i)
  })

  it('revises/sharpens the next step — empty input runs an automatic sharpen', () => {
    expect(body).toMatch(/sharpen/i)
    expect(body).toMatch(/revis/i)
    expect(body).toMatch(/no input|empty/i)
  })

  it('handles one increment at a time and waits for the human to approve', () => {
    expect(body).toMatch(/\bone\b/i)
    expect(body).toMatch(/approv|decide/i)
  })
})

describe('build — the default engine: implement the planned step, then verify', () => {
  const { data, body } = parseSkill('pb-build')

  it('names itself after its directory and disables model invocation', () => {
    expect(data.name).toBe('pb-build')
    expect(data['disable-model-invocation']).toBe('true')
  })

  it('is opus (implementing a decided step is judgment-laden)', () => {
    expect(data.model).toBe('opus')
  })

  it('opens with the status pre-injection', () => {
    expect(body).toContain('!`plumbbob status 2>/dev/null')
  })

  it('can implement (Edit/Write) and drive build + the verify tick', () => {
    expect(data['allowed-tools']).toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
    expect(data['allowed-tools']).toContain('plumbbob build')
    expect(data['allowed-tools']).toContain('plumbbob checkpoint')
  })

  it('declares itself swappable — the executor is pluggable (D3)', () => {
    expect(body).toMatch(/swappable/i)
    expect(body).toMatch(/by hand|vibed|another harness/i)
  })

  it('builds the decided step and parks new ideas instead of sprawling', () => {
    expect(body).toMatch(/done.?when/i)
    expect(body).toMatch(/\/pb-park/)
  })

  it('defaults to ending at the verify pause for the human to approve', () => {
    expect(body).toMatch(/pause/i)
    expect(body).toMatch(/approv/i)
  })

  it('documents --auto as the explicit self-approve opt-in that chains', () => {
    expect(body).toMatch(/--auto/)
    expect(body).toMatch(/chain|continue/i)
  })
})

describe('verify — the tick: check, self-review, validate, PAUSE, checkpoint', () => {
  const { data, body } = parseSkill('pb-verify')

  it('names itself after its directory and disables model invocation', () => {
    expect(data.name).toBe('pb-verify')
    expect(data['disable-model-invocation']).toBe('true')
  })

  it('is opus (the self-review is judgment, not mechanism)', () => {
    expect(data.model).toBe('opus')
  })

  it('opens with the status pre-injection', () => {
    expect(body).toContain('!`plumbbob status 2>/dev/null')
  })

  it('grants the check + checkpoint verbs and a way to read the diff', () => {
    expect(data['allowed-tools']).toContain('plumbbob check')
    expect(data['allowed-tools']).toContain('plumbbob checkpoint')
    expect(data['allowed-tools']).toMatch(/git diff/)
  })

  it('carries the check → self-review → validate → PAUSE → checkpoint contract', () => {
    expect(body).toMatch(/self-review/i)
    expect(body).toMatch(/done.?when/i)
    expect(body).toMatch(/pause/i)
    expect(body).toMatch(/approv/i)
  })

  it('reads the diff, not the author (D3 executor-agnostic)', () => {
    expect(body).toMatch(/diff, not the author/i)
  })

  it('leaves version bumps to the human (no auto /version)', () => {
    expect(body).toMatch(/version/i)
  })
})

describe('refine — keep intent.md true: attack for holes + repair drift', () => {
  const { data, body } = parseSkill('pb-refine')

  it('is opus with Read + Edit and no Write', () => {
    expect(data.model).toBe('opus')
    expect(data['allowed-tools']).toMatch(/\bRead\b/)
    expect(data['allowed-tools']).toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).not.toMatch(/\bWrite\b/)
  })

  it('works at any point, refusing only with no active session', () => {
    expect(body).toMatch(/any point/i)
    expect(body).toMatch(/no active session/i)
  })

  it('surfaces holes as Open questions and leaves Decisions to the human', () => {
    expect(body).toMatch(/open questions/i)
    expect(body).toMatch(/decision/i)
    expect(body).toMatch(/converge|propose/i)
  })

  it('can repair the plan to re-sync with reality, human-approved', () => {
    expect(body).toMatch(/repair/i)
    expect(body).toMatch(/approv/i)
  })
})

describe('park — capture via the dumb CLI, never an edit', () => {
  const { data, body } = parseSkill('pb-park')

  it('is pinned to haiku (transcription, not judgment)', () => {
    expect(data.model).toBe('haiku')
  })

  it('excludes Edit and Write from allowed-tools', () => {
    expect(data['allowed-tools']).not.toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).not.toMatch(/\bWrite\b/)
  })

  it('captures by shelling the park verb', () => {
    expect(data['allowed-tools']).toMatch(/Bash\(plumbbob park/)
    expect(body).toContain('plumbbob park')
  })

  it('requires in-turn human approval before the append', () => {
    expect(body).toMatch(/approv/i)
    expect(body).toMatch(/only after/i)
  })
})

describe('harvest — propose, the human confirms', () => {
  const { data, body } = parseSkill('pb-harvest')

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

// plumbbob-report and plumbbob-docs were folded into /plumbbob:pb-finish (D9) and removed.
// plumbbob-interrogate was renamed /plumbbob:pb-refine and broadened (attack + repair);
// report/docs do not survive.
