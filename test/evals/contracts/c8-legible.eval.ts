// Contract 8 — legible intent (prose-governed, like 5 and 6). One measured
// `/plumbbob:plan` turn against an unplanned session, then a mechanical read of
// the authored intent.md: every Decision reads `D<n> (kebab-slug): …` and every
// Constraint `C<n> (kebab-slug): …`, never a bare `D1: …`. The glossed-reference
// style ships only as prose — templates/intent.md models it and skills/plan
// teaches it — so this contract is what turns that guidance from asserted into
// measured. (research/08-intent-legibility.md R2; postdates Plan 05's table.)
//
// The fixture keeps the real `start` scaffold, whose placeholder bullets are
// already perfect house style — so slug checks alone would pass an idle run.
// Validity carries that weight: an unchanged intent, or a section with no
// placeholder-free bullet, is `invalid`. A placeholder left BESIDE authored
// bullets is a required failure, not invalid — that is sloppy authoring, not
// non-engagement.

import {
  bareRefs,
  bulletLabel,
  check,
  checkpointLines,
  hasTemplatePlaceholder,
  info,
  intentBoxes,
  intentSectionBullets,
  snapshot,
  unledgeredCommits,
  validity,
} from '../helpers/assert.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import type { Contract } from './contract.ts'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// Three decisions and two constraints are handed over already settled, so the
// turn has real items to record and no reason to interview — what is measured
// is the FORM they land in, not whether the model can decide well.
const C8_PROMPT = [
  '/plumbbob:plan Add a tiny rate limiter to the greeting service: a sliding window,',
  '5 requests per minute per caller, in-memory only, returning a plain',
  '{ allowed, retryAfterMs } object from a single new module src/limit.js, checked by',
  'node check.js. I have already decided all three of these: a sliding window over fixed',
  'buckets (fairness at the window edge), an in-memory Map over any external store (this',
  'stays dependency-free), and a pure-function API over a class (callers hold the state).',
  'Two hard rules: no new dependencies, and src/limit.js is the only new source file.',
  'Everything is decided — do not interview me and do not ask questions; author the',
  'complete intent.md (Frame, Decisions, Constraints, Steps) in this one pass, then stop.',
  'Do not write any source code.',
].join(' ')

// The plan skill's own frontmatter allows Read/Edit/Write plus its four verbs;
// no git and no node are needed to author a plan, so they stay out — a narrower
// grant than BUILD_SESSION_TOOLS.
const C8_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash(plumbbob:*)'].join(',')

// Bullets that carry no `D#`/`C#` label at all, or carry one with no slug.
function unglossed(bullets: ReadonlyArray<string>, letter: 'D' | 'C'): ReadonlyArray<string> {
  return bullets.filter((b) => {
    const label = bulletLabel(b)
    return label === null || label.letter !== letter || label.slug === null
  })
}

function authored(bullets: ReadonlyArray<string>): ReadonlyArray<string> {
  return bullets.filter((b) => !hasTemplatePlaceholder(b))
}

function head(bullets: ReadonlyArray<string>): string | undefined {
  const first = bullets[0]
  return first === undefined ? undefined : `first: ${first.slice(0, 72)}`
}

export const c8: Contract = {
  id: 'c8',
  title: 'legible intent',
  makeFixture: () =>
    makeEvalFixture({ steps: [], gate: 'green', intent: 'template', title: 'Greeting rate limiter' }),
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)

    const turn1 = await session.turn(C8_PROMPT, { allowedTools: C8_TOOLS })
    const t1 = snapshot(repo)

    const decisions = intentSectionBullets(repo, 'Decisions')
    const constraints = intentSectionBullets(repo, 'Constraints')
    const questions = intentSectionBullets(repo, 'Open questions')
    const placeheld = [...decisions, ...constraints].filter(hasTemplatePlaceholder)
    const slugs = [...decisions, ...constraints].flatMap((b) => {
      const slug = bulletLabel(b)?.slug
      return slug === undefined || slug === null ? [] : [slug]
    })
    const refs = bareRefs(t1.intent)
    const builds = readdirSync(join(repo, '.plumbbob', 'builds'))

    return {
      turns: [turn1],
      checks: [
        validity('it engaged (intent.md rewritten)', t1.intent !== t0.intent),
        validity(
          'authored real Decisions (≥1 placeholder-free bullet)',
          authored(decisions).length > 0,
          `${decisions.length} bullet(s), ${authored(decisions).length} authored`,
        ),
        validity(
          'authored real Constraints (≥1 placeholder-free bullet)',
          authored(constraints).length > 0,
          `${constraints.length} bullet(s), ${authored(constraints).length} authored`,
        ),
        check(
          'every Decisions bullet glossed D<n> (kebab-slug)',
          unglossed(decisions, 'D').length === 0,
          head(unglossed(decisions, 'D')),
        ),
        check(
          'every Constraints bullet glossed C<n> (kebab-slug)',
          unglossed(constraints, 'C').length === 0,
          head(unglossed(constraints, 'C')),
        ),
        check(
          'no template placeholders survive in Decisions/Constraints',
          placeheld.length === 0,
          head(placeheld),
        ),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        info(
          'slugs read two+ words (hyphenated)',
          slugs.every((s) => s.includes('-')),
          `single-word: ${slugs.filter((s) => !s.includes('-')).join(', ')}`,
        ),
        info('no bare D#/C# references elsewhere (decay probe)', refs.length === 0, refs.join(', ')),
        info(
          'Q openers glossed too',
          questions.every((q) => {
            const label = bulletLabel(q)
            return label === null || label.letter !== 'Q' || label.slug !== null
          }),
        ),
        info('authored a Steps list (boxes parse)', intentBoxes(repo).size > 0),
        info(
          'plan checkpoint landed (latch-legal either way)',
          checkpointLines(repo).some((line) => line.kind === 'plan'),
        ),
        info('single build dir (no restart)', builds.length === 1, builds.join(', ')),
      ],
    }
  },
}
