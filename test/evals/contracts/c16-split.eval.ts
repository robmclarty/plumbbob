// Contract 16 — a wide step carries its split (prose-governed, like 8 and 15).
// One measured `/plumbbob:plan` turn against an unplanned session whose
// personal overlay sets `orchestration: host` beside `grain: coarse`, then a
// mechanical read of the authored intent.md: the step that holds the format
// modules carries a `- note:` line, where the plan skill writes the split the
// builder hands to sub-agents. The setting reaches the model as
// prose twice: the `orchestration` line `plumbbob status` prints into the
// skill's state, and the plan skill's passage on writing the split. Nothing in
// the CLI asks for the note (D167 (host-orchestration)), so this contract is
// what turns that guidance from asserted into measured.
//
// It measures the plan's half alone. Whether a build then hands the slices to
// sub-agents is read from a transcript's tool calls, which no helper here
// reads yet, so that half is unmeasured.
//
// The work handed over is three parts that share one small interface: the
// format modules, the flag that picks one, and the page that lists them. Only
// the formats split: three modules and a registry, each with its test, that
// can be built apart once `format(greeting)` is agreed. So the required check
// reads the step whose seam reaches `src/format/`, however the seam names it
// (eight files, or one `dir/` grant). The first sweep (2026-11-21-split) asked
// every step of two seam entries or more for a note instead; that counted a
// module and its test, one slice, as wide, and missed a single grant holding
// four slices, so it survives as an info row.
//
// The control. `PLUMBBOB_EVAL_ORCHESTRATION=off` runs the same prompt with the
// grain alone, so the same required check reads how often a wide step gets a
// note with no setting asking for one. Run it under its own `--date` key: a
// control run is a different instrument, and its fails are the measurement.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, info, snapshot, stepNotes, stepSeams, unledgeredCommits, validity } from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import type { Contract } from './contract.ts'

// What the fixture sets: `host` unless the control arm asks for `off`, which
// leaves the key out and keeps the coarse grain.
const ORCHESTRATION = process.env.PLUMBBOB_EVAL_ORCHESTRATION === 'off' ? 'off' : 'host'

const C16_PROMPT = [
  '/plumbbob:plan Add three output formats to the greeting service, with a flag to pick one.',
  'Three parts. The formats: one module each under src/format/ (json.js, text.js, csv.js)',
  'exporting format(greeting), each with a test beside it, and src/format/index.js',
  'registering the three by name. The flag: src/cli/ gains a --format option that looks a',
  'format up in that registry, with its own tests. The docs: docs/formats.md lists the',
  'three and shows the flag. All of it is checked by node check.js.',
  'I have already decided: one module per format over one module with a switch (a format',
  'can be added without touching the others), plain functions over classes, and no new',
  'dependencies. Keep the plan as short as it can honestly be.',
  'Everything is decided — do not interview me and do not ask questions; author the',
  'complete intent.md (Frame, Decisions, Constraints, Steps) in this one pass, then stop.',
  'Do not write any source code.',
].join(' ')

// The plan skill's own frontmatter allows Read/Edit/Write plus its verbs, as
// in contracts 8 and 15.
const C16_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash(plumbbob:*)'].join(',')

export const c16: Contract = {
  id: 'c16',
  title: 'a wide step carries its split',
  makeFixture: () => {
    const fixture = makeEvalFixture({ steps: [], gate: 'green', intent: 'template', title: 'Greeting formats' })
    // The personal overlay, where a developer sets both keys for the harness
    // they run; untracked, so the fixture's commit does not carry it.
    const overlay = ORCHESTRATION === 'host' ? { grain: 'coarse', orchestration: 'host' } : { grain: 'coarse' }
    writeFileSync(join(fixture.repo, '.plumbbob', 'settings.local.json'), `${JSON.stringify(overlay, null, 2)}\n`)
    return fixture
  },
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)

    const turn1 = await session.turn(C16_PROMPT, { allowedTools: C16_TOOLS })
    const t1 = snapshot(repo)

    const seams = [...stepSeams(repo)]
    const notes = stepNotes(repo)
    const noted = (n: number): boolean => (notes.get(n) ?? []).length > 0
    const formats = seams.filter(([, seam]) => seam.some((entry) => entry.startsWith('src/format')))
    const wide = seams.filter(([, seam]) => seam.length >= 2)
    const split = wide.filter(([n]) => noted(n))
    // A note that names its slices by path cites at least two of the step's
    // own seam entries.
    const byPath = split.filter(([n, seam]) => seam.filter((entry) => (notes.get(n) ?? []).join(' ').includes(entry)).length >= 2)

    return {
      turns: [turn1],
      checks: [
        validity('it engaged (intent.md rewritten)', t1.intent !== t0.intent),
        validity(
          'authored a plan with a step reaching src/format/',
          formats.length > 0,
          `${seams.length} step(s), ${formats.length} reaching src/format/`,
        ),
        check(
          'the step holding the formats carries a `- note:` line',
          formats.length > 0 && formats.every(([n]) => noted(n)),
          formats.length === 0 ? undefined : `step ${formats.map(([n]) => `${n} ${noted(n) ? 'noted' : 'not noted'}`).join(', step ')}`,
        ),
        info('every step of two seam entries or more carries a note', wide.length > 0 && split.length === wide.length, `${split.length} of ${wide.length} noted`),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        info(`orchestration: ${ORCHESTRATION}`, true),
        info('a note names two of its step\'s seam entries', byPath.length > 0, `${byPath.length} of ${split.length} note(s)`),
        info('the plan is cut coarse (three steps at most)', seams.length <= 3, `${seams.length} step(s)`),
        // The plan pause is the one tier the model still writes above, as in
        // contract 8: its block is the tail anatomyChecks cuts to.
        ...anatomyChecks(turn1.content, 'plan'),
      ],
    }
  },
}
