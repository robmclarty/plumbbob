// Contract 15 — steps cut to the grain (prose-governed, like 5, 6 and 8). One
// measured `/plumbbob:plan` turn against an unplanned session whose personal
// overlay sets `grain: fine`, then a mechanical read of the authored intent.md:
// every step's seam names 3 paths at most. The grain reaches the model two
// ways, both prose: the `grain` line `plumbbob status` prints into the skill's
// state, and the plan skill's passage on cutting steps to it. Nothing in the
// CLI refuses a wide step (D165 (grain)), so this contract is what turns that
// guidance from asserted into measured.
//
// The work handed over is eight files that split two ways: by kind (three
// modules, three tests, a registry and a doc, so two or three wide steps) or by
// format (one narrow step each). The prompt asks for a short plan, which leans
// a plan cut with no grain toward the wide split, and names no step shape.
//
// The control. `PLUMBBOB_EVAL_GRAIN=default` runs the same prompt with no
// overlay, so the same required check reads how often a plan comes out wide
// with no grain set. Run it under its own `--date` key: a control run is a
// different instrument, and its fails are the measurement, not a regression.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, info, snapshot, stepSeams, unledgeredCommits, validity } from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import type { Contract } from './contract.ts'

// The most paths a step's seam names under `grain: fine`.
const FINE_LIMIT = 3

// The grain the fixture sets: `fine` unless the control arm asks for `default`,
// which writes no overlay at all.
const GRAIN = process.env.PLUMBBOB_EVAL_GRAIN === 'default' ? 'default' : 'fine'

const C15_PROMPT = [
  '/plumbbob:plan Add three output formats to the greeting service: json, text and csv.',
  'Each format is one module under src/format/ (json.js, text.js, csv.js) exporting a single',
  'format(greeting) function, with a test file beside it (json.test.js, text.test.js,',
  'csv.test.js). src/format/index.js registers the three by name, and README.md gains a',
  'short section listing them. That is eight files in all, checked by node check.js.',
  'I have already decided: one module per format over one module with a switch (a format',
  'can be added without touching the others), plain functions over classes, and no new',
  'dependencies. Keep the plan as short as it can honestly be.',
  'Everything is decided — do not interview me and do not ask questions; author the',
  'complete intent.md (Frame, Decisions, Constraints, Steps) in this one pass, then stop.',
  'Do not write any source code.',
].join(' ')

// The plan skill's own frontmatter allows Read/Edit/Write plus its verbs; no
// git and no node are needed to author a plan, as in contract 8.
const C15_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash(plumbbob:*)'].join(',')

export const c15: Contract = {
  id: 'c15',
  title: 'steps cut to the grain',
  makeFixture: () => {
    const fixture = makeEvalFixture({ steps: [], gate: 'green', intent: 'template', title: 'Greeting formats' })
    if (GRAIN !== 'default') {
      // The personal overlay, where a developer sets the grain for the model
      // they run; untracked, so the fixture's commit does not carry it.
      writeFileSync(join(fixture.repo, '.plumbbob', 'settings.local.json'), `${JSON.stringify({ grain: GRAIN }, null, 2)}\n`)
    }
    return fixture
  },
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)

    const turn1 = await session.turn(C15_PROMPT, { allowedTools: C15_TOOLS })
    const t1 = snapshot(repo)

    const seams = [...stepSeams(repo)]
    const seamed = seams.filter(([, seam]) => seam.length > 0)
    const wide = seamed.filter(([, seam]) => seam.length > FINE_LIMIT)
    const widest = Math.max(0, ...seamed.map(([, seam]) => seam.length))

    return {
      turns: [turn1],
      checks: [
        validity('it engaged (intent.md rewritten)', t1.intent !== t0.intent),
        validity(
          'authored a plan with seams (≥2 steps, each naming a path)',
          seams.length >= 2 && seamed.length === seams.length,
          `${seams.length} step(s), ${seamed.length} with a seam`,
        ),
        check(
          `every step's seam names ${FINE_LIMIT} paths at most`,
          wide.length === 0,
          wide.length === 0 ? undefined : `step ${wide.map(([n, seam]) => `${n} names ${seam.length}`).join(', step ')}`,
        ),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        info(`grain: ${GRAIN}`, true),
        info('the plan runs past two steps', seams.length > 2, `${seams.length} step(s), the widest seam names ${widest}`),
        // The plan pause is the one tier the model still writes above, as in
        // contract 8: its block is the tail anatomyChecks cuts to.
        ...anatomyChecks(turn1.content, 'plan'),
      ],
    }
  },
}
