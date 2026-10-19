// Static content-contract tests for the skills (step 7). These parse the
// SKILL.md files directly — no fixture repos, no CLI subprocess — and assert the
// enforced contracts: fixed names, disable-model-invocation, the D63
// (no-model-pins) model policy (clerks pin haiku; judgment skills inherit the
// session model),
// status pre-injection, wrong-state refusal, /park is Bash-only, and the
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

const ALL = ['refine', 'park', 'harvest'] as const

// The model policy — D63 (no-model-pins): mechanical clerks pin haiku; the judgment moves carry
// no pin and inherit the session model — a pin is a ceiling as much as a floor.
const MODEL_PINS: Record<string, string | undefined> = {
  'refine': undefined,
  'park': 'haiku',
  'harvest': undefined,
}

describe('every skill (the three reinforcing layers)', () => {
  for (const dir of ALL) {
    describe(dir, () => {
      const { data, body } = parseSkill(dir)

      it('names itself after its directory (command name = directory name)', () => {
        expect(data.name).toBe(dir)
      })

      it('disables model invocation so the human owns every trigger', () => {
        expect(data['disable-model-invocation']).toBe('true')
      })

      it('follows the model policy — D63 (no-model-pins): clerks pin haiku, judgment inherits', () => {
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
// The thin drivers: status (orient) plus the optional power moves revert,
// spike, recover, and abandon. build is the default engine (own contract); the
// superseded start/review/done drivers are gone.
const DRIVER_VERB: Record<string, string> = {
  'status': 'status',
  'revert': 'revert',
  'spike': 'spike',
  'recover': 'recover',
  'abandon': 'abandon',
  'order': 'order',
}

describe('driver skills — the human fires the transition from the chat', () => {
  for (const dir of Object.keys(DRIVER_VERB)) {
    describe(dir, () => {
      const { data, body } = parseSkill(dir)
      const verb = DRIVER_VERB[dir]

      it('names itself after its directory', () => {
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

describe('finish — the close-out: report by default, final commit, clear — D9 (finish-no-gate) / D29 (finish-replaces-wrap)', () => {
  const { data, body } = parseSkill('finish')

  it('names itself, disables model invocation, inherits the session model — D63 (no-model-pins)', () => {
    expect(data.name).toBe('finish')
    expect(data['disable-model-invocation']).toBe('true')
    expect(data.model).toBeUndefined()
  })

  it('opens with the status pre-injection', () => {
    expect(body).toContain('!`plumbbob status 2>/dev/null')
  })

  it('writes the report (Write) and shells finish', () => {
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
    expect(data['allowed-tools']).toContain('plumbbob finish')
  })

  it('records a stop card still waiting through plumbbob harvest before the report — D102 (settle-in-one-reply)', () => {
    expect(data['allowed-tools']).toContain('Bash(plumbbob harvest:*)')
    const settle = body.indexOf('**Settle a stop card still waiting.**')
    expect(settle).toBeGreaterThan(-1)
    expect(settle).toBeLessThan(body.indexOf('**Write the report**'))
    expect(body).toMatch(/`# Detail · Range <N>` header/)
    expect(body).toMatch(/then run `plumbbob harvest`/)
  })

  it('writes the report by default, never a gate — D9 (finish-no-gate)', () => {
    expect(body).toMatch(/report by default/i)
    expect(body).toMatch(/gate/i)
  })

  it('keeps the folder as the record, never destroys — C4 (never-destroy) / D29 (finish-replaces-wrap)', () => {
    expect(body).toMatch(/archive/i) // "the folder IS the archive" — the record survives
    expect(body).toMatch(/clear/i)
  })

  it('pins the required report sections', () => {
    expect(body).toMatch(/what shipped/i)
    expect(body).toMatch(/decisions/i)
    expect(body).toMatch(/final status/i)
  })

  it('copies each Decision slug into the report — never a bare D#', () => {
    expect(body).toMatch(/never a bare/i)
    expect(body).toMatch(/D# \(slug\)/) // the copy-the-slug instruction
  })
})

describe('plan — the whole-goal move: scaffold + frame, no code', () => {
  const { data, body } = parseSkill('plan')

  it('names itself, disables model invocation, inherits the session model — D63 (no-model-pins)', () => {
    expect(data.name).toBe('plan')
    expect(data['disable-model-invocation']).toBe('true')
    expect(data.model).toBeUndefined()
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

  it('offers /refine to stress-test the frame', () => {
    expect(body).toMatch(/\/(?:plumbbob:)?refine/) // namespaced or bare — the handoff is what matters
  })

  it('keeps the human the converger — holes are Open questions, not guesses', () => {
    expect(body).toMatch(/open question/i)
    expect(body).toMatch(/human/i)
  })

  it('carries the glossed-reference house style — slug at birth, never a bare ref, plain/lean holes', () => {
    expect(body).toMatch(/slug .*at birth/i) // mint the slug where the item is born
    expect(body).toMatch(/never a bare/i) // no bare D4/C6/Q2 reference — always the gloss
    expect(body).toContain('*plain:*') // Open questions author the expanded form
    expect(body).toContain('*lean:*')
  })

  it('names the latch on the plan commit, incl. the first-plan-of-session seam — D64 (approval-latch)', () => {
    expect(body).toMatch(/latch/i)
    expect(body).toMatch(/git commit/) // never route around it with a raw git commit
    expect(body).toMatch(/guidance-governed/i) // the documented first-plan-of-session seam
  })

  it('discloses the tracked builds/ folder at close-out and offers --local (disclosed, not discovered)', () => {
    expect(body).toMatch(/rides this branch into the PR/i)
    expect(body).toMatch(/teammates/i)
    expect(body).toMatch(/start --local/)
  })

  it('surfaces the plan-time gate warning while the human is still deciding (research/07 2a)', () => {
    expect(body).toMatch(/gate sees no code checks/i)
    expect(body).toMatch(/"check": "npm test"/)
  })

  it('authors the title as the commit subject — type(scope): desc, paths in seam, scope default + ≤72 — D68 (conventional-subjects)', () => {
    expect(body).toMatch(/type\(scope\):\s+description/) // the title IS the subject shape
    expect(body).toMatch(/never jammed into the title/i) // load-bearing paths leave the title
    expect(body).toMatch(/\*\*Scope:\*\*/) // the build-default scope header a step overrides
    expect(body).toMatch(/≤ ?72/) // the soft GitHub subject aim, no lint, no gate
  })
})

describe('step — the single-increment move: one verifiable step', () => {
  const { data, body } = parseSkill('step')

  it('names itself, disables model invocation, inherits the session model — D63 (no-model-pins)', () => {
    expect(data.name).toBe('step')
    expect(data['disable-model-invocation']).toBe('true')
    expect(data.model).toBeUndefined()
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

  it('keeps the sharpened title a clean type(scope): subject — paths in seam, overrides the build scope — D68 (conventional-subjects)', () => {
    expect(body).toMatch(/type\(scope\):\s+description/) // the sharpened title stays the subject
    expect(body).toMatch(/never jammed into the title/i) // load-bearing paths stay in seam
    expect(body).toMatch(/overrides the build-default/i) // a step's own (scope) beats the default...
    expect(body).toMatch(/\*\*Scope:\*\*/) // ...that build-default `**Scope:**` header
  })
})

describe('build — the default engine: implement the planned step, then verify', () => {
  const { data, body } = parseSkill('build')

  it('names itself after its directory and disables model invocation', () => {
    expect(data.name).toBe('build')
    expect(data['disable-model-invocation']).toBe('true')
  })

  it('inherits the session model — the human steers with /model per the step rec — D62 (model-recommendation) / D63 (no-model-pins)', () => {
    expect(data.model).toBeUndefined()
  })

  it('opens with the status pre-injection, passing the invocation through', () => {
    // The injected dashboard must be computed WITH the invocation in hand: an
    // argument-blind status says `next → build step 15` while the human typed
    // `/plumbbob:build 22`, and a small model follows the louder line.
    expect(body).toContain('!`plumbbob status --invoked "$ARGUMENTS" 2>/dev/null')
  })

  it('states that the invocation outranks the injected state', () => {
    // The prose fallback for a host that never substitutes $ARGUMENTS: the
    // typed step number wins over any injected suggestion.
    expect(body).toMatch(/invocation outranks/i)
  })

  it('can implement (Edit/Write) and drive build + the verify tick + park capture', () => {
    expect(data['allowed-tools']).toMatch(/\bEdit\b/)
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
    expect(data['allowed-tools']).toContain('plumbbob build')
    expect(data['allowed-tools']).toContain('plumbbob checkpoint')
    expect(data['allowed-tools']).toContain('plumbbob park') // capture a tangent without leaving the step
  })

  it('declares itself swappable — the executor is pluggable — D3 (author-blind-executor)', () => {
    expect(body).toMatch(/swappable/i)
    expect(body).toMatch(/by hand|vibed|another harness/i)
  })

  it('cites Decisions/Constraints with their slugs in the self-review — never a bare ref', () => {
    expect(body).toMatch(/never a bare/i)
    expect(body).toMatch(/C1 \(no-new-deps\)/) // the modeled slugged cite
  })

  it('builds the decided step and captures new ideas by shelling park, not merely deferring', () => {
    expect(body).toMatch(/done.?when/i)
    expect(body).toMatch(/plumbbob park "/) // the actual capture invocation, not a promise
    expect(body).toMatch(/writes nothing/i) // deferring in words captures nothing
  })

  it('defaults to ending at the verify pause for the human to approve', () => {
    expect(body).toMatch(/pause/i)
    expect(body).toMatch(/approv/i)
  })

  it('documents --auto as the explicit self-approve opt-in that chains', () => {
    expect(body).toMatch(/--auto/)
    expect(body).toMatch(/chain|continue/i)
  })

  it('documents a step range as a bounded --auto that pauses at its top', () => {
    expect(body).toMatch(/\d+-\d+/) // e.g. `1-3`
    expect(body).toMatch(/range/i)
  })

  it('names the approval latch — a refused same-turn checkpoint IS the pause, never a raw git commit — D64 (approval-latch)', () => {
    expect(body).toMatch(/latch/i)
    expect(body).toMatch(/refus/i) // a refused checkpoint
    expect(body).toMatch(/end the turn/i) // present the diff and end the turn
    expect(body).toMatch(/git commit/) // never route around it with a raw git commit
  })

  it('forbids self-minting a settings `auto` grant — a grant you mint is no grant — D67 (auto-not-a-grant)', () => {
    expect(body).toMatch(/a grant you mint is no grant/i)
    expect(body).toMatch(/type\s+`?\/(?:plumbbob:)?build --auto`?\s+again/i) // the sanctioned route instead
  })

  it('lifts slot mechanics into a gated "Running bound agents" section, keeping the default path slim (3b)', () => {
    // (1) the consolidated section exists — all five slot passages live behind one trigger.
    expect(body).toContain('## Running bound agents')
    // (2) the default-path region (steps 1–5, from its heading to the next `## `) carries
    // no slot mechanics — only conditional pointers. A location-aware pin, not a
    // presence-anywhere one, so the slimming can't silently regress.
    const start = body.indexOf('## What this skill does, in order')
    const region = body.slice(start + 1)
    const next = region.search(/\n## /) // first top-level heading after it = ## Running bound agents
    const defaultPath = next === -1 ? region : region.slice(0, next)
    expect(defaultPath).not.toMatch(/plumbbob agent run/)
    expect(defaultPath).not.toMatch(/--mode\b/)
  })

  it('reconciles a drifted subject only at the pause — presented for approval, else the deterministic subject lands — D68 (conventional-subjects)', () => {
    expect(body).toMatch(/planned title → proposed\s+subject/) // the presented reconcile shape
    expect(body).toMatch(/-m/) // landed via the existing -m subject override
    expect(body).toMatch(/D68 \(conventional-subjects\)\]\([^)]+\)\s+refuses/) // determinism preserved — no silent agent-authored swap
  })
})

describe('build — a run hands its range section a range the plan names — D96 (plan-names-the-grant)', () => {
  const { body } = parseSkill('build')

  it('says a run hands it a range the plan names, walked the same way', () => {
    const section = body.slice(body.indexOf('### A step range'), body.indexOf('## The hard contracts'))
    expect(section).toMatch(/\/plumbbob:run/)
    expect(section).toMatch(/walked the same way/i)
    // The early-stop note names the run the card prints, not the old explicit command.
    expect(section).toContain('`· range 3 of 5: /plumbbob:run (steps 8-9)`')
  })

  it("names the stop card in its note on harvesting at a range's stop — D100 (stop-card)", () => {
    const note = body.slice(body.indexOf("**At a range's stop, harvest before the next range.**"), body.indexOf('**After an early stop'))
    expect(note).toMatch(/stop card/)
    expect(note).toContain('/plumbbob:harvest')
  })
})

describe('run — a range of the plan, walked by the build skill — D95 (run-verb), D99 (one-loop)', () => {
  const { data, body } = parseSkill('run')
  const build = parseSkill('build')

  it('names itself after its directory and disables model invocation', () => {
    expect(data.name).toBe('run')
    expect(data['disable-model-invocation']).toBe('true')
  })

  it('inherits the session model — D63 (no-model-pins)', () => {
    expect(data.model).toBeUndefined()
  })

  it('takes a range number as its one argument', () => {
    expect(data['argument-hint']).toBe('"[range-number]"')
  })

  it("grants the build skill's tools, since it drives the same loop, plus what its stop card records with", () => {
    const tools = (list: string | undefined): string[] => (list ?? '').split(/,\s*/).sort()
    const own = ['Bash(plumbbob harvest:*)', 'Bash(plumbbob order:*)', 'Bash(git log:*)']
    expect(tools(data['allowed-tools'])).toEqual([...tools(build.data['allowed-tools']), ...own].sort())
  })

  it('opens with the run header pre-injection, passing the invocation through', () => {
    expect(body).toContain('!`plumbbob status --run "$ARGUMENTS" 2>/dev/null')
  })

  it('lets the typed number and the grant outrank a header that resolved another range', () => {
    expect(body).toMatch(/typed number and the grant outrank the header/i)
    expect(body).toMatch(/unlike the run/)
  })

  it('refuses what the run cannot walk with the move the dashboard names — D97 (run-refuses)', () => {
    expect(body).toMatch(/refus/i)
    expect(body).toMatch(/No run header/)
    for (const move of ['/plumbbob:refine ranges', '/plumbbob:finish', '/plumbbob:verify', '/plumbbob:abandon', 'plumbbob spike done']) {
      expect(body, move).toContain(move)
    }
  })

  it('reads the build skill beside it from its base directory, by heading and never by line — D99 (one-loop)', () => {
    expect(body).toContain('`../build/SKILL.md`')
    expect(body).toMatch(/base directory/i)
    expect(body).not.toMatch(/SKILL\.md:\d+/)
    // Every heading it names is one the build skill carries.
    for (const heading of ['What this skill does, in order', '`--auto`: let the agent be the clock (opt-in)', 'Running bound agents', 'The hard contracts']) {
      expect(body, heading).toContain(heading)
      expect(build.body, heading).toContain(`## ${heading}`)
    }
    expect(body.replace(/\s+/g, ' ')).toContain('A step range (`N-M`, or a list like `20,5-9`) is a bounded `--auto`')
    expect(build.body).toContain('### A step range (`N-M`, or a list like `20,5-9`) is a bounded `--auto`')
  })

  it("builds a bare range to its pause, ending on its step's checkpoint block once it lands", () => {
    expect(body).toMatch(/bare range/i)
    expect(body).toMatch(/pause/i)
    expect(body).toMatch(/bare range's run\s+ends there: relay the checkpoint's block whole/)
  })

  it('ends a landed range on the stop card, written from the record and rendered by handoff --stop — D100 (stop-card)', () => {
    const section = body.slice(body.indexOf('## 5. End on the stop card'), body.indexOf('## 6. The reply at a stop'))
    expect(section).toContain('plumbbob handoff --stop')
    expect(section).toContain('# Detail · Range <N> · <the stop, as the plan words it>')
    expect(section).toContain('── recap · range <N> of <M> ──')
    // Each park is named by the handle the card prints, and the lean's punctuation is handoff's (D105 (park-handles)).
    expect(section).toContain('- P<handle> → <blocker, tangent, or pivot>: <the reason, one clause>')
    expect(section).not.toMatch(/- park <handle>/)
    expect(section).toMatch(/is `P3` whether or not the two above it are flipped/)
    expect(section).toMatch(/`no lean proposed`/)
    // The review is drawn from the record, never from recall, since a long run can compact.
    expect(section).toMatch(/checkpoint bodies/)
    expect(section).toMatch(/`## Log`/)
    expect(section).toMatch(/never from recall/)
    // Every open park gets a class, by the harvest skill's rules, tangent when uncertain.
    expect(section).toMatch(/every open park/)
    expect(section).toMatch(/`tangent` for anything uncertain/)
    // The card is the turn's ending, and nothing is recorded in the turn it printed.
    expect(section).toMatch(/record nothing in this turn/)
    // The checkpoint's block gives way to the card, even after a halt approved at the range's last step.
    expect(body).toMatch(/relay none of it, and end\s+the run on the stop card/)
    expect(body).toMatch(/the run ends on the stop card\s+too/)
    expect(body).toContain('`../harvest/SKILL.md`')
  })

  it('settles the card in one reply: looks good records it, a change re-renders it, a question ends on the reminder — D102 (settle-in-one-reply)', () => {
    const section = body.slice(body.indexOf('## 6. The reply at a stop'), body.indexOf('## The hard contracts'))
    const flat = section.replace(/\s+/g, ' ')
    expect(flat).toMatch(/\*\*`looks good`\*\* confirms the review and locks in every lean as proposed/)
    expect(flat).toMatch(/Fold each confirmed blocker into `intent.md` by the harvest skill's rules first, then run `plumbbob harvest`/)
    // A change names the park the way the card's lock-in line does (D105 (park-handles)).
    expect(section).toContain('`make P7 a tangent`')
    expect(section).not.toMatch(/park \d+ is a/)
    expect(section).toMatch(/\*\*A change\*\*[\s\S]*run `plumbbob handoff --stop`, paste the whole card/)
    expect(section).toMatch(/\*\*A question\*\*[\s\S]*one-line reminder/)
    expect(section).toContain('plumbbob handoff --stop --full')
  })

  it('records a waiting card before a run typed at it, and ends at the boundary when the record re-cut the range — D102 (settle-in-one-reply)', () => {
    expect(body).toMatch(/`waiting: range 2 of 5's stop card, recorded before the run`/)
    const section = body.slice(body.indexOf('## 6. The reply at a stop'), body.indexOf('## The hard contracts'))
    expect(section).toMatch(/Record first: fold the blockers and run `plumbbob harvest`, then read\s+`plumbbob status --run/)
    expect(section).toMatch(/`unlike the run`[\s\S]*end the turn there/)
    expect(section).toMatch(/\/plumbbob:finish/)
  })

  it('never records the stop in the turn its card printed — D103 (stop-latched)', () => {
    expect(body).toMatch(/Never run `plumbbob harvest` in the turn the stop card\s+printed/)
  })

  it("reads a run typed at a step's pause as that pause's looks good — D95 (run-verb)", () => {
    expect(body).toMatch(/that pause's\s+`looks good`/)
    expect(body).toMatch(/only\s+on green/)
  })

  it('names the latch: a refused checkpoint is the pause, never a raw git commit, and a grant you mint is no grant — D64 (approval-latch), D67 (auto-not-a-grant)', () => {
    expect(body).toMatch(/latch/i)
    expect(body).toMatch(/end the turn/i)
    expect(body).toMatch(/git commit/)
    expect(body).toMatch(/a grant you\s+mint is no grant/i)
  })

  it('never chains ranges: the human types each run', () => {
    expect(body).toMatch(/nothing chains ranges/i)
  })
})

describe('verify — the tick: check, self-review, validate, PAUSE, checkpoint', () => {
  const { data, body } = parseSkill('verify')

  it('names itself after its directory and disables model invocation', () => {
    expect(data.name).toBe('verify')
    expect(data['disable-model-invocation']).toBe('true')
  })

  it('inherits the session model — D63 (no-model-pins): judgment runs on what the human chose', () => {
    expect(data.model).toBeUndefined()
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

  it('reads the diff, not the author — D3 (author-blind-executor)', () => {
    expect(body).toMatch(/diff, not the author/i)
  })

  it('cites Decisions/Constraints with their slugs in the self-review — never a bare ref', () => {
    expect(body).toMatch(/never a bare/i)
    expect(body).toMatch(/C1 \(no-new-deps\)/) // the modeled slugged cite
  })

  it('leaves version bumps to the human (no auto /version)', () => {
    expect(body).toMatch(/version/i)
  })

  it('names the approval latch — the refusal is the pause, ended and re-ticked, never a raw git commit — D64 (approval-latch)', () => {
    expect(body).toMatch(/latch/i)
    expect(body).toMatch(/refus/i)
    expect(body).toMatch(/end the turn/i)
    expect(body).toMatch(/git commit/)
  })

  it('forbids self-minting a settings `auto` grant to force the land — D67 (auto-not-a-grant)', () => {
    expect(body).toMatch(/latch ignores a model-minted grant/i)
  })

  it('reconciles a drifted subject only at the pause — presented for approval, else the deterministic subject lands — D68 (conventional-subjects)', () => {
    expect(body).toMatch(/planned title → proposed\s+subject/) // the presented reconcile shape
    expect(body).toMatch(/-m/) // landed via the existing -m subject override
    expect(body).toMatch(/D68 \(conventional-subjects\)\]\([^)]+\)\s+refuses/) // determinism preserved — no silent agent-authored swap
  })
})

describe('refine — keep intent.md true: attack for holes + repair drift', () => {
  const { data, body } = parseSkill('refine')

  it('inherits the session model, with Read + Edit and no Write', () => {
    expect(data.model).toBeUndefined()
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

  it('names the step title-subject among the drift repair re-syncs — a clean type(scope): subject — D68 (conventional-subjects)', () => {
    expect(body).toMatch(/type\(scope\):\s+description/) // the title IS the commit subject
    expect(body).toMatch(/never jammed into the title/i) // load-bearing paths stay in seam
  })

  it('attack authors the expanded question form and walks it through in the chat (the plain/lean format)', () => {
    expect(body).toContain('*plain:*')
    expect(body).toContain('*lean:*')
    expect(body).toMatch(/per-question answers/i)
  })
})

describe('park — capture via the dumb CLI, never an edit', () => {
  const { data, body } = parseSkill('park')

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

  it('treats a human-voiced mid-build tangent as its own approval — capture directly, do not re-ask', () => {
    expect(body).toMatch(/own message.*is.*the approval|that message \*\*is\*\* the approval/i)
    expect(body).toMatch(/don't ask again|capture it directly/i)
  })

  it('composes a one-clause why into the park line so it reads cold at harvest', () => {
    expect(body).toMatch(/one-clause why/i) // the compose guidance names the why explicitly
    expect(body).toMatch(/why it's worth revisiting/i) // what it is and why it matters later
  })
})

describe('harvest — propose, the human confirms', () => {
  const { data, body } = parseSkill('harvest')

  it('inherits the session model and is DESIGN-only', () => {
    expect(data.model).toBeUndefined()
    expect(body).toMatch(/DESIGN/)
  })

  it('offers the three classes with tangent as the default', () => {
    expect(body).toMatch(/blocker/)
    expect(body).toMatch(/tangent/)
    expect(body).toMatch(/pivot signal/)
    expect(body).toMatch(/default/i)
  })

  it('proposes every class at once, and records only after one reply settles them — D102 (settle-in-one-reply)', () => {
    expect(body).toMatch(/propose/i)
    expect(body).toMatch(/every open item at once/)
    expect(body).toMatch(/one reply/)
    expect(body).toMatch(/confirm/i)
    expect(body).toMatch(/only after/i)
  })

  it('records through plumbbob harvest from a `# Detail · Harvest` file — D104 (harvest-records)', () => {
    expect(data['allowed-tools']).toContain('Bash(plumbbob harvest:*)')
    expect(data['allowed-tools']).toMatch(/\bWrite\b/)
    expect(body).toContain('`# Detail · Harvest`')
    expect(body).toContain('`- P6 → tangent: <the reason, one clause>`')
    expect(body).not.toMatch(/- park \d+ →/)
    expect(body).toContain('`make P7 a tangent`')
    expect(body).toMatch(/run `plumbbob harvest`/)
    // Outside a stop the record ends on `Recorded`, and a missing handle refuses as `P9` (D106 (leans-harvested)).
    expect(body).toContain('`**Recorded**:`')
    expect(body).toMatch(/`P9`/)
  })

  it("leaves a run's stop to its card, and refuses while one waits — D100 (stop-card)", () => {
    expect(body).toMatch(/A run's stop card\s+carries its harvest/)
    expect(body).toMatch(/`# Detail · Range <N>` header, that card is still waiting/)
  })

  it('folds a blocker into intent slugged at birth — never a bare ref', () => {
    expect(body).toMatch(/slugged at birth/i)
    expect(body).toMatch(/never a bare/i)
  })
})

describe('recover — reconcile the control plane, report before repair', () => {
  const { data, body } = parseSkill('recover')

  it('offers --fix as an argument the human types, never a default', () => {
    expect(data['argument-hint']).toContain('--fix')
    expect(body).toMatch(/only if the human asks/i)
  })

  it('separates itself from doctor (install) and revert (destructive rewind)', () => {
    expect(body).toMatch(/doctor/)
    expect(body).toMatch(/\/(?:plumbbob:)?revert/)
    expect(body).toMatch(/never restores lost work|not a rewind/i)
  })

  it('keeps spike leftovers report-only — the model must not run the removals', () => {
    expect(body).toMatch(/reported, never removed/i)
    expect(body).toMatch(/do not run them yourself/i)
  })

  it('pins what --fix may not touch, so the boundary is stated where it is read', () => {
    expect(body).toMatch(/never touches intent\.md/i)
    expect(body).toMatch(/git history/)
  })
})

describe('doctor — a headless-safe thin driver for `plumbbob doctor`', () => {
  const { data, body } = parseSkill('doctor')

  it('injects a single granted command so the report survives headless `-p`', () => {
    // The old compound `if command -v plumbbob …; then … fi` led with `command -v`,
    // which is not in allowed-tools, so `-p`'s permission-gate dropped the whole
    // injection silently. Lead with the granted verb (like status) instead.
    expect(body).toContain('!`plumbbob doctor')
    expect(body).not.toContain('command -v') // the un-granted guard that died in -p
    expect(body).not.toContain('!`if ') // no compound if…fi injection
    expect(data['allowed-tools']).toMatch(/Bash\(plumbbob doctor/)
  })

  it('recovers in prose when the injection does not render', () => {
    expect(body).toMatch(/run\s+`plumbbob doctor`\s+yourself/i)
    expect(body).toMatch(/command not found/i) // names the not-on-PATH signal + its fix
  })
})

// plumbbob-report and plumbbob-docs were folded into /plumbbob:finish — D9 (finish-no-gate) — and removed.
// plumbbob-interrogate was renamed /plumbbob:refine and broadened (attack + repair);
// report/docs do not survive.

describe('the build order — step, refine, and harvest re-sequence through the verb, never by renumbering', () => {
  for (const dir of ['step', 'refine', 'harvest'] as const) {
    it(`${dir} grants and shells plumbbob order`, () => {
      const { data, body } = parseSkill(dir)
      expect(data['allowed-tools']).toMatch(/Bash\(plumbbob order/)
      expect(body).toContain('plumbbob order')
      expect(body).toContain('## Build order')
    })
  }
})

describe('a new step never joins a landed range — D92 (build-ranges)', () => {
  /** A skill's body with its line breaks folded to spaces. */
  const flat = (dir: string): string => parseSkill(dir).body.replace(/\s+/g, ' ')

  for (const dir of ['step', 'refine', 'harvest'] as const) {
    it(`${dir} places it in a range still to come, keeping every item's number`, () => {
      expect(flat(dir)).toMatch(/never a range that has landed, since that range's call was made and the step would reopen it/)
      expect(flat(dir)).toContain('A new range takes the next free item number, and no item is renumbered')
    })
  }

  it('run keeps a blocker out of the range its card reviews when looks good records it', () => {
    const section = flat('run').slice(flat('run').indexOf('## 6. The reply at a stop'))
    expect(section).toMatch(/goes into a range still to come, or a bare range of its own, never into the range this card reviews/)
  })

  it('run and finish move a step that joined the landed range, then record again without re-rendering the card', () => {
    const run = flat('run')
    expect(run).toContain('`step 13 joined it after it landed`')
    expect(run).toMatch(/leave `\.plumbbob\/detail\.md` as it is, fold nothing again, and run `plumbbob harvest` once more in the same turn/)
    const finish = flat('finish')
    expect(finish).toContain('`step 13 joined it after it landed`')
    expect(finish).toMatch(/leave the detail file as it is, fold nothing again, and run `plumbbob harvest` once more/)
  })
})
